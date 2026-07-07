## Why

设置页的 AI 配置当前要求用户手动填入 `ai_base_url`、`ai_api_key`、`ai_model` 三个字段才能使用，对不熟悉各供应商接入地址的用户门槛较高；同时缺少连通性验证手段，填错要等真正调用 AI 时才能发现。本次改造在保持 OpenAI 兼容协议不变的前提下，内置常用供应商预设、提供"测试连接 / 拉取模型列表"按钮，并收拢分散在前端的 AI HTTP 调用逻辑到后端，方便后续扩展。

## What Changes

- 在前端新增供应商预设常量（custom / openai / qwen / deepseek / kimi / zhipu / ernie / opencode-go），选择供应商时自动填入对应的 `baseUrl`。
- 模型字段改为下拉选择 + 自由输入的组合：点击"测试连接"按钮后端调用 `GET {baseUrl}/models` 同时验证连通性并拉取模型列表，用户从列表中选择或手动输入。
- 通用提示词字段保持不变。
- 新增后端 Tauri 命令 `ai_test_connection`、`ai_fetch_models`、`ai_chat`，将原本散落在前端 5 个调用点的 `tauriFetch` + URL 拼接逻辑统一到后端 `src-tauri/src/ai.rs`。
- 新增本地配置键 `ai_provider`（供应商 id），与现有 `ai_base_url` / `ai_api_key` / `ai_model` / `ai_design_common_prompt` 并存；老用户无 `ai_provider` 时按 custom 处理，原配置完全保留。
- 新增 i18n 文案：8 个供应商名称、测试连接 / 拉取模型 / 模型相关提示的中英文条目。

## Capabilities

### New Capabilities

- `ai-provider-presets`：覆盖供应商预设定义、用户选择与 baseUrl 自动填充、模型下拉与拉取、测试连接行为。
- `ai-backend-gateway`：覆盖后端 `ai.rs` 提供的三个 Tauri 命令（chat / fetch_models / test_connection）及其 URL 推导与错误处理语义。

### Modified Capabilities

- `local-app-settings`：扩展 AI 配置键集合，新增 `ai_provider` 字段并定义其与 `ai_base_url` 的并存语义、缺省回退到 custom 的行为。

## Impact

- 前端：`src/components/setting/ai-tab.tsx` 重写；新增 `src/data/ai-providers.ts`；`src/components/proj-detail/ai-design-modal.tsx`、`ai-modify-table-modal.tsx`、`ai-recommend-index-modal.tsx`、`ai-review-tab.tsx`、`ai-sql-tab.tsx` 中的 AI 调用从 `tauriFetch` 改为 `invoke('ai_chat', ...)`。
- 后端：新增 `src-tauri/src/ai.rs` 与对应 `models.rs` 入参结构；`src-tauri/src/lib.rs` 注册 3 个新命令；`src-tauri/Cargo.toml` 引入 `reqwest` 依赖（若尚未引入）。
- i18n：`src/i18n/locales/zh-CN.json` 与 `en-US.json` 新增约 30 条 key；不删除任何旧 key。
- 不影响：settings.json 文件结构、SQLite schema、其他设置页（basic / git / database / dataType）、现有 AI 调用方对返回 JSON 内容的解析逻辑。
