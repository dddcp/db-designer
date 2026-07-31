## Context

见 `proposal.md - Why`。当前 `src/components/proj-detail/ai-sql-tab.tsx::callAiSqlApi`（约 line 120）通过同步 `invoke('ai_chat')` 获取完整回复，前端 `await` 后一次性 `JSON.parse` 提取 `{ sql, explanation }`；`AssistantBubble`（约 line 649）按"SQL 块（高亮+复制）+ explanation 块"渲染，`content` 字段不直接展示。后端通用流式命令 `ai_chat_stream`（`src-tauri/src/ai.rs`）与 `StreamChunk`（`Delta { content } | Done`）已由 `add-ai-streaming` 引入并经 AI 评审验证，AISQL 可直接作为消费者复用。

约束：
- 后端保持"参数透传、无状态"风格；本 change 不修改 `ai.rs` / `lib.rs` / SQLite schema。
- `AiSqlMessage` 是前端本地类型，其 messages 以 JSON 字符串存入 `t_ai_sql_conversation.messages`，后端不感知内部字段。
- 输出格式沿用现状（裸 JSON `{"sql","explanation"}`），不改 prompt。

## Goals / Non-Goals

**Goals:**
- AISQL 改用 `ai_chat_stream`，生成过程中实时展示 AI 原文。
- `rawText` 持久化，历史对话可回看原文。
- 可折叠原文区域 + 流式后提取高亮 SQL，explanation 保留。
- 流式增量局部更新，避免整个消息列表高频重渲染。
- 切换对话 / 卸载时取消进行中的流式。

**Non-Goals:**
- 不改后端流式命令契约 / 同步 `ai_chat`。
- 不让 SQL 边流边长（流完一次性提取，已由用户决定）。
- 不做流式 JSON 字段提取（原文整体展示）。
- 不改 prompt 输出格式；不改 ai-design / 评审 / 推荐索引 / 修改表。
- 不改 SQLite schema 与 settings。

## Decisions

### D1. 复用 `ai_chat_stream`，后端零改动
**决定**：`callAiSqlApi` 改用既有的通用流式命令 `ai_chat_stream`，前端经 `Channel<StreamChunk>` 接收增量；后端不新增任何命令或参数。

**理由**：`ai_chat_stream` 在 `add-ai-streaming` 中已实现为通用流式通路（baseUrl 推导、鉴权、SSE 解析、错误分类均与 `ai_chat` 共享），AISQL 与评审的需求完全一致，复用即可。

**备选**：为 AISQL 新建专用流式命令。重复实现，已否决。

### D2. 流式期间展示 AI 原文（含 JSON 壳），不做字段提取
**决定**：流式增量直接累积为原始文本逐字展示，不实时解析半截 JSON 提取 `sql`/`explanation` 字段；`sql` 在流式结束后一次性从容错解析中取得。

**理由**：用户明确选择"原文输出 + 流完提取 SQL"路线，优先实现简洁与结构稳定。原文本身既是有效的进度反馈，也提供了 AI 输出的透明度（可看到思考链、JSON 结构）。

**备选**：(B) 改 prompt 顺序让 explanation 先流式；(C) 改 Markdown 输出边流边渲染代码块；(D) 实时流式 JSON 字段提取。三者或破坏结构化字段、或需自写流式解析器，均已被用户否决。

### D3. 原文收进可折叠区域，不当气泡正文
**决定**：AI 原文展示在 assistant 气泡顶部一个可折叠区域内，而非直接铺在气泡正文。

**理由**：原文含 JSON 壳与可能的思考链，直接当正文会污染主气泡、掩盖真正关心的 SQL。折叠区域兼顾"过程可见"与"结果整洁"，思路与评审详情页底部 `Collapse「查看 AI 原始响应」`一致。

**备选**：原文直接铺在气泡正文。JSON 碎片丑陋，已否决。

### D4. SQL 流完后从累积原文一次性提取 + 高亮
**决定**：流式结束后对累积原文执行既有容错解析得到 `sql`，复用 `formatAndHighlightSql` 高亮展示在原文区域下方。

**理由**：与 D2 一致，最简；复用现有解析与高亮逻辑。

**代价**：SQL 出现时机晚于原文（要等流完）。用户已接受；原文区域提供过程可见性作为补偿。

### D5. `rawText` 持久化进 `AiSqlMessage`
**决定**：`AiSqlMessage` 新增 `rawText?: string`，随对话 messages JSON 一并持久化；历史气泡可展开回看。

**理由**：用户要求持久化。后端 `messages` 为字符串字段、不感知内部结构，加字段无需 Rust 侧改动或数据迁移。

**备选**：仅当次流式可见、不持久化。历史对话丢失原文，已否决。

### D6. 流式增量用局部 state 驱动当前气泡
**决定**：流式期间用独立的 `streamingRaw` 局部 state 累积原文、只驱动当前生成中的气泡，而非每个 delta 都 `setLocalMessages` 触发整列表重渲染；流完再合并进 `localMessages`。

**理由**：消息较多时，逐 delta 重渲染整个聊天列表会卡顿。此模式与评审 `streamingText` 一致。

**备选**：每个 delta `setLocalMessages` 更新最后一条。高频全量重渲染，已否决。

### D7. 折叠默认态：流式中展开、完成后折叠、历史折叠
**决定**：生成中原文区域默认展开（让用户看到进度），生成结束自动折叠；历史消息默认折叠。

**理由**：流式中需要过程反馈，完成后 JSON 壳不必常驻视线。

### D8. 取消：Channel 失效即停止
**决定**：切换对话 / 组件卸载时让前端 `Channel` 失效，后端 `on_event.send` 失败即停止读取并结束任务（复用 `ai_chat_stream` 既有的"推送失败即取消"机制）。

**理由**：与评审 `R5` 的清理策略一致，无需新增取消协议。

## Risks / Trade-offs

- **[R1] SQL 出现晚** → SQL 要等原文流完才提取展示。缓解：原文区域提供完整过程可见性；用户已明确接受此取舍。
- **[R2] 原文冗长** → 含 JSON 壳 / 思考链的原文可能很长。缓解：完成后默认折叠，按需展开。
- **[R3] `rawText` 增加存储** → 每条 assistant 消息多存一段原文文本。缓解：可接受；老对话无 `rawText` 时原文区域不渲染，向后兼容。
- **[R4] 中途取消的部分消息** → 流式中途取消时已累积不完整的原文。缓解：丢弃占位消息、不落库（见 Open Questions Q1）。
- **[R5] 高频 delta 重渲染** → 流式 delta 频率高。缓解：D6 局部 state 仅驱动当前气泡。

## Migration Plan

- 纯前端增量部署：老对话的 messages JSON 无 `rawText` 字段，加载时为 `undefined`，原文区域不渲染，其余展示不受影响。零数据迁移。
- 回滚：`callAiSqlApi` 回退调用 `ai_chat`；`rawText` 作为多余键被旧前端忽略（JSON 多余字段无害）。

## Open Questions

- **Q1** 流式中途取消（切换对话 / 卸载）时，已部分生成的占位 assistant 消息如何处理？倾向：丢弃该条、不落库，保持对话干净；是否尝试解析已累积部分作为降级结果待定。
- **Q2** 原文区域是否需要"复制原文"按钮？当前不加，按需再议。
- **Q3** explanation 与 SQL 块的上下顺序（现状 SQL 在上、explanation 在下）是否需要调整？倾向保持现状，原文区域加在最顶部即可。
