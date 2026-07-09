## Why

项目列表（首页 `src/components/main/main.tsx`）当前对每个项目只暴露"查看详情"与"删除"两类操作。一旦项目创建时名称或描述填写错误、或者后续业务语义调整，用户没有就地修正的入口，只能删除重建，丢失项目 ID 及其下所有表的归属关系。新增项目编辑能力可避免误删重建的代价，闭环"创建 → 编辑 → 删除"的项目生命周期操作。

## What Changes

- 在项目卡片操作区新增"编辑"图标按钮，与查看详情、删除并列；将现有的"查看详情"文字按钮也统一改为图标按钮（视觉更紧凑、对称）。
- 新建与编辑共用一个基于 `Modal` 的表单弹窗（替换当前从侧边滑出的 `Drawer`），通过 `mode: 'create' | 'edit'` 区分标题、提交函数与初始值。
- 后端新增 `update_project` Tauri 命令，允许修改项目的 `name` 与 `description`；`description` 允许为空字符串并在保存时规范化为 `null`。
- 新增 `UpdateProjectRequest` 数据结构，并在 `ProjectStore` 抽象、`SqliteProjectStore` 实现、`ProjectService` 中贯通；写入时同时更新 `updated_at = datetime('now')`。
- 新增 i18n 文案键 `main_edit_project`、`main_update_success`、`main_update_fail`、`main_edit`（按钮 hover 提示）等。

## Capabilities

### New Capabilities

- `project-edit`: 项目列表的项目编辑能力，包括后端 `update_project` 命令、共享的创建/编辑 Modal、以及名称与描述的可编辑约束。

### Modified Capabilities

（无。现有 capability 未涉及项目编辑的规格要求。）

## Impact

**后端**：
- `src-tauri/src/models.rs`：新增 `UpdateProjectRequest`。
- `src-tauri/src/storage/mod.rs`：`ProjectStore` trait 增加 `update_project` 方法。
- `src-tauri/src/storage/sqlite/project_store.rs`：增加 SQLite 实现，复用 `init_db()` 模式。
- `src-tauri/src/services/project_service.rs`：service 透传新方法。
- `src-tauri/src/project.rs`：新增 `update_project` command。
- `src-tauri/src/lib.rs`：注册新 command 到 `tauri::generate_handler![...]`。

**前端**：
- `src/components/main/main.tsx`：
  - 项目卡片操作区改造为三个图标按钮（查看/编辑/删除），保留 Popconfirm 包裹删除按钮。
  - 将"新建项目"Drawer 改造为共享 Modal（编辑与新建复用），按 `mode` 切换。
- `src/i18n/locales/zh-CN.json`、`src/i18n/locales/en-US.json`：新增编辑相关键。

**约束**：
- 不做重名校验（与现有 `create_project` 保持一致；如后续需要再加）。
- 不改动 `Project` 的字段或前端展示（`updated_at` 这次不展示，保持改动面最小）。
- 命令参数命名遵循 `snake_case`（Rust）↔ `camelCase`（前端 invoke）约定。