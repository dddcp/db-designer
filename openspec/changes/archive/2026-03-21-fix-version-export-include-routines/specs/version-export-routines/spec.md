## ADDED Requirements

### Requirement: 导版本快照包含编程对象
`export_version_sql` 函数 SHALL 导出版本快照中保存的编程对象（函数、存储过程、触发器）。

#### Scenario: 导版本快照包含 routines
- **WHEN** 用户导出版本 SQL 且该版本快照包含编程对象
- **THEN** 导出的 SQL 包含表结构和编程对象

#### Scenario: 导版本快照无 routines
- **WHEN** 用户导出版本 SQL 且该版本快照不包含编程对象
- **THEN** 导出的 SQL 只包含表结构

### Requirement: 升级脚本包含编程对象变更
`export_upgrade_sql` 函数 SHALL 导出两个版本间的编程对象变更。

#### Scenario: 导出升级脚本包含新增的编程对象
- **WHEN** 新版本比旧版本增加了编程对象
- **THEN** 升级脚本包含新增的编程对象定义

#### Scenario: 导出升级脚本包含删除的编程对象
- **WHEN** 新版本比旧版本删除了编程对象
- **THEN** 升级脚本包含删除编程对象的语句

#### Scenario: 导出升级脚本包含修改的编程对象
- **WHEN** 两版本中同名编程对象的 body 不同
- **THEN** 升级脚本先包含 DROP 语句再包含 CREATE 语句

### Requirement: 编程对象对比维度
编程对象对比 SHALL 基于以下维度：

#### Scenario: 对比名称
- **WHEN** 对比两个版本的编程对象
- **THEN** 使用名称作为主要标识符

#### Scenario: 对比类型
- **WHEN** 对比两个版本的编程对象
- **THEN** 类型（function/procedure/trigger）必须相同才视为同一对象

#### Scenario: 对比函数体
- **WHEN** 对比两个版本的同名同类型编程对象
- **THEN** 如果 body 不同则视为修改

#### Scenario: 按数据库类型过滤
- **WHEN** 对比编程对象时
- **THEN** 只对比目标数据库类型兼容的编程对象（db_type 匹配或为 NULL）
