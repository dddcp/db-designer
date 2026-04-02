## MODIFIED Requirements

### Requirement: AI 与 Git 本地配置保存到 JSON 文件
系统 SHALL 将 AI 配置和 Git 配置保存到本地 `settings.json` 文件，而不是 SQLite 的 `t_setting` 表；相关命令 MUST 通过设置服务与本地设置存储实现访问该文件，而不是在命令层直接读写文件。Git 配置字段 MUST 支持远程配置模式、平台、服务地址、仓库路径、自定义远程地址、认证方式、用户名与访问令牌等本地字段，并继续兼容历史保存的 `git_platform`、`git_token` 与 `git_repository`。

#### Scenario: 保存 AI 配置
- **WHEN** 用户在设置页保存 `ai_base_url`、`ai_api_key` 或 `ai_model`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 保存扩展后的 Git 配置
- **WHEN** 用户在设置页保存 `git_remote_mode`、`git_platform`、`git_base_url`、`git_repository`、`git_remote_url`、`git_auth_type`、`git_username` 或 `git_token`
- **THEN** 系统 SHALL 将这些值写入本地 `settings.json` 文件

#### Scenario: 兼容历史 Git 配置字段
- **WHEN** 系统读取 Git 本地配置且仅存在历史保存的 `git_platform`、`git_token` 与 `git_repository`
- **THEN** 系统 SHALL 继续将这些历史字段视为有效 Git 配置来源

### Requirement: 其他设置继续保存在 SQLite
系统 SHALL 保持非 AI、非 Git 的其他设置继续使用 SQLite `t_setting` 表存储；相关命令 MUST 通过抽象的设置存储实现访问 SQLite，而不是在命令层直接执行 SQL。

#### Scenario: 保存默认数据库类型
- **WHEN** 用户保存 `default_database_type`
- **THEN** 系统 SHALL 继续写入 SQLite `t_setting` 表

#### Scenario: 保存自定义数据类型
- **WHEN** 系统保存 `custom_data_types`
- **THEN** 系统 SHALL 继续写入 SQLite `t_setting` 表

### Requirement: 分享设计数据库时不包含 AI 与 Git 本地配置
当用户分享 SQLite 设计数据库文件时，文件内容 MUST 不包含 AI Key、Git Token 及其他 AI/Git 本地配置。

#### Scenario: 分享数据库文件
- **WHEN** 用户将 `db_designer.db` 分享给其他人
- **THEN** 该数据库文件 MUST 不包含 `ai_*` 和 `git_*` 配置项

### Requirement: 本地 JSON 配置文件缺失时可正常工作
系统 SHALL 在 `settings.json` 不存在时返回空本地配置，并在首次保存相关配置时创建该文件；首次读取时如历史数据仍在 SQLite，迁移流程 MUST 通过设置服务协调本地文件存储与 SQLite 设置存储完成。

#### Scenario: 首次启动尚未创建配置文件
- **WHEN** 系统读取本地 AI/Git 配置且 `settings.json` 不存在
- **THEN** 系统 SHALL 返回空结果而不是报错

#### Scenario: 首次保存创建配置文件
- **WHEN** 用户首次保存任一 AI 或 Git 配置且 `settings.json` 不存在
- **THEN** 系统 SHALL 自动创建 `settings.json` 并写入配置

#### Scenario: 历史本地配置从 SQLite 迁移到 JSON
- **WHEN** 系统首次读取某个 AI 或 Git 本地配置且该配置仍存在于 SQLite `t_setting` 表
- **THEN** 系统 SHALL 通过设置服务将该值迁移到 `settings.json`，并从 SQLite 中移除对应配置项
