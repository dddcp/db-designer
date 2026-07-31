## Why

AI 设计表、AI 修改表、AI 推荐索引三个弹窗目前仍走同步 `ai_chat` 命令，生成期间界面只有无变化的加载态，且无法取消——遇到重推理任务时用户只能干等 120s 整体超时。后端的 `ai_chat_stream` 流式通道与"关 Channel 即取消"机制已在 AI SQL、AI 评审中验证可用，应将这三个入口也切换为流式输出，消除"假死"感并提供取消能力。

## What Changes

- 将共享 helper `callAiApi`（`ai-design-modal.tsx`，被三个 modal 复用）内部由 `ai_chat` 改为 `ai_chat_stream`，新增 `onDelta` 与 `onChannel` 两个可选回调；返回值仍为清洗后的 JSON 字符串，下游解析逻辑不变。
- 新建共享流式展示组件（暂名 `AiStreamingText`），供三个 modal 复用：实时展示累积原文、自动滚动到底、完成后自动折叠、适配暗色模式、提供取消按钮。
- 三个 modal（`ai-design-modal`、`ai-modify-table-modal`、`ai-recommend-index-modal`）接入流式展示与取消：生成中渲染 `<AiStreamingText>`，Modal 关闭/取消时注销 Channel 触发后端取消。
- **不改动** `ai_chat` 命令本身与 `setting/ai-tab` 的"测试连接"（其语义为连通性验证，无需流式）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ai-streaming`: 将流式输出的覆盖范围从 AI SQL、AI 评审扩展到 AI 设计表、AI 修改表、AI 推荐索引三个入口；新增这三个入口 SHALL 走流式、SHALL 在生成中展示实时累积内容、SHALL 支持用户取消生成、SHALL 复用统一的流式展示组件（自动滚底、完成后折叠、暗色适配）的要求。

## Impact

- **前端**：`src/components/proj-detail/ai-design-modal.tsx`（`callAiApi` 重写 + 接入展示组件）、`ai-modify-table-modal.tsx`、`ai-recommend-index-modal.tsx`（接入展示组件与取消）、新增 `AiStreamingText` 组件文件。
- **后端**：无改动——`ai_chat_stream` 与 `StreamChunk` 已就绪，`ai_chat` 不动。
- **依赖**：无新增第三方依赖，复用 `@tauri-apps/api/core` 的 `Channel` 与 Ant Design 组件。
- **类型同步**：`StreamChunk` 类型目前在 `ai-sql-tab.tsx` 与 `ai-review-tab.tsx` 各重复定义一份，本次新增组件可顺带引用其中一份，避免第三处重复。
