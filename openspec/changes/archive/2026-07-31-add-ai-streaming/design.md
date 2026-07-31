## Context

见 `proposal.md - Why`。当前 `src-tauri/src/ai.rs::ai_chat` 用 reqwest 同步等待整个响应（`REQUEST_TIMEOUT_SECS = 120`），payload 仅含 `model` / `messages` / `temperature`，无思考控制字段；前端 `callAiApi`（`ai-design-modal.tsx:54`）被 7 处共用（ai-design / ai-modify-table / ai-recommend-index / ai-review），`ai-sql-tab.tsx` 另有 `callAiSqlApi` 同样走 `ai_chat`。评审 `ai-review-tab.tsx::handleModalOk` 当前通过 `callAiApi` 一次性发送所有表结构。

约束：
- 本 change 构建于 `improve-ai-settings-with-presets` 引入的 `ai.rs` 后端命令层之上（该 change 明确将流式列为 Non-Goal），须在其归档后实施。
- 后端命令保持"参数透传、无状态"风格（baseUrl/apiKey/model 均由前端传入，后端不读 settings）。
- 不引入新 ORM；HTTP 客户端继续用已有 `reqwest`（`rustls-tls` feature 已启用，含 `json`）。

## Goals / Non-Goals

**Goals:**
- 新增 `ai_chat_stream` 流式命令，逐块推送文本增量直至完成。
- AI 评审改用流式命令并展示实时进度。
- 新增 `ai_enable_thinking` 本地配置，`ai_chat` / `ai_chat_stream` 据此控制请求体的思考字段。
- 现有 4 个 `callAiApi` 调用方与 `ai-sql` 的非流式行为零回归。

**Non-Goals:**
- 不把 `ai_chat` 改为流式（保持同步语义）。
- 不改 ai-design / ai-sql / 推荐索引 / 修改表的调用方式。
- 不做思考字段的供应商自动映射（当前固定 `enable_thinking`，主要适配 qwen）。
- 不做表结构分批/抽样送审（留待将来作为大项目的另一条优化路径）。
- 不做 key 加密 / 多 key / 模型列表缓存。

## Decisions

### D1. 流式传输使用 Tauri v2 `Channel`
**决定**：`ai_chat_stream` 命令签名增加一个 `on_event: tauri::ipc::Channel<StreamChunk>` 参数，后端每解析出一个文本增量就 `on_event.send(StreamChunk::Delta{...})`，生成结束时 `send(StreamChunk::Done)`；`StreamChunk` 仅含 `Delta { content }` 与 `Done` 两个变体。错误统一以命令 `Result::Err` 返回（与 `ai_chat` 一致，前端在 `invoke` 的 catch 中处理），不另设 error chunk。

**理由**：Tauri v2 的 `Channel<T>` 是专为"命令向前端流式推送"设计的 IPC 原语，类型安全、自动随命令生命周期管理，前端用 `invoke` 传入 `Channel` 实例即可收回调。

**备选**：用 `app.emit("ai-stream-<id>", ...)` 事件流。需要前端 `listen` / `unlisten`、手造唯一事件名、处理并发请求串扰与 Modal 关闭后的泄漏。复杂且易错，已否决。

### D2. SSE 解析在 `ai.rs` 内手工完成
**决定**：用 `reqwest::Response::bytes_stream()` 逐块读取 body，按 SSE 协议（`data: ` 前缀、`\n\n` 分隔、`[DONE]` 结束）解析，提取 `choices[0].delta.content`；跳过空行与心跳注释行。

**理由**：OpenAI / qwen / DeepSeek 等兼容接口均为标准 SSE，解析逻辑简单，无需新依赖。

**备选**：引入 `eventsource-stream` 或 `reqwest-streams`。新增依赖收益有限，已否决。

### D3. 新增 `ai_chat_stream`，不改 `ai_chat` 的流式语义
**决定**：流式走独立命令；`ai_chat` 仅新增可选参数 `enable_thinking: Option<bool>`，返回值与超时语义不变。

**理由**：4 个 `callAiApi` 调用方与 `callAiSqlApi` 都 `await` 完整字符串，改 `ai_chat` 为流式会破坏它们的同步消费。独立命令实现评审专用的流式通路，其余功能零侵入。

**备选**：改造 `ai_chat` 全局流式，前端统一改造。回归面大、风险高，已否决。

### D4. `enable_thinking` 作为命令参数透传
**决定**：`ai_chat` / `ai_chat_stream` 均增加 `enable_thinking: Option<bool>` 参数；`callAiApi` 读取 `ai_enable_thinking` 设置后透传，缺省视为 `true`。

**理由**：与现有 `ai_chat` 参数风格一致（配置由前端读取并传入，后端不读 settings），保持后端无状态、易测。

**备选**：后端命令自行读 settings。打破既有透传风格，已否决。

### D5. 请求体思考字段固定为 `enable_thinking`
**决定**：当 `enable_thinking == Some(false)` 时，请求体附加 `"enable_thinking": false`；`true` 或缺省时不附加（保持模型默认）。

**理由**：触发本问题的主要是 qwen3（DashScope 兼容接口认 `enable_thinking`）；多数 OpenAI 兼容中转会忽略未知字段，附加是安全的。

**备选**：按 `ai_provider` 切换字段名（如 OpenAI o-series 的 `reasoning_effort`）。增加复杂度且当前无该诉求，留作 Open Question。

### D6. 思考开关默认开启
**决定**：`ai_enable_thinking` 缺省为 `true`（保持现状）。

**理由**：ai-design / ai-sql 等功能现状依赖思考且能正常完成，默认关闭会降低其质量。评审由流式保底后即使开思考也能完成；开关仅为"愿以质量换速度"的用户提供选项。

### D7. 评审进度以累积文本形式展示
**决定**：评审 Modal 生成中将收到的 `delta` 实时拼接到一个只读区域，完成后再走既有 `parseReviewResult` → `save_ai_review` 流程。

**理由**：流式本就在产出文本，复用为进度反馈成本最低、信息量最大；避免用户误判卡死。

## Risks / Trade-offs

- **[R1] 思考字段供应商差异** → 仅 qwen/DashScope 确认支持 `enable_thinking`；其他供应商可能忽略。缓解：默认附加（多数接口忽略未知字段）；文档注明主要适配 qwen，按需扩展。
- **[R2] SSE 解析鲁棒性** → 不同供应商在心跳行、缺 `data:` 前缀、`[DONE]` 缺失等边界上可能不同。缓解：解析器跳过空行/注释、按 `[DONE]` 与流结束双重判断、容错跳过无法解析的块并继续。
- **[R3] 流式 + 开思考仍偏慢** → 流式消除了超时，但开思考时总耗时不变。缓解：进度展示改善体感；用户可关思考加速。
- **[R4] 与 `improve-ai-settings-with-presets` 的 spec 协作冲突** → 两 change 均修改 `local-app-settings` 的"AI 与 Git 本地配置保存到 JSON 文件"requirement（前者加 `ai_provider`，本 change 加 `ai_enable_thinking`），且本 change 又修改其引入的 `ai-backend-gateway`。缓解：本 change 依赖前者先行归档；归档本 change 前须将该 requirement 的 delta rebase 到前者归档后的 spec（合并 `ai_provider` 字段）。见 Open Questions。
- **[R5] 评审中途关闭 Modal 的流式清理** → 用户关闭 Modal 时流式可能仍在推送。缓解：前端在关闭/卸载时注销 Channel 回调；后端在推送失败（对端关闭）时停止读取并结束任务。

## Migration Plan

- 纯增量部署：新增 `ai_chat_stream` 命令、`ai_enable_thinking` 配置键、设置页开关。老用户无 `ai_enable_thinking` 时按 `true` 处理，行为与现状一致。
- 回滚：注释掉 `ai_chat_stream` 的 handler 注册，评审回退调用 `callAiApi`（非流式）；`ai_enable_thinking` 键被忽略未知键机制自然兼容。

## Open Questions

- **Q1** `enable_thinking` 是否需要按 `ai_provider` 自动切换字段名（如 OpenAI o-series 的 `reasoning_effort`）？当前固定 `enable_thinking`，等出现其他供应商诉求再做。
- **Q2** 流式 chunk 是否需要把 qwen 的思考内容（`reasoning_content`）与正文（`content`）分开推送？当前合并为单一 `delta`，是否单独暴露思考流待定。
- **Q3** `local-app-settings` 与 `ai-backend-gateway` delta 相对 `improve-ai-settings-with-presets` 的 rebase 时机与责任人，待该 change 归档时确认。
