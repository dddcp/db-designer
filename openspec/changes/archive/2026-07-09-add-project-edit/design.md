## Context

项目列表首页 `src/components/main/main.tsx` 当前对每个项目卡片只暴露"查看详情"与"删除"两类操作，且新建项目使用从屏幕侧边滑出的 Ant Design `Drawer` 组件。后端 `project.rs` 只注册了 `get_projects` / `create_project` / `delete_project` 三个命令；`ProjectStore` 抽象与 `SqliteProjectStore` 实现同样只覆盖这三个方法。`Project` 模型已包含 `updated_at` 字段，但目前没有写入路径。

现有可参考的"完整 update 闭环"是 `database_connection` 模块：`UpdateDatabaseConnectionRequest`（含 id + 字段）→ Tauri command → service → `DatabaseConnectionStore::update_database_connection` → `SqliteDatabaseConnectionStore::update_database_connection`（更新字段 + `updated_at = datetime('now')`）。本次新增的 `project` 更新能力将严格对齐此模式，确保后端分层（command → service → storage）一致。

## Goals / Non-Goals

**Goals:**
- 项目卡片新增"编辑"图标按钮，三按钮（查看/编辑/删除）布局紧凑、对称。
- 编辑与新建共用一个 Ant Design `Modal` 组件，根据 `mode` 区分标题、提交函数、初始值。
- 后端 `update_project` 命令遵循 `command → service → storage` 分层；写入时同时刷新 `updated_at`。
- `description` 允许为空字符串，前端在提交前将其规范化为 `null`；store 层忠实存储、不做隐式转换。
- 新增配套的 i18n 文案（zh-CN 与 en-US）。

**Non-Goals:**
- 项目重名校验（保持改动面最小，与现有 `create_project` 一致）。
- 在卡片 UI 上展示 `updated_at`。
- 改动 `Project` 结构或前端 `Project` 类型。
- 引入新的依赖或框架。

## Decisions

### 决策 1：编辑入口使用独立图标按钮，删除"查看详情"文字

**决定**：在 `main.tsx` 项目卡片底部的 `Space` 操作区新增"编辑"图标按钮（`EditOutlined`），与已有的删除按钮并列；同时把当前"查看详情"的文字按钮也改为图标（`EyeOutlined`）并移除文字 `查看详情`。

**理由**：
- 三个图标按钮紧凑、对称，符合"高密度信息卡片"的现代设计风格。
- 减少视觉噪音：当前"查看详情"按钮同时承担"打开详情"和"页面跳转"的暗示，但项目卡片的整块点击区已经绑定了跳转；改为图标后行为不变但更克制。

**备选方案**：
- A. 保留"查看详情"文字，仅新增编辑图标 → 视觉不对称，PASS。
- B. 用 Dropdown 收纳所有操作 → 改变交互模型、增加一次点击，PASS。

### 决策 2：新建/编辑共用一个 `Modal`，通过 `mode` 区分

**决定**：将当前 `Drawer` 替换为 `Modal`；通过 `mode: 'create' | 'edit'` 切换标题、提交按钮文案、提交函数、`form.initialValues`。

**理由**：
- `Modal` 与 `Drawer` 是平级的轻量替换，迁移成本极低（保留 `<Form>` 内部结构与字段校验不变）。
- 共享同一份表单组件可避免"创建一套 / 编辑一套"的双倍维护成本。
- 用户在 explore 阶段明确选择弹框而非侧边抽屉。

**备选方案**：
- A. 创建 `Drawer` 与编辑 `Modal` 各一份 → 重复模板代码，PASS。
- B. 仍用 `Drawer` 但通过 mode 区分 → 与用户明确诉求不一致，PASS。

### 决策 3：后端独立 `update_project` 命令，不复用 `create_project`

**决定**：新增 `update_project` Tauri command，参数为 `UpdateProjectRequest { id, name, description }`。

**理由**：
- 对齐 `update_database_connection` 的现有模式，遵循"单一职责"。
- 在 `create_project` 内部加 `id` 兼容会污染请求结构，并使前端调用语义模糊。

**备选方案**：
- A. `create_project` 内兼容 `id`（有则更新、无则创建）→ "upsert"语义更复杂、未来难扩展，PASS。

### 决策 4：description 空字符串规范化为 `null`

**决定**：在前端 `handleSubmit` 时，若 `description.trim() === ''` 则传 `null`；后端不做隐式规范化。

**理由**：
- 数据库列已是 `Option<String>`，统一以 `null` 表示"无描述"语义更清晰。
- 把转换放在前端可以避免后端静默改写用户输入（store 忠实存储）。
- 与现有"无描述显示'暂无描述'"的展示逻辑无冲突（`project.description || t('main_no_description')`）。

### 决策 5：操作按钮顺序为 查看 → 编辑 → 删除

**决定**：从左到右依次为 `EyeOutlined`（查看）、`EditOutlined`（编辑）、`DeleteOutlined`（删除）。删除按钮仍包在 `Popconfirm` 内。

**理由**：按"风险递增"排列，且与现有"查看 → 删除"的视觉位置一致（编辑插在中间）。

## Risks / Trade-offs

- **[风险] Modal 替换 Drawer 可能让习惯侧边抽屉的用户感知变化** → 标题、表单字段、提交按钮文案保持不变；只是出框位置从右侧改为屏幕中央，整体信息架构一致。
- **[风险] `update_project` 失败时若未回填列表会显示陈旧数据** → 在 catch 块 `loadProjects()` 之前保持 `setProjects(result)`；前端策略：仅在成功后刷新（或保留乐观更新后失败回滚）。本次采用最简策略：成功后刷新，失败仅提示错误、列表保持原状。
- **[风险] `description` 为空字符串时若前端未规范化，`t_proj.description` 列会写入空字符串而非 null** → 缓解：在前端 `handleSubmit` 统一用 `description?.trim() || null` 转换；store 不做兜底。
- **[风险] i18n 双语不同步** → 同步修改 `zh-CN.json` 与 `en-US.json`；新增键在两文件中并列存在。

## Migration Plan

无迁移成本：
- `t_proj` 表结构未改。
- 旧数据兼容：现有项目无 `updated_at` 写入记录，但字段已存在；编辑一次后会被刷新。
- 无需数据回填脚本。

回滚策略：直接 `git revert` 即可（无 schema 变更、无破坏性 API 改动）。

## Open Questions

- 是否应在编辑 Modal 顶部展示当前 `created_at`？当前决议：不展示（保持弹窗极简，与新建一致）。
- 编辑成功后是否要 `message.success` 弹出"项目更新成功"？当前决议：是，与创建/删除的反馈风格一致。