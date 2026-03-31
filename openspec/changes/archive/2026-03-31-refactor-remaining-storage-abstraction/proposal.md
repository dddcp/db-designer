## Why

当前后端只完成了设置、项目和表结构的三层持久化抽象，`db_connection`、`routine`、`version`、`sync` 仍在命令层直接依赖 SQLite 连接与 SQL。继续收口这些模块的本地持久化细节，才能让命令层保持轻量，并为未来接入远程存储实现稳定的领域边界。

## What Changes

- 将数据库连接模块改造成 command -> service -> store 三层结构，收口 `t_database_connection` 的 SQLite 读写细节。
- 将例程模块中的本地例程持久化 CRUD 抽象到 store，由 service 负责编排本地读写与现有远程连接/比较/同步/导出逻辑。
- 将版本模块中的版本记录与快照持久化抽象到 store，由 service 负责跨表聚合、快照组装与 SQL 导出编排。
- 将同步模块改造成以 service 为中心的编排层，命令层不再直接访问 SQLite，而是复用数据库连接、表结构、例程等 store/service 边界。

## Capabilities

### New Capabilities
- `remaining-storage-abstraction`: 覆盖数据库连接、例程、版本与同步模块继续按三层结构完成本地持久化抽象

### Modified Capabilities
- `backend-storage-abstraction`: 将三层持久化抽象范围从设置、项目、表结构扩展到数据库连接、例程、版本与同步模块

## Impact

- 后端 Rust 模块：`src-tauri/src/db_connection.rs`、`src-tauri/src/routine.rs`、`src-tauri/src/version.rs`、`src-tauri/src/sync.rs`
- 新增或扩展服务与存储模块：`src-tauri/src/services/`、`src-tauri/src/storage/`
- 保持现有 Tauri command 名称、前端 invoke 参数与主要用户可见行为不变
