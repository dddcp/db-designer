## ADDED Requirements

### Requirement: 后端持久化采用三层结构
系统 MUST 将后端持久化能力组织为 Tauri command、service/use case、store implementation 三层结构，其中命令层只负责 IPC 输入输出，业务编排通过 service 完成，具体持久化由可替换的 store 实现提供。

#### Scenario: 命令层调用业务服务
- **WHEN** 前端调用任一已迁移的持久化相关 Tauri command
- **THEN** 该 command MUST 通过 service 执行业务流程，而不是直接编写 SQL 或直接操作底层数据库连接

### Requirement: 命令层不得直接依赖 SQLite 细节
已迁移的持久化相关命令模块 MUST 不直接依赖 `rusqlite::Connection`、`rusqlite::Transaction` 或直接调用 SQLite 初始化函数执行业务读写。

#### Scenario: 持久化细节收口到 store
- **WHEN** 系统执行项目、表结构或设置相关的已迁移持久化操作
- **THEN** SQLite 连接获取、SQL 执行、行映射与事务细节 MUST 由 SQLite store 实现负责

### Requirement: SQLite 作为当前默认 store 实现
系统 MUST 提供 SQLite store 作为当前持久化实现，并保持现有项目、表结构和设置功能可继续工作。

#### Scenario: 现有功能行为保持兼容
- **WHEN** 用户继续使用项目管理、表结构编辑或设置保存功能
- **THEN** 系统 MUST 保持现有 command 名称、输入输出结构和主要用户可见行为不变

### Requirement: 存储能力按领域边界提供
系统 MUST 按领域边界提供 store 接口，至少覆盖设置、项目和表结构三个领域，以支持后续为不同存储后端分别实现同一业务能力。

#### Scenario: 为未来后端扩展预留边界
- **WHEN** 后续需要接入 MySQL 或 PostgreSQL 作为持久化后端
- **THEN** 系统 MUST 可以在不修改已迁移 command 对外接口的前提下，为对应领域新增 store 实现
