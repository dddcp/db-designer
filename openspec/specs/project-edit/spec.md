## ADDED Requirements

### Requirement: 后端提供 update_project 命令

系统 SHALL 提供 `update_project` Tauri 命令，接受 `UpdateProjectRequest { id, name, description }`，更新 `t_proj` 表对应记录的 `name` 与 `description` 字段，同时将 `updated_at` 刷新为当前时间，并返回更新后的 `Project`。当指定的 `id` 在 `t_proj` 中不存在时，命令 MUST 返回错误。

#### Scenario: 编辑项目名称与描述
- **WHEN** 前端调用 `update_project`，传入 `id` 存在且 `name` 非空、`description` 非 null
- **THEN** 系统 SHALL 更新对应项目的 `name` 与 `description`，刷新 `updated_at`，并返回更新后的 `Project`

#### Scenario: 编辑时描述为空字符串
- **WHEN** 前端调用 `update_project`，传入 `description` 为空字符串（前端已规范化为 `null`）
- **THEN** 系统 SHALL 将 `t_proj.description` 存为 `null`，并返回更新后的 `Project`

#### Scenario: 编辑不存在的项目
- **WHEN** 前端调用 `update_project`，传入数据库中不存在的 `id`
- **THEN** 系统 SHALL 返回错误，且 MUST 不修改任何记录

### Requirement: 后端 update_project 遵循分层架构

`update_project` 命令 MUST 通过 `ProjectService` 委托给 `ProjectStore::update_project`，并由 `SqliteProjectStore` 通过 `init_db()` 获取连接执行 SQL。命令层 MUST 不直接执行 SQL。

#### Scenario: 命令经由 service 与 store
- **WHEN** Tauri 命令 `update_project` 被调用
- **THEN** 调用链 MUST 依次经过 `ProjectService::update_project` 与 `ProjectStore::update_project` 实现

### Requirement: 前端项目卡片提供编辑入口

项目列表卡片底部操作区 SHALL 提供三个图标按钮，从左到右依次为"查看"、"编辑"、"删除"。其中"查看"按钮 SHALL 调用 `handleProjectClick(project.id)` 进行页面跳转；"编辑"按钮 SHALL 打开项目编辑 Modal；"删除"按钮 SHALL 维持现有 Popconfirm 二次确认。三个按钮 MUST 各自带有 `Tooltip` 提示，并 MUST 通过 `e.stopPropagation()` 阻止冒泡，避免触发卡片的整体跳转。

#### Scenario: 点击编辑按钮打开编辑 Modal
- **WHEN** 用户点击项目卡片的"编辑"图标按钮
- **THEN** 系统 SHALL 打开编辑 Modal，并填充当前项目的 `name` 与 `description`

#### Scenario: 点击编辑按钮不触发跳转
- **WHEN** 用户点击"编辑"按钮
- **THEN** 系统 MUST NOT 触发项目卡片的整体点击跳转行为

### Requirement: 新建与编辑共用一个 Modal 组件

系统 SHALL 提供单一 Modal 组件用于"新建项目"与"编辑项目"两种场景，通过 `mode: 'create' | 'edit'` prop 切换行为：
- 标题：create 模式显示"创建新项目"，edit 模式显示"编辑项目"。
- 提交按钮文案：create 模式为"创建"，edit 模式为"保存"。
- 提交函数：create 模式调用 `handleCreateProject`，edit 模式调用 `handleUpdateProject`。
- 表单初始值：create 模式为空，edit 模式为当前项目的 `name` 与 `description`。

#### Scenario: create 模式表现
- **WHEN** Modal 以 `mode='create'` 打开
- **THEN** 标题为"创建新项目"、提交按钮文案为"创建"、表单字段为空

#### Scenario: edit 模式表现
- **WHEN** Modal 以 `mode='edit'` 打开
- **THEN** 标题为"编辑项目"、提交按钮文案为"保存"、表单字段填充当前项目的 `name` 与 `description`

### Requirement: 编辑提交时规范化 description 为 null

前端 SHALL 在 `handleUpdateProject` 提交前，对 `description` 调用 `description?.trim() || null`，确保空字符串与纯空白输入被规范化为 `null`。后端 store 层 MUST 忠实存储该值，不做隐式转换。

#### Scenario: 描述为空字符串时存为 null
- **WHEN** 用户在编辑 Modal 中将描述清空后保存
- **THEN** 系统 SHALL 向前端 `update_project` 传入 `description: null`

#### Scenario: 描述为空白字符时存为 null
- **WHEN** 用户在编辑 Modal 中将描述填为空白字符后保存
- **THEN** 系统 SHALL 向前端 `update_project` 传入 `description: null`

### Requirement: 编辑成功后刷新列表

编辑成功后，系统 SHALL 调用 `loadProjects()` 重新拉取项目列表，使卡片上的最新 `name` 与 `description` 立即反映到 UI。失败时 SHALL 通过 `message.error` 提示错误，并 MUST NOT 重新拉取列表。

#### Scenario: 成功更新
- **WHEN** `update_project` 调用成功返回
- **THEN** 系统 SHALL 关闭 Modal、显示成功提示、调用 `loadProjects()` 刷新列表

#### Scenario: 更新失败
- **WHEN** `update_project` 调用返回错误
- **THEN** 系统 SHALL 保持 Modal 开启（或根据 UX 决定关闭）、显示失败提示，且 MUST NOT 刷新列表

### Requirement: 国际化覆盖中英文

`src/i18n/locales/zh-CN.json` 与 `src/i18n/locales/en-US.json` SHALL 同步提供以下键：`main_edit_project`、`main_update_success`、`main_update_fail`、`main_edit`（图标按钮的 Tooltip 提示）。新增键 MUST 在两个语言文件中并列存在，不得只新增其一。

#### Scenario: 新增键在两种语言中均存在
- **WHEN** 编辑功能被启用
- **THEN** `zh-CN.json` 与 `en-US.json` MUST 同时包含上述四个键
