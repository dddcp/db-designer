## ADDED Requirements

### Requirement: Routine db_type 字段存储

系统 SHALL 在 `t_routine` 表中支持 `db_type` 字段（TEXT, nullable），标记该编程对象的目标数据库类型。合法值为 `"mysql"`, `"postgresql"`, `"oracle"` 或 `NULL`（未指定）。

#### Scenario: 新建 routine 时指定 db_type
- **WHEN** 用户创建一个新的编程对象并选择了数据库类型（如 "mysql"）
- **THEN** `t_routine` 中新记录的 `db_type` 字段 SHALL 为 `"mysql"`

#### Scenario: 新建 routine 时不指定 db_type
- **WHEN** 用户创建一个新的编程对象但未选择数据库类型
- **THEN** `t_routine` 中新记录的 `db_type` 字段 SHALL 为 `NULL`

#### Scenario: 同名同类型不同 db_type 共存
- **WHEN** 项目中已存在 `name="calc", type="function", db_type="mysql"` 的记录
- **THEN** 系统 SHALL 允许创建 `name="calc", type="function", db_type="postgresql"` 的记录，两者独立存在

### Requirement: 旧数据兼容

系统 SHALL 保证已有的 routine 数据在升级后仍可正常使用。

#### Scenario: 数据库 migration 后旧数据保持完整
- **WHEN** 执行 `ALTER TABLE t_routine ADD COLUMN db_type TEXT` migration
- **THEN** 所有现有记录的 `db_type` SHALL 为 `NULL`，其余字段不变

#### Scenario: 旧版本快照反序列化
- **WHEN** 读取不含 `db_type` 字段的旧版本快照 JSON
- **THEN** `RoutineDef.db_type` SHALL 反序列化为 `None`，不报错

### Requirement: 编辑 routine 时选择数据库类型

前端编辑 Drawer SHALL 提供数据库类型选择器，列出所有已支持的数据库类型，并允许留空（"未指定"）。

#### Scenario: 编辑已有 routine 并修改 db_type
- **WHEN** 用户打开一个 `db_type="mysql"` 的 routine 编辑 Drawer，将数据库类型改为 "postgresql" 并保存
- **THEN** 该记录的 `db_type` SHALL 更新为 `"postgresql"`

#### Scenario: 列表中显示 db_type 标签
- **WHEN** 编程对象列表渲染时
- **THEN** 每条记录 SHALL 显示其 `db_type` 对应的标签（如 "MySQL" 绿色 Tag）；`db_type` 为 NULL 时 SHALL 显示"未指定"灰色 Tag

### Requirement: 列表按数据库类型过滤

编程对象维护列表 SHALL 支持按数据库类型过滤。

#### Scenario: 选择过滤条件为 "MySQL"
- **WHEN** 用户在过滤器中选择 "MySQL"
- **THEN** 列表 SHALL 只显示 `db_type="mysql"` 的记录

#### Scenario: 选择过滤条件为 "全部"
- **WHEN** 用户在过滤器中选择"全部"或清除过滤
- **THEN** 列表 SHALL 显示所有记录（含 NULL db_type）
