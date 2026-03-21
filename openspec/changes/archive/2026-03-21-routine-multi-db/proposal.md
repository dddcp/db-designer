# Proposal: 编程对象支持多数据库类型

## 概述

为编程对象（函数/存储过程/触发器）增加 `db_type` 字段，使同一个逻辑 routine 可以针对不同数据库（MySQL、PostgreSQL、Oracle）维护各自的 SQL 实现。

## 背景

当前编程对象不区分数据库类型，body 只是一段原始 SQL 文本。但表结构已经通过 Dialect 系统支持多数据库导出。编程对象因为语法差异巨大（函数体、变量声明、控制流完全不同），无法像表结构那样自动转换，需要用户为每种数据库分别维护实现。

## 方案

**Flat 模式**：在 `t_routine` 表上新增 `db_type` 列（nullable），同名同类型的 routine 可以有多条记录，每条对应一种数据库类型。

```
t_routine
┌────┬────────────┬────────────┬──────────┬───────────┬──────┬─────────┐
│ id │ project_id │ name       │ type     │ db_type   │ body │ comment │
├────┼────────────┼────────────┼──────────┼───────────┼──────┼─────────┤
│ 1  │ 1          │ calc_total │ function │ mysql     │ ... │ 计算总额 │
│ 2  │ 1          │ calc_total │ function │ postgresql│ ... │ 计算总额 │
│ 3  │ 1          │ audit_log  │ trigger  │ mysql     │ ... │ 审计日志 │
└────┴────────────┴────────────┴──────────┴───────────┴──────┴─────────┘
```

旧数据 `db_type` 为 NULL，由用户手动补充。

## 不做的事

- 不做 routine 的跨数据库自动转换（语法差异太大）
- 不做 routine 的版本 diff（暂时太复杂）
- 不做结构化建模（参数、返回值拆分）

## 涉及范围

### Backend (Rust)

| 文件 | 改动 |
|------|------|
| `db.rs` | Migration: `ALTER TABLE t_routine ADD COLUMN db_type TEXT` |
| `models.rs` | `RoutineDef` 增加 `db_type: Option<String>`（`#[serde(default)]`） |
| `routine.rs` | CRUD 操作带 `db_type`；`export_routines_sql` 增加 `database_type` 参数过滤；`sync_remote_routine_to_local` 自动标记来源 db_type；`compare_routines` 按 db_type 过滤匹配 |
| `version.rs` | `export_version_sql` 遍历 snapshot routines 时按 db_type 过滤输出 |

### Frontend (TypeScript/React)

| 文件 | 改动 |
|------|------|
| `types/index.ts` | `RoutineDef` 增加 `dbType?: string` |
| `routine-tab.tsx` | 编辑 Drawer 增加数据库类型选择器；列表增加 db_type 标签和过滤器；SQL 导出增加数据库类型选择 |
| `sync-routine-diff.tsx` | 比较时传入 db_type；显示 db_type 信息 |

### 数据兼容

- 旧数据 `db_type = NULL`，前端显示为"未指定"
- 旧版本快照反序列化时 `db_type` 默认为 `None`，无破坏性
- 导出 SQL 时 `db_type` 为 NULL 的 routine 也一并输出，不丢失

### 关键逻辑变更

**远程同步匹配**：`compare_routines` 按 `name + type + db_type` 匹配（db_type 由连接的数据库类型决定）

**SQL 导出过滤**：`export_routines_sql(project_id, database_type)` 只输出 `db_type` 匹配的 routine（NULL 的也输出）

**UPSERT 定位**：`sync_remote_routine_to_local` 按 `project_id + name + type + db_type` 查找已有记录
