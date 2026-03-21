## Context

编程对象（函数/存储过程/触发器）当前在 `t_routine` 表中以原始 SQL 文本形式存储，没有 `db_type` 字段。表结构通过 `DatabaseDialect` trait 支持多数据库 SQL 生成，但编程对象因为语法差异巨大无法自动转换。

当前状态：
- `t_routine` 表：`id, project_id, name, type, body, comment, created_at, updated_at`
- `RoutineDef` 结构体无 `db_type` 字段
- `export_routines_sql` 只接收 `project_id`，直接输出全部 body
- `compare_routines` 和 `sync_remote_routine_to_local` 按 `name + type` 匹配
- 前端 `routine-tab.tsx` 明确标注"并没有区分数据库类型"

## Goals / Non-Goals

**Goals:**
- 每条 routine 记录可标记目标数据库类型
- 同名同类型的 routine 可以存在多条记录（每种 db_type 一条）
- SQL 导出按数据库类型过滤
- 远程同步自动标记来源数据库类型
- 旧数据平滑兼容，无破坏性

**Non-Goals:**
- 跨数据库 SQL 自动转换
- Routine 版本 diff
- 结构化建模（参数、返回值拆分）
- 在 `DatabaseDialect` trait 中增加 routine 生成方法

## Decisions

### 1. Flat 模式而非拆表

**选择**：在 `t_routine` 上加 `db_type TEXT` 列，同一逻辑 routine 的不同 DB 实现是独立的行。

**替代方案**：
- 拆表（`t_routine` + `t_routine_body`）：概念更清晰，但增加 JOIN 复杂度、需要新表和数据迁移、前端数据结构变化大
- JSON body（`bodies: {"mysql": "...", "pg": "..."}`）：大段 SQL 存 JSON 处理不便，SQLite 操作 JSON 内部字段不方便

**理由**：Flat 模式与项目现有风格一致（务实简洁），migration 只需 `ALTER TABLE ADD COLUMN`，CRUD 逻辑改动最小，远程同步天然契合。

### 2. db_type 允许 NULL

**选择**：`db_type` 列 nullable，旧数据默认 NULL。

**理由**：
- 避免强制用户在升级时批量指定旧数据的 db_type
- NULL 在导出时也一并输出（不丢失数据）
- 前端显示为"未指定"标签，用户可自行编辑补充

### 3. 匹配逻辑升级为 name + type + db_type

**选择**：`compare_routines` 接收 `db_type` 参数，只与本地同 db_type 的 routine 比较。`sync_remote_routine_to_local` 的 UPSERT 按 `project_id + name + type + db_type` 定位。

**理由**：远程连接本身就是特定数据库类型的，按 db_type 隔离比较是自然的。避免 MySQL 的实现覆盖 PostgreSQL 的实现。

### 4. 导出时 NULL db_type 也输出

**选择**：`export_routines_sql(project_id, database_type)` 输出 `db_type = database_type` 和 `db_type IS NULL` 的记录。

**理由**：旧数据不应因为没有 db_type 就导出时消失。NULL 的记录加注释提示"未指定数据库类型"。

### 5. 版本快照自然扩展

**选择**：`RoutineDef` 加 `#[serde(default)]` 的 `db_type: Option<String>`，快照格式自动包含。

**理由**：旧快照反序列化时 db_type 为 None，完全向后兼容。`export_version_sql` 遍历快照 routines 时按 db_type 过滤即可。

## Risks / Trade-offs

**[SQLite UNIQUE 约束与 NULL]** → SQLite 中 `UNIQUE(project_id, name, type, db_type)` 对 NULL 的处理：每个 NULL 视为不同值，不会冲突。因此旧数据中同名同类型的 routine（db_type 都是 NULL）不会触发唯一约束冲突。但也意味着 NULL 状态下无法在 DB 层防重复。在应用层的 UPSERT 逻辑中处理即可。

**[comment 可能重复]** → Flat 模式下同一逻辑 routine 的多条记录各有自己的 comment。实际不是大问题——不同 DB 的实现说明可能本就略有不同。

**[列表膨胀]** → 如果一个 routine 有 3 种 DB 实现就有 3 行。通过前端的过滤器（按 db_type 筛选）缓解，不做分组折叠（复杂度不值得）。

**[旧数据 NULL 的长期存在]** → 用户可能一直不补充 db_type。可接受——NULL 的 routine 在导出时仍然输出，功能不受影响。
