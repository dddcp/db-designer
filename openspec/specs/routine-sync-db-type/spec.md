## ADDED Requirements

### Requirement: 远程同步自动标记 db_type

`sync_remote_routine_to_local` SHALL 根据远程连接的数据库类型自动设置同步过来的 routine 的 `db_type`。

#### Scenario: 从 MySQL 连接同步 routine
- **WHEN** 用户从一个 `type="mysql"` 的数据库连接同步编程对象到本地
- **THEN** 同步创建/更新的 routine 记录的 `db_type` SHALL 为 `"mysql"`

#### Scenario: 同步覆盖已有同 db_type 的 routine
- **WHEN** 本地已有 `name="calc", type="function", db_type="mysql"` 的记录，从 MySQL 连接同步了同名同类型的 routine
- **THEN** SHALL 更新该已有记录的 body，不创建新记录

#### Scenario: 同步不影响其他 db_type 的 routine
- **WHEN** 本地已有 `name="calc", type="function", db_type="postgresql"` 的记录，从 MySQL 连接同步了同名同类型的 routine
- **THEN** PostgreSQL 版本的记录 SHALL 不受影响，MySQL 版本作为新记录创建

### Requirement: 远程比较按 db_type 过滤

`compare_routines` SHALL 接受 `db_type` 参数，只与本地同 db_type 的 routine 进行比较。

#### Scenario: 比较时只匹配同 db_type 的 routine
- **WHEN** 从 MySQL 连接获取远程 routine 并调用 compare，本地有 `calc(mysql)` 和 `calc(postgresql)`
- **THEN** SHALL 只将远程 `calc` 与本地 `calc(mysql)` 比较，`calc(postgresql)` 不参与

#### Scenario: 本地无对应 db_type 的 routine
- **WHEN** 远程有 `audit_log(function)`，本地只有 `audit_log(function, db_type="postgresql")`，比较的 db_type 为 "mysql"
- **THEN** 该 routine SHALL 标记为 `only_remote`

### Requirement: sync-routine-diff 显示 db_type 信息

同步对比界面 SHALL 展示当前比较的数据库类型信息。

#### Scenario: 对比界面标题显示数据库类型
- **WHEN** 用户从 MySQL 连接触发编程对象对比
- **THEN** 界面 SHALL 明确显示当前对比的数据库类型为 MySQL
