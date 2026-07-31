## Context

后端 `ai_chat_stream` 与 `StreamChunk`（Delta/Done）、SSE 解析、"关 Channel 即取消"机制均已就绪（见 `src-tauri/src/ai.rs`、`specs/ai-streaming/spec.md`）。前端已有两个流式入口作为参照：`ai-sql-tab` 的 `callAiSqlApi`（Channel 累积原文 → onDelta 驱动气泡 → 结束后容错解析）与 `ai-review-tab`。三个 modal 共用 `ai-design-modal.tsx` 中的 `callAiApi`（非流式，返回清洗后 JSON 串），其清洗逻辑与 `callAiSqlApi` 高度重合。因此本次本质是把 `callAiApi` 提升为流式，并补一个共享展示组件。

## Goals / Non-Goals

**Goals:**
- 三个 modal 切到 `ai_chat_stream`，下游 JSON 解析零改动（返回值仍是清洗后的 JSON 串）。
- 一处共享展示组件，三处复用，覆盖自动滚底/完成后折叠/暗色可读/取消。
- 取消能力复用 ai-sql-tab 验证过的 `cleanupCallback()` 模式。

**Non-Goals:**
- 不改 `ai_chat` 命令本身、不改 `setting/ai-tab` 测试连接。
- 不改后端流式协议或 `StreamChunk` 结构。
- 不重构 ai-sql-tab / ai-review-tab 已有流式实现（仅必要时抽公共类型）。

## Decisions

### 决策 1：改造 `callAiApi` 而非新增 helper
将 `callAiApi` 内部由 `ai_chat` 换为 `ai_chat_stream`，签名追加两个可选回调：

```
callAiApi(systemPrompt, userPrompt, onDelta?, onChannel?): Promise<string>
```

- 内部结构与 `callAiSqlApi` 同构：`new Channel<StreamChunk>` → `onmessage` 累积 `acc` 并 `onDelta(acc)` → `invoke('ai_chat_stream', { onEvent: channel })` → 结束后跑**现有**清洗逻辑（thinking 剥离 → 代码块剥离 → JSON 提取）→ 返回 JSON 串。
- `onDelta`/`onChannel` 均可选；不传时行为等价于"流式但不展示、不暴露取消"，保证调用方平滑升级。
- **替代方案**：新建 `callAiApiStream` 并保留旧 `callAiApi`。否决——会留下两条路径，三个 modal 仍要分别改，且旧非流式路径无人使用，徒增维护面。

### 决策 2：新建共享组件 `AiStreamingText`
放在 `src/components/proj-detail/ai-streaming-text.tsx`（三个调用方都在 `proj-detail/`，就近放置；不进 `components/common/` 以免越界）。

Props（最小集）：
- `text: string` — 累积原文
- `status: 'streaming' | 'done' | 'error'`
- `onCancel?: () => void`

实现要点：
- **自动滚底**：scroll 容器 `ref` + `useEffect([text])` → `el.scrollTop = el.scrollHeight`。新增内容在末尾，置底即可。
- **完成后折叠**：用 AntD `Collapse`，`activeKey` 受控——`streaming` 时设为面板 key 展开，`done`/`error` 时清空 → 折叠。折叠带 AntD 默认过渡。
- **暗色可读**：颜色一律取 `theme.useToken()` 的 token（如 `colorBgContainer`/`colorText`/`colorBorderSecondary`），不写死 hex；等宽字体展示原文。滚动条：复用应用既有全局滚动条样式（若存在），否则仅依赖浏览器默认，避免引入与主题脱节的自定义滚动条 CSS。
- **取消按钮**：header 右侧，仅 `streaming` 时显示，调 `onCancel`。

**替代方案**：A. 不展示原文只显示进度计数——否决（用户明确要求展示原文）。B. 让三处各自内联展示逻辑——否决（三份重复、行为难统一）。

### 决策 3：取消机制复用 `cleanupCallback()` 模式
每个 modal 持有 `channelRef` + `cancelledRef`，`callAiApi` 经 `onChannel` 回调把 Channel 交出。`cancelStream()` 调 `(ch as unknown as { cleanupCallback: () => void }).cleanupCallback()` 注销前端回调 id → 后端 `on_event.send()` 失败 → `ai_chat_stream` 检测后停止读取、返回 Ok。触发时机：取消按钮、Modal `onCancel`、组件卸载 useEffect。

- `cancelledRef` 用于在 `onDelta`/Promise resolve 前丢弃已取消的产物（与 ai-sql-tab 一致）。
- **风险**：`cleanupCallback` 为 Channel 的私有方法，未来 Tauri 版本可能改名/移除。→ 缓解：在 `cancelStream` 内 `try/catch` 包裹并做存在性判断；该用法已在 ai-sql-tab 线上验证，且无更官方的取消 API。

### 决策 4：`StreamChunk` 类型复用
`StreamChunk` 已在 `ai-sql-tab.tsx` 与 `ai-review-tab.tsx` 各定义一份。新建 `AiStreamingText` 需引用同一类型。决策：从 `ai-sql-tab.tsx` 导出该类型并 import 复用，不在第三处重复定义。**不**为此单独抽公共 types 文件——会牵动 ai-review-tab 改动，超出本次范围；仅在新组件 import 现有定义即可，重复消除留作后续可选清理。

## Risks / Trade-offs

- [展示半截 JSON 难读] → 用户已明确要求展示原文，接受。完成后自动折叠可缓解视觉负担。
- [`cleanupCallback` 私有 API 不稳定] → `try/catch` + 存在性判断；与 ai-sql-tab 同源，风险一致。
- [三 modal 各自接 channelRef/cancelStream 仍有少量重复] → 可接受；强行抽 hook 会跨文件耦合 modal 生命周期，收益不抵复杂度。
- [流式累积原文占用内存] → 结构化结果体量有限（表/索引 JSON），无累积风险。

## Migration Plan

纯前端改动，无数据迁移、无后端变更。回滚即还原 `callAiApi` 内部为 `ai_chat` 并移除新组件引用。分步落地见 tasks.md。

## Open Questions

- 应用是否已有全局滚动条样式可供 `AiStreamingText` 复用？实现时 grep 确认；无则用浏览器默认。不改变本次设计。
