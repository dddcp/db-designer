## Context

当前应用通过 `src-tauri/src/setting.rs` 将所有设置统一保存在 SQLite 的 `t_setting` 表中。AI 设置与 Git 设置属于当前设备的本地工具配置，其中包含 API Key、Token 等敏感信息；而默认数据库类型、自定义数据类型等设置仍然与设计数据配合使用，适合继续保存在设计数据库中。

本次变更需要在不影响现有设计数据分享方式的前提下，将 AI 和 Git 配置迁移到本地 `settings.json` 文件，同时保持其他设置项的现有行为不变。

## Goals / Non-Goals

**Goals:**
- 将 AI 与 Git 相关设置从 SQLite 分离到本地 JSON 文件
- 保持现有 AI 设置页、Git 设置页和相关读取逻辑的用户体验基本不变
- 保留其余设置继续使用 SQLite 存储
- 使分享 SQLite 设计文件时不包含 AI Key 与 Git Token

**Non-Goals:**
- 不迁移 `default_database_type`、`custom_data_types` 等其他设置
- 不修改项目、表、版本、routine 等设计数据结构
- 不引入新的导入导出文件格式

## Decisions

### 1. 仅拆分 AI / Git 配置，不重构全部设置系统
选择最小改动方案，只将 `ai_*` 和 `git_*` 键迁移到 `settings.json`，其余键继续由 `t_setting` 提供。

备选方案：
- 全量迁移所有设置到 JSON：边界更统一，但会改变 `custom_data_types` 和默认数据库类型的现有共享行为，超出本次目标。
- 保持全部在 SQLite，仅靠导出时过滤：不能解决用户直接分享 SQLite 文件时泄露本地配置的问题。

### 2. 为本地 JSON 设置提供独立的后端命令
不复用 `get_all_settings` 混合返回两类数据，而是增加面向本地配置的独立命令，例如获取全部本地设置、保存本地设置、删除本地设置。

备选方案：
- 让 `get_all_settings` 同时聚合 SQLite 与 JSON：短期调用方改动更少，但会继续模糊“本地配置”和“设计数据”的边界。

### 3. settings.json 与数据库文件放在同一 data 目录下
本地 JSON 文件沿用当前后端的 data 目录定位方式，与 `db_designer.db` 并列存放，降低路径管理复杂度。

备选方案：
- 使用额外的用户目录：隔离更彻底，但需要新增路径策略和迁移判断，当前收益不足。

### 4. 读取本地设置时允许文件不存在
首次启动或升级后若 `settings.json` 不存在，应返回空配置并在首次保存时创建文件，避免要求用户执行显式迁移操作。

## Risks / Trade-offs

- [旧数据仍留在 SQLite] → 升级后历史 AI/Git 配置可能仍存在于 `t_setting` 中；可通过迁移时读取旧值写入 JSON，并在成功后删除旧键，或至少保证后续读取优先 JSON
- [双存储路径增加维护成本] → 通过明确键范围与独立命令边界降低混淆
- [settings.json 文件损坏] → 读取失败时返回明确错误，避免静默覆盖损坏内容
- [与直接拷贝整个 data 目录分享的预期不完全一致] → 本次目标是让分享 SQLite 文件不带出本地配置，不保证整个 data 目录分享时自动脱敏

## Migration Plan

1. 新增本地 JSON 设置读写能力
2. 将 AI 与 Git 相关前端页面改为调用本地 JSON 设置接口
3. 如需要兼容升级，可在读取本地配置时尝试从 SQLite 旧键迁移一次到 JSON
4. 验证分享 `db_designer.db` 时不再包含 AI / Git 设置

## Open Questions

- 是否需要在首次读取时自动把 SQLite 中的旧 `ai_*` / `git_*` 键迁移到 JSON，并删除旧值
- `settings.json` 是否需要按分类嵌套结构保存，还是继续保持 key-value 形式以减少改动
