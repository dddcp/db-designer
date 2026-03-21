## ADDED Requirements

### Requirement: SQL 导出按数据库类型过滤

`export_routines_sql` 命令 SHALL 接受 `database_type` 参数，只输出匹配的 routine。

#### Scenario: 导出 MySQL 类型的 routine
- **WHEN** 调用 `export_routines_sql(project_id, "mysql")`
- **THEN** SHALL 只输出 `db_type="mysql"` 和 `db_type IS NULL` 的 routine 的 body

#### Scenario: 导出时 NULL db_type 的 routine 也输出
- **WHEN** 项目中存在 `db_type=NULL` 的 routine，调用 `export_routines_sql(project_id, "mysql")`
- **THEN** NULL db_type 的 routine SHALL 也被输出，并在 SQL 注释中标注"未指定数据库类型"

### Requirement: 版本快照 SQL 导出过滤 routine

`export_version_sql` 在遍历快照中的 routine 时 SHALL 按 `database_type` 参数过滤。

#### Scenario: 版本 SQL 导出只包含匹配 db_type 的 routine
- **WHEN** 快照中有 `db_type="mysql"` 和 `db_type="postgresql"` 的 routine，导出时选择 "mysql"
- **THEN** 导出的 SQL SHALL 只包含 `db_type="mysql"` 和 `db_type=None` 的 routine

### Requirement: 前端导出增加数据库类型选择

routine-tab 的 SQL 导出子 Tab SHALL 提供数据库类型选择器。

#### Scenario: 用户选择数据库类型后生成 SQL
- **WHEN** 用户在 SQL 导出 Tab 选择 "PostgreSQL" 并点击"生成 SQL"
- **THEN** 前端 SHALL 调用 `export_routines_sql` 并传入 `database_type="postgresql"`，展示过滤后的 SQL

#### Scenario: 未选择数据库类型时的默认行为
- **WHEN** 用户未选择数据库类型就点击"生成 SQL"
- **THEN** 前端 SHALL 提示用户先选择数据库类型，或使用默认值 "mysql"
