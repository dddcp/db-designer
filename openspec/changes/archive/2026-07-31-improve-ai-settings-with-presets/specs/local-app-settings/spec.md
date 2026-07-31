## MODIFIED Requirements

### Requirement: AI 与 Git 本地配置保存到 JSON 文件
系统 SHALL 将 AI 配置和 Git 配置保存到本地 `settings.json` 文件，而不是 SQLite 的 `t_setting` 表；相关命令 MUST 通过设置服务与本地设置存储实现访问该文件，而不是在命令层直接读写文件。Git 配置字段 MUST 支持远程配置模式、平台、服务地址、仓库路径、自定义远程地址、认证方式、用户名与访问令牌等本地字段，并继续兼容历史保存的 `git_platform`、`git_token` 与 `git_repository`。AI 配置字段 MUST 支持 `ai_provider`、`ai_base_url`、`ai_api_key`、`ai_model` 与 `ai_design_common_prompt` 等本地字段，其中 `ai_provider` 用于记录用户在设置页选择的供应商 id。

#### Scenario: 保存 AI 配置
- **WHEN** 用户在设置页保存 `ai_provider`、`ai_base_url`、`ai_api_key`、`ai_model` 或 `ai_design_common_prompt`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 保存扩展后的 Git 配置
- **WHEN** 用户在设置页保存 `git_remote_mode`、`git_platform`、`git_base_url`、`git_repository`、`git_remote_url`、`git_auth_type`、`git_username` 或 `git_token`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 兼容历史 Git 配置字段
- **WHEN** 系统读取 Git 本地配置且仅存在历史保存的 `git_platform`、`git_token` 与 `git_repository`
- **THEN** 系统 SHALL 继续将这些历史字段视为有效 Git 配置来源

### Requirement: 缺省 ai_provider 时按 custom 处理
当本地 `settings.json` 中未设置 `ai_provider` 键或其值不在当前供应商预设列表内时，系统 SHALL 将该情况视作用户选择了 custom 供应商，但 MUST 保留 `ai_base_url` / `ai_api_key` / `ai_model` / `ai_design_common_prompt` 既有值不被覆盖。

#### Scenario: 旧用户无 ai_provider 字段
- **WHEN** 系统读取 AI 配置且 `settings.json` 中不存在 `ai_provider`
- **THEN** 系统 SHALL 在 UI 上将供应商下拉默认展示为 custom，但 SHALL 不修改 `ai_base_url` 等其它已存值

#### Scenario: ai_provider 值不在预设列表
- **WHEN** `settings.json` 中的 `ai_provider` 值无法在预设列表中找到
- **THEN** 系统 SHALL 将其视为 custom 处理，UI 上提示或回退到 custom 下拉项
