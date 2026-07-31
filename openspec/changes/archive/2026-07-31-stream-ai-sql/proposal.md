## Why

AI SQL 对话当前通过同步命令 `ai_chat` 获取完整回复：用户发送自然语言后，界面只显示无变化的 loading 态，直到 AI 一次性返回——期间没有任何进度反馈，遇到多表关联查询或默认开启思考链的模型时，体感像"卡死"。后端通用的流式命令 `ai_chat_stream`（由 `add-ai-streaming` 引入、AI 评审已启用）已经就绪，AISQL 作为另一个消费者直接复用即可，让用户在生成过程中看到 AI 的实时输出，并顺带消除重 SQL 任务被同步命令整体超时切断的隐患。

## What Changes

- 前端 `ai-sql-tab.tsx` 的 `callAiSqlApi` 由同步 `ai_chat` 改用流式 `ai_chat_stream` + Tauri `Channel`，逐块累积 AI 原始输出文本。
- assistant 气泡顶部新增**可折叠的「AI 原文输出」区域**：流式生成期间逐字填充 AI 原文（保留 JSON 等原始结构，不做字段提取），生成完成后自动折叠。
- 流式生成结束后，从累积原文一次性提取 `sql` 并在原文区域下方高亮展示；`explanation` 说明块保留。
- `AiSqlMessage` 新增 `rawText` 字段持久化 AI 原始流文本，历史对话可展开回看。
- 流式增量仅局部更新当前气泡，避免整个消息列表高频重渲染；切换对话 / 卸载时取消进行中的流式。
- **后端零改动**：`ai_chat_stream` 与 `StreamChunk` 契约已通用，本 change 不修改 `ai.rs` / `lib.rs` / SQLite schema。

## Capabilities

### Modified Capabilities
- `ai-sql-generation`：`callAiSqlApi` 改为流式消费（经 `ai_chat_stream` 逐块累积原文、结束后解析）；assistant 气泡新增可折叠原文展示与流式后 SQL 提取；`AiSqlMessage` 新增 `rawText` 持久化字段。

### 复用（不修改）
- `ai-streaming`：后端流式命令契约与"流式期间展示进度"语义已泛化，AISQL 作为新增消费者直接复用，本 change 不修改该 capability。

## Impact

- 前端：`src/components/proj-detail/ai-sql-tab.tsx`（`AiSqlMessage` 类型、`callAiSqlApi`、`handleSend`、`AssistantBubble`、流式局部 state、取消逻辑）；对应的 `ai-sql-tab.module.scss`（原文区域样式）。
- i18n：`zh-CN.json` / `en-US.json` 新增原文区域标题、生成中占位等文案。
- 后端：**无**（`ai_chat_stream` 已注册且通用）。
- 类型：`AiSqlMessage` 新增 `rawText` 为前端本地字段；后端 `t_ai_sql_conversation.messages` 仍为 JSON 字符串、不感知其内部字段，无需同步 Rust struct。
- 不影响：同步 `ai_chat` 及其调用方（ai-design / 评审 / 推荐索引 / 修改表）、SQLite schema、settings、其他 Tab。
