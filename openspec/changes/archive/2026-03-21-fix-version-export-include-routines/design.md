## Context

版本快照结构 `Snapshot` 已包含 `tables` 和 `routines` 字段（models.rs:177-181）。`create_version` 正确保存 routines，但 `export_version_sql` 和 `export_upgrade_sql` 只处理 tables。

## Goals / Non-Goals

**Goals:**
- `export_version_sql` 导出版本快照中的编程对象
- `export_upgrade_sql` 导出版本间的编程对象变更

**Non-Goals:**
- 不修改前端调用方式
- 不新增后端命令
- 不改变版本创建逻辑

## Decisions

### 复用 `export_routines_sql` 逻辑

**决定**：在 `export_version_sql` 和 `export_upgrade_sql` 中添加编程对象导出逻辑。

**理由**：
- `export_routines_sql` 已有完整的编程对象 SQL 生成逻辑
- 可直接复用 `routines` 的 SQL 格式

**备选方案**：抽取公共函数
- 缺点：需要较大重构
- 优点：减少代码重复

## Risks / Trade-offs

- **风险**：旧版本快照中 routines 可能为空（历史数据）
- **缓解**：检查 `snapshot.routines` 是否为空，为空时跳过导出
