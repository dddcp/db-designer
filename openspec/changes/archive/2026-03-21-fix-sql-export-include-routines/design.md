## Context

当前 SQL 导出功能只调用 `export_project_sql` 获取表的 SQL，不包含编程对象。项目中已有 `export_routines_sql` 函数支持按数据库类型导出编程对象，但未被 SQL 导出 Tab 调用。

## Goals / Non-Goals

**Goals:**
- SQL 导出 Tab 导出完整的 SQL，包含表和编程对象
- 按当前选择的数据库类型过滤，只导出兼容的编程对象

**Non-Goals:**
- 不修改后端 `export_project_sql` 和 `export_routines_sql` 函数
- 不新增后端命令
- 不改变现有编程对象管理界面的导出功能

## Decisions

### 方案选择：前端组合 SQL

**决定**：在 `sql-export-tab.tsx` 中先调用 `export_project_sql`，再调用 `export_routines_sql`，将两个结果拼接。

**理由**：
- 改动最小，只需修改前端
- 保持后端函数职责单一
- `export_routines_sql` 已支持按数据库类型过滤，前端只需传入相同参数

**备选方案**：修改后端 `export_project_sql` 直接集成编程对象导出
- 缺点：改动更大，需要修改后端
- 优点：减少前端调用次数

## Risks / Trade-offs

- **风险**：如果项目编程对象很多，导出可能较慢
- **缓解**：这是现有功能，用户已接受当前性能
