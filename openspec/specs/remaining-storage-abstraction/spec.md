## ADDED Requirements

### Requirement: 数据库连接模块采用三层持久化结构
系统 MUST 将数据库连接管理能力组织为 Tauri command、service/use case、store implementation 三层结构，其中命令层不得直接访问 `t_database_connection` 对应的 SQLite 连接与 SQL。

#### Scenario: 读取数据库连接列表
- **WHEN** 前端调用 `get_database_connections`
- **THEN** 命令层 MUST 通过数据库连接 service 获取数据，SQLite 查询与结果映射 MUST 由数据库连接 store 实现负责

#### Scenario: 保存数据库连接
- **WHEN** 前端调用 `create_database_connection` 或 `update_database_connection`
- **THEN** 命令层 MUST 通过数据库连接 service 执行业务流程，SQLite 写入细节 MUST 由数据库连接 store 实现负责

### Requirement: 例程模块区分本地持久化与远程编排职责
系统 MUST 将例程模块中的本地例程 CRUD 下沉到 store，将远程获取、比较、同步与导出逻辑保留在 service 层编排。

#### Scenario: 本地例程 CRUD 通过 store 执行
- **WHEN** 前端调用 `get_project_routines`、`save_routine` 或 `delete_routine`
- **THEN** 例程命令层 MUST 通过例程 service 调用本地例程 store，而不是直接编写 SQLite SQL

#### Scenario: 远程例程能力通过 service 编排
- **WHEN** 前端调用远程例程获取、比较、同步或导出相关命令
- **THEN** 例程 service MUST 负责组合数据库连接读取、本地例程读写和 connector/dialect 调用，例程 store MUST 只承担本地持久化职责

### Requirement: 版本模块通过聚合服务组装快照
系统 MUST 将版本记录与快照持久化细节下沉到版本 store，并由版本 service 负责跨表结构、例程和设置等领域组装版本快照与导出 SQL。

#### Scenario: 创建版本时组装快照
- **WHEN** 前端调用 `create_version`
- **THEN** 版本命令层 MUST 通过版本 service 协调表结构、例程和设置相关 store/service 组装快照，并由版本 store 负责保存版本记录与快照数据

#### Scenario: 导出版本 SQL
- **WHEN** 前端调用 `export_version_sql` 或相关版本导出命令
- **THEN** 版本 service MUST 负责读取版本数据并调用 dialect 生成 SQL，命令层 MUST 不直接访问 SQLite

### Requirement: 同步模块通过服务编排本地与远程数据访问
系统 MUST 将同步模块改造成以 service 为中心的编排层，命令层不得直接查询本地 SQLite，而应通过数据库连接、表结构、例程等领域 service/store 访问本地数据。

#### Scenario: 比较本地与远程表结构
- **WHEN** 前端调用 `compare_tables` 或 `generate_sync_sql`
- **THEN** 同步命令层 MUST 通过同步 service 执行流程，服务层 MUST 组合本地领域 service/store 与远程 connector 获取比较所需数据

#### Scenario: 连接远程数据库
- **WHEN** 前端调用 `connect_database` 或 `get_remote_tables`
- **THEN** 同步 service MUST 通过数据库连接 service 获取连接配置，并使用 connector 执行远程访问，而不是在命令层直接查询 SQLite 连接配置
