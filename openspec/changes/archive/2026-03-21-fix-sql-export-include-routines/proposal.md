## Why

当前 SQL 导出 Tab 只导出表的结构、索引和元数据，没有包含项目中的编程对象（函数、存储过程、触发器）。用户期望导出完整的数据库对象定义，需要将编程对象也纳入导出范围。

## What Changes

- SQL 导出功能增加编程对象（函数、存储过程、触发器）的导出
- 导出时按当前选择的数据库类型过滤，只导出兼容该数据库的编程对象
- 导出顺序：先导出表结构，再导出编程对象

## Capabilities

### New Capabilities
- `sql-export-routines`: SQL 导出时包含编程对象，按数据库类型过滤

### Modified Capabilities
- `sql-export` (现有 spec): 扩展导出范围，从只导出表扩展为同时导出表和编程对象

## Impact

- **前端**: `sql-export-tab.tsx` 需要调用 `export_routines_sql` 并将结果拼接到表 SQL 后面
- **后端**: `export_project_sql` 保持不变，新增逻辑由前端组合，或在后端 `export_project_sql` 中直接集成
