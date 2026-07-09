## 1. 后端数据模型与 trait

- [x] 1.1 在 `src-tauri/src/models.rs` 新增 `UpdateProjectRequest { id: i32, name: String, description: Option<String> }`
- [x] 1.2 在 `src-tauri/src/storage/mod.rs` 的 `ProjectStore` trait 中新增 `fn update_project(&self, project: UpdateProjectRequest) -> Result<Project, String>;`

## 2. 后端存储实现

- [x] 2.1 在 `src-tauri/src/storage/sqlite/project_store.rs` 中实现 `update_project`：执行 `UPDATE t_proj SET name=?1, description=?2, updated_at=datetime('now') WHERE id=?3`，随后按 `id` 查询并返回最新 `Project`
- [x] 2.2 处理 id 不存在的情形：受影响行数为 0 时返回错误（如 `"Project not found: {id}"`）

## 3. 后端 service 与 command

- [x] 3.1 在 `src-tauri/src/services/project_service.rs` 新增 `pub fn update_project(&self, project: UpdateProjectRequest) -> Result<Project, String>`，透传到 `store.update_project`
- [x] 3.2 在 `src-tauri/src/project.rs` 新增 `#[tauri::command] pub fn update_project(project: UpdateProjectRequest) -> Result<Project, String>`，调用 `ProjectService::new().update_project(project)`
- [x] 3.3 在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![...]` 中追加 `project::update_project`

## 4. 后端校验

- [x] 4.1 在 `src-tauri/` 目录运行 `cargo check`，确认后端编译通过

## 5. 前端 UI 改造

- [x] 5.1 在 `src/components/main/main.tsx` 把现有的创建 `Drawer` 改造为 `Modal`，并通过新增的 `modalMode: 'create' | 'edit'` 与 `editingProject: Project | null` 状态控制行为
- [x] 5.2 抽出 `openCreateModal` 与 `openEditModal(project)` 两个函数，分别设置 `modalMode='create'` / `'edit'` 与对应的初始值
- [x] 5.3 项目卡片底部操作区从两个按钮改造为三个图标按钮：`EyeOutlined`（查看）、`EditOutlined`（编辑）、`DeleteOutlined`（删除），每个按钮均带 `Tooltip`；查看按钮去掉文字 "查看详情"，保留图标
- [x] 5.4 编辑按钮触发 `openEditModal(project)` 并 `e.stopPropagation()` 阻止冒泡；查看、删除按钮的 `e.stopPropagation()` 行为保留

## 6. 前端提交逻辑

- [x] 6.1 新增 `handleUpdateProject(values: { name, description? })`：将 `description?.trim() || null` 规范化后调用 `invoke('update_project', { project: { id: editingProject.id, ... } })`；成功后关闭 Modal、显示成功提示、调用 `loadProjects()`
- [x] 6.2 失败时通过 `message.error` 提示，列表保持原状
- [x] 6.3 在 `<Modal>` 的 `onFinish` 中根据 `modalMode` 分发到 `handleCreateProject` 或 `handleUpdateProject`

## 7. 国际化

- [x] 7.1 在 `src/i18n/locales/zh-CN.json` 新增：`main_edit_project`（"编辑项目"）、`main_update_success`（"项目更新成功"）、`main_update_fail`（"更新项目失败"）、`main_edit`（"编辑"）、`save`（"保存"）
- [x] 7.2 在 `src/i18n/locales/en-US.json` 同步新增以上五个键的英文文案

## 8. 前端校验

- [x] 8.1 在仓库根目录运行 `npx tsc --noEmit`，确认前端类型检查通过

## 9. 手动冒烟

- [x] 9.1 启动 `yarn tauri dev`，在项目列表中点击编辑按钮，确认 Modal 打开、字段填充正确
- [x] 9.2 修改名称后保存，确认列表立即刷新、详情页跳转后能看到新名称
- [x] 9.3 将描述清空后保存，确认描述列在数据库中为 `null`，UI 上显示"暂无描述"
- [x] 9.4 把删除按钮的 Popconfirm 与整体点击跳转行为确认未受影响