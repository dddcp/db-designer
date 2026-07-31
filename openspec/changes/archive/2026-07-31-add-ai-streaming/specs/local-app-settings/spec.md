## MODIFIED Requirements

### Requirement: AI 与 Git 本地配置保存到 JSON 文件
系统 SHALL 将 AI 配置和 Git 配置保存到本地 `settings.json` 文件，而不是 SQLite 的 `t_setting` 表；相关命令 MUST 通过设置服务与本地设置存储实现访问该文件，而不是在命令层直接读写文件。Git 配置字段 MUST 支持远程配置模式、平台、服务地址、仓库路径、自定义远程地址、认证方式、用户名与访问令牌等本地字段，并继续兼容历史保存的 `git_platform`、`git_token` 与 `git_repository`。AI 配置字段 MUST 支持 `ai_base_url`、`ai_api_key`、`ai_model`、`ai_design_common_prompt` 与 `ai_enable_thinking` 等本地字段；`ai_enable_thinking` 缺省时按开启思考处理。

#### Scenario: 保存 AI 配置
- **WHEN** 用户在设置页保存 `ai_base_url`、`ai_api_key`、`ai_model`、`ai_design_common_prompt` 或 `ai_enable_thinking`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 保存扩展后的 Git 配置
- **WHEN** 用户在设置页保存 `git_remote_mode`、`git_platform`、`git_base_url`、`git_repository`、`git_remote_url`、`git_auth_type`、`git_username` 或 `git_token`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 兼容历史 Git 配置字段
- **WHEN** 系统读取 Git 本地配置且仅存在历史保存的 `git_platform`、`git_token` 与 `git_repository`
- **THEN** 系统 SHALL 继续将这些历史字段视为有效 Git 配置来源
