## 1. 共享流式展示组件

- [x] 1.1 新建 `src/components/proj-detail/ai-streaming-text.tsx`，定义 `AiStreamingText` 组件，Props：`text`、`status: 'streaming'|'done'|'error'`、`onCancel?`
- [x] 1.2 用 AntD `Collapse`（`activeKey` 受控）实现"streaming 展开 / done|error 自动折叠"
- [x] 1.3 实现 scroll 容器 `ref` + `useEffect([text])` 自动滚底（`scrollTop = scrollHeight`）
- [x] 1.4 用 `theme.useToken()` 取色（背景/文字/边框），等宽字体展示累积原文；grep 确认应用是否已有全局滚动条样式可复用，否则用浏览器默认
- [x] 1.5 header 右侧取消按钮，仅 `streaming` 时显示，点击调 `onCancel`
- [x] 1.6 从 `ai-sql-tab.tsx` 导出 `StreamChunk` 类型并在本组件 import 复用（不在第三处重复定义）

## 2. 改造 `callAiApi` 为流式

- [x] 2.1 在 `ai-design-modal.tsx` 将 `callAiApi` 内部由 `ai_chat` 改为 `ai_chat_stream`，签名追加 `onDelta?: (acc: string) => void` 与 `onChannel?: (channel: Channel<StreamChunk>) => void`
- [x] 2.2 内部按 `callAiSqlApi` 同构实现：`new Channel` → `onmessage` 累积 `acc` 并 `onDelta(acc)` → `invoke('ai_chat_stream', { baseUrl, apiKey, model, messages, onEvent: channel })`
- [x] 2.3 流式结束后对 `acc` 跑既有清洗逻辑（thinking 剥离 → 代码块剥离 → JSON 提取），返回清洗后 JSON 串（下游不变）
- [x] 2.4 不传 `onDelta`/`onChannel` 时行为等价于"流式但不展示、不暴露取消"，确保向后兼容

## 3. 三个 modal 接入展示与取消

- [x] 3.1 `ai-design-modal.tsx`：新增 `streamingText`/`streamingStatus` state、`channelRef`/`cancelledRef`、`cancelStream`（`cleanupCallback` + `try/catch`）；Modal 内渲染 `<AiStreamingText>`；调用 `callAiApi` 时传入 `onDelta=setStreamingText`、`onChannel=ch=>channelRef.current=ch`
- [x] 3.2 `ai-design-modal`：done 后自动折叠 → 解析 → `onTablesGenerated` 填充；Modal `onCancel` 与卸载 useEffect 调 `cancelStream()`；`cancelledRef` 为真时丢弃产物
- [x] 3.3 `ai-modify-table-modal.tsx`：同样接入 `AiStreamingText`、`channelRef`/`cancelStream`，done 后折叠 → 解析填充
- [x] 3.4 `ai-recommend-index-modal.tsx`：同样接入 `AiStreamingText`、`channelRef`/`cancelStream`，done 后折叠 → 解析填充
- [x] 3.5 三个 modal 均确保关闭弹窗时自动触发取消（Modal `onCancel` + 卸载 useEffect）

## 4. 验证

- [x] 4.1 `npx tsc --noEmit` 通过（前端类型检查）
- [ ] 4.2 手动验证：AI 设计表 / AI 修改表 / AI 推荐索引三入口生成期间原文实时追加、自动滚底、完成后自动折叠
- [ ] 4.3 手动验证：暗色主题下文字/背景/滚动条可读
- [ ] 4.4 手动验证：生成期间点取消按钮、直接关闭 Modal 均能停止接收并丢弃未完成结果
- [x] 4.5 确认 `ai_chat` 命令与 `setting/ai-tab` 测试连接未被改动
