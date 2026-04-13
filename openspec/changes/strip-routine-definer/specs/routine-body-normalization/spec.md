## ADDED Requirements

### Requirement: 拉取远端 routine 时剥离 MySQL DEFINER 子句

系统在通过 `get_remote_routines` 拉取远端 MySQL routine 时，SHALL 自动剥离 body 中的 `DEFINER=<user>@<host>` 子句，使存储的 body 不含环境相关的 DEFINER 信息。PostgreSQL 和 Oracle 方言 SHALL NOT 受影响。

#### Scenario: 拉取含 DEFINER 的 MySQL 函数
- **WHEN** 从远端 MySQL 数据库拉取 routine，其 `SHOW CREATE` 输出为 `CREATE DEFINER=\`root\`@\`10.0.70.%\` FUNCTION calc_tax...`
- **THEN** 存储的 body SHALL 为 `CREATE FUNCTION calc_tax...`，DEFINER 子句被剥离

#### Scenario: 拉取不含 DEFINER 的 routine
- **WHEN** 从远端拉取的 routine body 不含 DEFINER 子句
- **THEN** body SHALL 保持不变

#### Scenario: 拉取 PostgreSQL routine
- **WHEN** 从远端 PostgreSQL 数据库拉取 routine
- **THEN** body SHALL NOT 做任何 DEFINER 相关处理，保持原始值

### Requirement: routine 对比时归一化 DEFINER 子句

系统在对比本地与远端 routine 时，SHALL 对双方的 body 都执行 DEFINER 归一化处理后再比较，确保含不同 DEFINER 但逻辑相同的 routine 被判定为 "same"。

#### Scenario: 本地和远端仅 DEFINER 不同
- **WHEN** 本地 routine body 为 `CREATE FUNCTION calc_tax...`，远端 routine body 为 `CREATE DEFINER=\`admin\`@\`%\` FUNCTION calc_tax...`
- **THEN** 对比结果 SHALL 为 "same"

#### Scenario: 本地和远端逻辑确实不同
- **WHEN** 本地和远端 routine 的归一化后 body 仍然不同
- **THEN** 对比结果 SHALL 为 "different"

#### Scenario: 本地历史遗留含 DEFINER 的数据与远端对比
- **WHEN** 本地 routine body 含 `DEFINER=\`old_user\`@\`%\``，远端 body 含 `DEFINER=\`new_user\`@\`%\``
- **THEN** 若归一化后 body 相同，对比结果 SHALL 为 "same"

### Requirement: 同步远端 routine 到本地时使用归一化 body

系统在将远端 routine 同步到本地时，SHALL 存储已归一化（不含 DEFINER）的 body。

#### Scenario: 同步含 DEFINER 的远端 routine
- **WHEN** 将远端 MySQL routine 同步到本地，远端 body 含 DEFINER 子句
- **THEN** 本地存储的 body SHALL 为归一化后的值（DEFINER 已剥离）

### Requirement: 版本间 routine 对比时归一化 DEFINER 子句

系统在比较不同版本间的 routine 差异时，SHALL 对双方的 body 都执行 DEFINER 归一化处理后再比较。

#### Scenario: 版本间仅 DEFINER 不同的 routine
- **WHEN** 旧版本 routine body 含 `DEFINER=\`v1_user\`@\`%\``，新版本 routine body 含 `DEFINER=\`v2_user\`@\`%\``，但逻辑相同
- **THEN** 版本 diff SHALL 不报告此 routine 为变更项

### Requirement: 导出 SQL 时归一化 DEFINER 子句

系统在导出 routine SQL 时，SHALL 对 body 执行 DEFINER 归一化处理后再输出，确保导出的 SQL 不含环境相关的 DEFINER 子句。这适用于项目 routine 导出、版本快照导出和升级脚本生成。

#### Scenario: 项目 routine 导出含 DEFINER 的历史数据
- **WHEN** 导出项目 routine SQL，本地存储的 body 含 `DEFINER=\`root\`@\`10.0.70.%\``
- **THEN** 导出的 SQL SHALL 不含 DEFINER 子句

#### Scenario: 版本快照导出含 DEFINER 的 routine
- **WHEN** 导出版本快照 SQL，快照中的 routine body 含 DEFINER 子句
- **THEN** 导出的 SQL SHALL 不含 DEFINER 子句

#### Scenario: 升级脚本输出修改的 routine
- **WHEN** 生成升级脚本，新版本 routine body 含 DEFINER 子句
- **THEN** 升级脚本中的 CREATE 语句 SHALL 不含 DEFINER 子句

#### Scenario: 升级脚本输出新增的 routine
- **WHEN** 生成升级脚本，新增 routine body 含 DEFINER 子句
- **THEN** 升级脚本中的 CREATE 语句 SHALL 不含 DEFINER 子句

### Requirement: 统一的归一化函数

系统 SHALL 提供统一的 `normalize_routine_body(body, db_type)` 函数，根据数据库类型执行相应的归一化处理。MySQL 方言 SHALL 剥离 DEFINER 子句，其他方言 SHALL 直接返回原值。

#### Scenario: MySQL routine body 归一化
- **WHEN** 调用 `normalize_routine_body("CREATE DEFINER=\`root\`@\`localhost\` FUNCTION f...", "mysql")`
- **THEN** 返回值 SHALL 为 `CREATE FUNCTION f...`

#### Scenario: PostgreSQL routine body 归一化
- **WHEN** 调用 `normalize_routine_body("CREATE OR REPLACE FUNCTION f...", "postgresql")`
- **THEN** 返回值 SHALL 为原值不变
