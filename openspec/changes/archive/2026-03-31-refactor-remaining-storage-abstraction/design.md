## Context

当前后端已经为设置、项目、表结构建立了 command -> service -> store 三层结构，但 `db_connection.rs`、`routine.rs`、`version.rs`、`sync.rs` 仍保留大量命令层直连 SQLite 的实现。其中特别是 `routine`、`version`、`sync` 同时包含本地持久化、远程连接编排、差异比较与 SQL 导出等职责，如果继续在命令层内扩展，会让未来接入远程存储时难以替换底层实现。

## Goals / Non-Goals

**Goals:**
- 将数据库连接、例程、版本、同步模块中的 SQLite 访问收口到 store 实现
- 保持命令层仅处理 IPC 输入输出，业务编排通过 service 完成
- 为跨领域能力提供稳定依赖边界，让同步与导出逻辑复用已有 store/service
- 保持现有前端调用方式、命令名称与主要用户可见行为兼容

**Non-Goals:**
- 本轮不引入 MySQL/PostgreSQL 作为新的应用持久化后端
- 本轮不调整前端页面结构或 Tauri command 对外接口
- 本轮不重做现有 dialect / connector 的远程数据库能力，只重构其调用位置

## Decisions

### 1. 先按领域补齐 store，再处理跨领域编排
先新增 `DatabaseConnectionStore`、`RoutineStore`、`VersionStore`，把本地 SQLite 读写、事务和行映射迁移进去；`SyncService` 与版本导出等跨领域流程只依赖 service/store 接口，而不直接依赖 `rusqlite`。这样可以优先消除命令层对 SQLite 的直接耦合，同时避免把编排逻辑错误地下沉到 store。

**Alternative considered:** 直接先重构 `sync.rs`。未采用，因为它依赖数据库连接、表结构、例程等多个本地读取边界，先补齐领域 store 后再调整同步编排更稳。

### 2. `routine` 只下沉本地持久化，远程获取/比较/同步/导出保留在 service
`RoutineStore` 只负责 `t_routine` 的本地 CRUD。`RoutineService` 负责编排连接配置查询、connector 调用、差异比较、同步写回与 SQL 导出。这样 store 保持单一职责，未来切换底层存储时只需替换本地读写实现。

**Alternative considered:** 将远程比较与导出逻辑一并收进 `RoutineStore`。未采用，因为这些逻辑不属于持久化细节，且依赖 connector 与 dialect。

### 3. `version` 使用“版本存储 + 聚合服务”模式
`VersionStore` 负责版本实体、版本快照等本地持久化；`VersionService` 负责从表结构、例程、设置等领域组装快照，并在导出时调用 dialect 生成 SQL。这样避免在 `VersionStore` 中重新实现其他领域查询，保持领域边界清晰。

**Alternative considered:** 构建一个包含所有快照查询的大型 `VersionStore`。未采用，因为会绕开已有 `TableStore` / `RoutineStore` / `SettingStore`，重复承载跨领域逻辑。

### 4. 同步模块以 orchestration service 为中心
`sync.rs` 命令层只转发参数给 `SyncService`。`SyncService` 负责调用数据库连接 service 获取连接配置、调用 connector 拉取远程结构、使用本地 store/service 读取本地设计，并生成对比结果与同步 SQL。命令层不再直接操作 SQLite。

**Alternative considered:** 只抽离 `sync.rs` 中的 SQL 到独立 helper。未采用，因为 helper 无法建立可替换的领域边界，仍然会让命令层持有业务编排职责。

## Risks / Trade-offs

- [模块职责重切后文件数增多] → 通过沿用现有 setting/project/table 的命名和目录模式，降低维护成本
- [版本模块跨领域依赖较多，容易重复查询] → 让 `VersionService` 优先复用现有 store/service 接口，必要时再补充聚合读取方法
- [同步与例程模块同时依赖远程 connector，改动容易扩散] → 先完成数据库连接与本地例程边界，再迁移同步编排，控制每步改动面
- [兼容性回归风险] → 保持 Tauri command 名称、输入输出结构和成功提示文案不变，并执行 `cargo check` 与 `npx tsc --noEmit` 验证
