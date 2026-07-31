## 1. 类型与数据

- [x] 1.1 在 `src/components/proj-detail/ai-sql-tab.tsx` 的 `AiSqlMessage` 接口新增 `rawText?: string` 字段

## 2. 流式调用改造

- [x] 2.1 将 `callAiSqlApi` 由 `invoke('ai_chat')` 改为 `invoke('ai_chat_stream')`：新建 `Channel<StreamChunk>`，`onmessage` 中累积 `delta.content` 为原文，透传 `enableThinking`，流式结束后对累积原文执行既有容错解析返回 `{ rawText, sql, explanation }`
- [x] 2.2 改造 `handleSend`：发送时先 push 一条占位 assistant 消息；流式期间用独立 `streamingRaw` 局部 state 累积原文并驱动当前气泡；流式结束后将 `rawText` / `sql` / `explanation` 合并进 `localMessages` 并 `save_ai_sql_conversation`

## 3. 气泡渲染

- [x] 3.1 在 `AssistantBubble` 顶部新增可折叠「AI 原文输出」区域（`Collapse` + `<pre>`），内容渲染 `msg.rawText`（流式中渲染 `streamingRaw`）
- [x] 3.2 流式中：原文区域展开、逐字填充，SQL 区域显示生成中占位；流完 / 历史：原文区域默认折叠，SQL 经 `formatAndHighlightSql` 高亮展示，explanation 块保留
- [x] 3.3 在 `ai-sql-tab.module.scss` 增加原文区域样式（折叠头、`<pre>` 滚动与换行）

## 4. 取消与清理

- [x] 4.1 切换对话 / 组件卸载时注销 `Channel` 回调触发后端取消；流式中途取消时丢弃未完成的占位消息、不落库

## 5. i18n

- [x] 5.1 在 `src/i18n/locales/zh-CN.json` 与 `en-US.json` 新增原文区域标题（如 `ai_sql_raw_output`）、生成中占位等文案

## 6. 验证

- [x] 6.1 前端类型检查：`npx tsc --noEmit` 无错误
- [x] 6.2 后端类型检查：`cd src-tauri && cargo check` 无错误（确认零后端改动无回归）
- [ ] 6.3 手动：发送 SQL 请求，观察原文逐字流式、完成后 SQL 高亮出现、原文可折叠 / 展开
- [ ] 6.4 手动：历史对话 assistant 消息可展开原文；流式中切换对话不残留占位消息
- [x] 6.5 `openspec validate stream-ai-sql` 通过
