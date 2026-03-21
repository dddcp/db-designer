## ADDED Requirements

### Requirement: SQL 导出包含编程对象
SQL 导出功能 SHALL 在导出项目 SQL 时同时包含表结构和编程对象（函数、存储过程、触发器）。

#### Scenario: 导出时包含兼容的编程对象
- **WHEN** 用户在 SQL 导出 Tab 选择数据库类型（如 MySQL）并点击导出
- **THEN** 系统导出表结构的 SQL
- **AND** 系统导出该数据库类型兼容的编程对象 SQL

#### Scenario: 导出时过滤不兼容的编程对象
- **WHEN** 编程对象设置了数据库类型（如 Oracle）
- **AND** 用户选择的数据库类型是 MySQL
- **THEN** 该编程对象不会被导出

#### Scenario: 导出顺序正确
- **WHEN** 用户导出包含表和编程对象的 SQL
- **THEN** SQL 先包含表结构定义
- **AND** SQL 后包含编程对象定义
