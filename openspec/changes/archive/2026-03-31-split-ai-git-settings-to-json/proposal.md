## Why

AI 配置和 Git 配置目前保存在 SQLite 的 `t_setting` 表中，用户在分享数据库设计文件时会连同本机 API Key、Git Token 等本地配置一起带出。需要将这类仅属于本机环境的配置从设计数据中分离出来，避免敏感信息随着设计文件传播。

## What Changes

- 新增本地 `settings.json` 配置存储，用于保存 AI 配置和 Git 配置
- 将 AI 设置页面和 Git 设置页面改为从 `settings.json` 读取与保存配置
- 保留 SQLite `t_setting` 中的其他设置项不变，包括默认数据库类型、自定义数据类型等
- 保持现有数据库设计数据分享方式不变，使分享 SQLite 文件时不包含 AI 和 Git 本地配置

## Capabilities

### New Capabilities
- `local-app-settings`: 支持将仅属于当前设备的 AI 与 Git 配置保存到本地 JSON 文件，而不进入设计数据库

### Modified Capabilities
- 无

## Impact

- 后端：`src-tauri/src/setting.rs` 及相关配置读写逻辑
- 前端：`src/components/setting/ai-tab.tsx`、`src/components/setting/git-tab.tsx`、调用相关设置的页面
- 数据边界：SQLite `t_setting` 与本地 `settings.json` 的职责拆分
- 用户效果：分享设计数据库时不再泄露本地 AI Key 或 Git Token
