## Why

AI 评审会把整个项目的表结构送进 LLM 做全面审查，是所有 AI 功能里最重的推理任务。当前 `ai_chat` 是**非流式**调用且设有硬超时，遇到 qwen3 等默认开启思考链（thinking）的模型时，模型在生成可见正文前会先进行长篇思考，客户端在整个过程中收不到任何字节，要么被后端超时切断，要么被中间网关按"长时间无响应"掐断，用户表现为"转很久后必然失败"——实测 6 张表即失败、50+ 张表必失败。而新建表 / 写 SQL / 推荐索引等轻量任务因推理时间短尚能完成（仅偏慢），证明问题不在后端命令本身，而在"重任务 + 非流式 + 思考耗时"的组合。

## What Changes

- 后端新增流式 Tauri 命令 `ai_chat_stream`：以 `stream: true` 发起请求，解析 SSE 增量片段，通过 Tauri v2 `Channel` 向前端逐块推送文本，避免长时间无响应被超时或网关切断。
- AI 评审 tab 由 `ai_chat` 改用 `ai_chat_stream`，并在生成过程中向用户展示进度（实时累积的文本 / 思考状态）。
- 新增本地配置键 `ai_enable_thinking`，设置页提供开关；`ai_chat` 与 `ai_chat_stream` 的请求体 SHALL 视该值决定是否附加控制模型思考的字段（如 `enable_thinking`），默认保持现状（开启思考）。
- 现有 `ai_chat`（非流式）与 ai-design / ai-sql / 推荐索引 / 修改表 4 个共用 `callAiApi` 的调用点**保持不变**，零回归风险。

## Capabilities

### New Capabilities
- `ai-streaming`: 覆盖后端流式命令 `ai_chat_stream` 的契约（SSE 解析、经 Channel 逐块推送文本、错误处理）以及评审场景对流式结果的消费与进度展示语义。

### Modified Capabilities
- `ai-backend-gateway`: 扩展 `ai_chat`（及新增的 `ai_chat_stream`）的请求体构造规则——SHALL 接受 `enable_thinking` 输入并据此决定是否在请求体附加思考控制字段；流式命令复用与 `ai_chat` 相同的 baseUrl 推导、鉴权与错误分类逻辑。本 capability 由 in-progress 的 `improve-ai-settings-with-presets` 引入，本 change 依赖其先行归档。
- `local-app-settings`: 扩展 AI 本地配置字段集合，新增 `ai_enable_thinking` 键及其持久化与缺省回退语义。

## Impact

- 后端：`src-tauri/src/ai.rs` 新增 `ai_chat_stream` 命令（reqwest 流式 + SSE 解析 + `Channel` 推送）、为 `ai_chat` 增加 `enable_thinking` 参数及请求体条件附加逻辑；`src-tauri/src/lib.rs` 注册新命令。
- 前端：`src/components/setting/ai-tab.tsx` 新增思考开关；`src/components/proj-detail/ai-design-modal.tsx` 的 `callAiApi` 读取并透传 `ai_enable_thinking`；`src/components/proj-detail/ai-review-tab.tsx` 改用流式命令并增加进度展示。
- 配置：`src-tauri/src/services/setting_service.rs` 的 `LOCAL_SETTING_KEYS` 白名单加入 `ai_enable_thinking`；i18n 两份 locale 新增思考开关与评审进度相关文案。
- 依赖：本 change 构建于 `improve-ai-settings-with-presets` 引入的后端 AI 命令层之上，须在其归档后实施。
- 不影响：现有 `ai_chat` 非流式调用方、SQLite schema、settings.json 文件结构、其他设置页。
