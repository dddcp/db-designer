## Why

当前后端持久化逻辑直接在 Tauri command 中依赖 SQLite 连接与 SQL，导致命令层、业务编排层、存储实现层耦合严重。为了后续支持远程存储并降低改造成本，需要先将持久化能力重构为 command -> service -> store 的三层结构。

## What Changes

- 为后端持久化引入三层结构：Tauri command、service/use case、domain store trait/implementation。
- 将 `setting.rs`、`project.rs`、`table.rs` 从“命令 + 业务 + SQL”混合结构，拆分为薄命令层和可替换的存储实现。
- 新增 SQLite store 实现，收口 `rusqlite::Connection`、事务和 SQL 细节，不再让命令层直接依赖 SQLite 类型。
- 保持现有前端调用的 Tauri command 名称和返回行为不变，避免引入前端破坏性改动。
- 为未来接入 MySQL/PostgreSQL 远程存储预留统一的 store 扩展边界，但本次不实现远程存储。

## Capabilities

### New Capabilities
- `backend-storage-abstraction`: 规范后端命令层、服务层、存储层之间的职责边界，并要求当前 SQLite 持久化通过可替换的 store 实现提供。

### Modified Capabilities
- `local-app-settings`: 将本地设置与 SQLite 设置的持久化访问迁移到抽象存储层，但保持现有设置功能与对外行为不变。

## Impact

- 影响后端模块：`src-tauri/src/lib.rs`、`src-tauri/src/db.rs`、`src-tauri/src/setting.rs`、`src-tauri/src/project.rs`、`src-tauri/src/table.rs`
- 新增后端模块：service 层与 storage/store 层相关文件
- 不改变现有前端 IPC 调用方式
- 不新增第三方依赖为目标，优先复用现有 `rusqlite` 与模型定义
