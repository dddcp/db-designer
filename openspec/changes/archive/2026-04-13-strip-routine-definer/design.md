## Context

当前 MySQL 的 `SHOW CREATE FUNCTION/PROCEDURE/TRIGGER` 返回的 DDL 中始终包含 `DEFINER=<user>@<host>` 子句。这个子句是环境相关的元数据（与数据库用户绑定），而非 routine 的逻辑定义。

现有代码在以下环节直接使用原始 body，未做任何归一化处理：
- `dialect.rs` 中 `MysqlConnector::get_remote_routines()` 直接存储 `SHOW CREATE` 的原始输出
- `routine_service.rs` 中 `compare_routines()` 使用 `body.trim()` 简单比较
- `routine_service.rs` 中 `sync_remote_routine_to_local()` 直接复制远端 body
- `version_service.rs` 中版本间 routine diff 使用 `body != body` 比较

这导致跨环境对比时产生误报：逻辑完全相同的 routine 因 DEFINER 不同而始终标记为 "different"。

## Goals / Non-Goals

**Goals:**
- 消除因 MySQL DEFINER 子句导致的 routine 对比误报
- 在拉取、对比、同步、版本 diff、SQL 导出五个环节统一归一化处理
- 兼容历史遗留数据（本地已存储含 DEFINER 的 body）
- 不影响 PostgreSQL 和 Oracle 方言

**Non-Goals:**
- 不处理 SQL SECURITY 子句（属于逻辑定义，不应剥离）
- 不处理字符集/排序规则子句（属于逻辑定义）
- 不在导出 SQL 时自动添加 DEFINER（由用户自行决定）
- 不修改前端 UI 或数据模型

## Decisions

### 决策 1：在拉取时剥离 DEFINER，而非仅对比时忽略

**选择**：在 `get_remote_routines` 拉取时就剥离 DEFINER，同时在对比时也做 normalize（双保险）。

**理由**：
- 拉取时剥离保证存储的 body 本身就是干净的，后续所有环节都受益
- 对比时也 normalize 是为了兼容历史遗留数据（之前的版本同步进来的 body 含 DEFINER）
- 如果只在对比时处理，存储的 body 仍含 DEFINER，导出 SQL 时也会带别人的用户名

**备选方案**：仅对比时 normalize、存储保留原始 → 导出 SQL 会带错误 DEFINER，不采纳。

### 决策 2：使用正则剥离 DEFINER 子句

**选择**：使用正则 `(?i)CREATE\s+DEFINER\s*=\s*\S+\s+` 替换为 `CREATE `。

**理由**：
- MySQL 的 DEFINER 子句格式固定：`DEFINER=<user>@<host>`，紧跟在 `CREATE` 之后
- 正则处理简洁可靠，覆盖各种空格变体
- 只需处理 MySQL dialect，PostgreSQL 和 Oracle 的 `SHOW CREATE` 不产生此子句

**正则细节**：

原始设计使用 `(?i)CREATE\s+DEFINER\s*=\s*\S+\s+`，但此正则对反引号包裹的 user@host 处理不够精确。MySQL 的 DEFINER 值通常用反引号包裹（如 `` `root`@`10.0.70.%` ``），`\S+` 虽然能匹配，但会在 `@` 处将整个 `` `user`@`host` `` 视为一个 token，可能在边界情况下出错。

**改进后的正则**：
```
(?i)CREATE\s+DEFINER\s*=\s*(?:`[^`]*`|[^\s@]+)@(?:`[^`]*`|[^\s]+)\s+
```

此正则同时兼容有反引号和无反引号两种格式：
```
输入:  CREATE DEFINER=`root`@`10.0.70.%` FUNCTION calc_tax...
输出:  CREATE FUNCTION calc_tax...

输入:  CREATE DEFINER=root@localhost PROCEDURE do_something...
输出:  CREATE PROCEDURE do_something...
```

### 决策 3：normalize 函数放在 dialect.rs

**选择**：在 `dialect.rs` 中新增 `pub fn normalize_routine_body(body: &str, db_type: &str) -> String`。

**理由**：
- DEFINER 剥离是数据库方言相关的行为，放在 dialect 模块语义最清晰
- 函数根据 `db_type` 判断是否需要处理，MySQL 剥离，其他直接返回
- 便于未来扩展其他方言的归一化需求

**边界情况：`db_type` 为 None**：
- 快照中 `RoutineDef.db_type` 是 `Option<String>`，可能为 `None`
- 当 `db_type` 为 `None` 时，保守处理：不做 normalize，直接返回原始 body
- 调用方需在传入前处理 `Option`，如 `r.db_type.as_deref().unwrap_or("")`，空字符串不会触发 MySQL 分支

### 决策 4：导出 SQL 时不自动添加 DEFINER

**选择**：导出时使用归一化后的 body（不含 DEFINER），不提供自动添加选项。

**理由**：
- 大多数部署场景下不应硬编码 DEFINER，应由目标数据库的默认用户决定
- 如果用户需要指定 DEFINER，可在 body 中手动添加
- 增加配置选项会过度设计，当前需求不支持此场景

## Risks / Trade-offs

- **[风险] 正则误匹配**：如果 body 内容中恰好包含类似 `DEFINER=` 的字符串（如在字符串字面量中），可能被错误剥离 → 缓解：正则锚定 `CREATE` 关键字开头，且 DEFINER 子句格式非常特殊，误匹配概率极低
- **[风险] 历史数据迁移**：本地已有的含 DEFINER 的 routine body 不会被自动清理 → 缓解：对比时双端 normalize，不影响功能正确性；导出时也 normalize，确保输出 SQL 干净；用户下次同步时会自动替换为干净 body
- **[权衡] 导出 SQL 不含 DEFINER**：部分用户可能期望导出时保留原 DEFINER → 可在后续版本中增加配置项支持，当前优先解决误报问题

## 已知缺口

- **`export_project_sql` 未导出 routines**：`version_service.rs` 的 `export_project_sql` 方法当前只导出表结构 SQL，不包含 routines。本次变更不涉及此方法，但未来如果为其增加 routines 导出，需同样应用 normalize 处理。此为已有缺陷，不在本次变更范围内。
- **`regex` crate 已 import 但未使用**：`dialect.rs` 第 1 行已有 `use regex::Regex;` 但当前未使用，会产生编译警告。实现 `normalize_routine_body` 后此警告自然消除。
