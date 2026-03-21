## Why

版本快照在创建时已正确保存编程对象（`create_version` 将 routines 存入 snapshot），但 `export_version_sql` 和 `export_upgrade_sql` 导出时忽略了 routines 字段，导致导出的 SQL 不完整。

## What Changes

- 修复 `export_version_sql` 导出时包含 `snapshot.routines`
- 修复 `export_upgrade_sql` 导出时包含编程对象变更
- 导出顺序：先导出版本快照中的所有编程对象

### 升级脚本编程对象对比逻辑

| 变更类型 | 检测条件 | 导出内容 |
|---------|---------|---------|
| **新增** | 新版本有，旧版本没有 | `CREATE` 语句 |
| **删除** | 旧版本有，新版本没有 | `DROP` 语句 |
| **修改** | 两版本都有但定义不同 | `DROP` + `CREATE` 语句 |

**对比维度**：
- 名称 (`name`)
- 类型 (`type`) - function/procedure/trigger
- 函数体 (`body`)
- 数据库类型 (`db_type`) - 只对比目标数据库类型兼容的

## Capabilities

### Modified Capabilities
- `sql-export` (现有 spec): `export_version_sql` 和 `export_upgrade_sql` 需要导出版本快照中保存的编程对象

## Impact

- **后端**: `version.rs` 中的 `export_version_sql` 和 `export_upgrade_sql` 函数需要修改
- **前端**: 无需修改，前端调用方式不变
