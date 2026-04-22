## MODIFIED Requirements

### Requirement: AI 与 Git 本地配置保存到 JSON 文件
系统 SHALL 将 AI 配置和 Git 配置保存到本地 `settings.json` 文件，而不是 SQLite 的 `t_setting` 表；相关命令 MUST 通过设置服务与本地设置存储实现访问该文件，而不是在命令层直接读写文件。Git 配置字段 MUST 支持远程配置模式、平台、服务地址、仓库路径、自定义远程地址、认证方式、用户名与访问令牌等本地字段，并继续兼容历史保存的 `git_platform`、`git_token` 与 `git_repository`。AI 配置字段 MUST 支持 `ai_base_url`、`ai_api_key`、`ai_model` 与 `ai_design_common_prompt` 等本地字段。`settings.json` MUST 新增 `language` 字段用于持久化用户的语言偏好（`zh-CN` 或 `en-US`）。

#### Scenario: 保存 AI 配置
- **WHEN** 用户在设置页保存 `ai_base_url`、`ai_api_key`、`ai_model` 或 `ai_design_common_prompt`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 保存扩展后的 Git 配置
- **WHEN** 用户在设置页保存 `git_remote_mode`、`git_platform`、`git_base_url`、`git_repository`、`git_remote_url`、`git_auth_type`、`git_username` 或 `git_token`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 保存语言偏好
- **WHEN** 用户在设置页面切换语言
- **THEN** 系统 SHALL 将 `language` 字段（值为 `zh-CN` 或 `en-US`）写入 `settings.json`

#### Scenario: 启动时恢复语言偏好
- **WHEN** 应用启动时 `settings.json` 中存在 `language` 字段
- **THEN** 系统 SHALL 读取该字段并作为 i18n 的初始语言，优先级高于浏览器检测

#### Scenario: 兼容历史 Git 配置字段
- **WHEN** 系统读取 Git 本地配置且仅存在历史保存的 `git_platform`、`git_token` 与 `git_repository`
- **THEN** 系统 SHALL 继续将这些历史字段视为有效 Git 配置来源

## ADDED Requirements

### Requirement: 设置页面提供语言切换入口
系统 SHALL 在设置页面的「基础设置」tab 中提供语言切换下拉框（Select 组件），选项为「简体中文」和「English」。切换后 MUST 立即生效，无需刷新页面。

#### Scenario: 用户切换语言
- **WHEN** 用户在设置页面选择另一种语言
- **THEN** 界面 MUST 立即切换到选择的语言，包括所有页面文字和 Ant Design 组件

#### Scenario: 语言选项文字不受语言切换影响
- **WHEN** 用户打开语言切换下拉框
- **THEN** 各选项的文字 MUST 始终以其母语显示（即「简体中文」始终显示中文，「English」始终显示英文），不跟随当前界面语言变化