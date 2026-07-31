## 1. 后端流式命令与思考参数

- [x] 1.1 在 `src-tauri/src/ai.rs` 定义序列化结构 `StreamChunk`（字段：`type: "delta" | "done" | "error"`、可选 `content`、可选 `error`）
- [x] 1.2 实现 SSE 解析：用 `response.bytes_stream()` 逐块读取，按 `data: ` 前缀与 `\n\n` 分隔提取 `choices[0].delta.content`，跳过空行/注释心跳，识别 `[DONE]` 与流结束
- [x] 1.3 实现 `ai_chat_stream` 命令：参数 `base_url` / `api_key` / `model` / `messages` / `enable_thinking: Option<bool>` + `on_event: Channel<StreamChunk>`；以 `stream: true` 发起请求，逐块 `on_event.send(delta)`，结束 `send(done)`，出错 `send(error)` 并停止
- [x] 1.4 为 `ai_chat` 增加可选参数 `enable_thinking: Option<bool>`；当为 `Some(false)` 时在请求体附加 `enable_thinking: false`，其余情况不附加
- [x] 1.5 `ai_chat_stream` 复用 `derive_chat_url` / `apply_auth` / `classify_reqwest_error` / `status_message`，思考字段附加规则与 `ai_chat` 一致
- [x] 1.6 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中注册 `ai::ai_chat_stream`

## 2. 思考开关配置

- [x] 2.1 在 `src-tauri/src/services/setting_service.rs` 的 `LOCAL_SETTING_KEYS` 白名单加入 `ai_enable_thinking`
- [x] 2.2 重写 `src/components/setting/ai-tab.tsx` 新增"启用模型思考"`Switch`（默认开），保存时写入 `ai_enable_thinking`，加载时缺省按 `true` 回填
- [x] 2.3 在 `src/i18n/locales/zh-CN.json` 与 `en-US.json` 新增思考开关 label / tooltip 文案

## 3. 前端 AI 调用透传思考开关

- [x] 3.1 `src/components/proj-detail/ai-design-modal.tsx::callAiApi` 读取 `ai_enable_thinking`（缺省视为 `true`），作为 `enableThinking` 传入 `invoke('ai_chat', ...)`
- [x] 3.2 `src/components/proj-detail/ai-sql-tab.tsx::callAiSqlApi` 同样透传 `enableThinking`，保持全局开关语义一致

## 4. 评审改用流式与进度展示

- [x] 4.1 在 `src/components/proj-detail/ai-review-tab.tsx` 新增流式调用：`new Channel<StreamChunk>()` 设置 `onmessage`，`invoke('ai_chat_stream', { ..., onEvent: channel })`，累积 `delta.content`
- [x] 4.2 评审 Modal 生成中展示实时累积文本的只读区域，区分"生成中 / 完成 / 失败"状态
- [x] 4.3 流式结束后复用既有 `parseReviewResult` → `save_ai_review` 流程保存与展示
- [x] 4.4 Modal 中途关闭或卸载时注销 Channel 回调，避免流式继续推送造成泄漏

## 5. 验证

- [x] 5.1 前端类型检查：`npx tsc --noEmit` 无错误
- [x] 5.2 后端类型检查：`cd src-tauri && cargo check` 无错误
- [ ] 5.3 手动：原先 6 表即失败的项目，开启流式后评审能完成且生成中可见进度
- [ ] 5.4 手动：关闭思考开关后评审明显加快；ai-design / ai-sql / 推荐索引 / 修改表 4 项功能行为正常无回归
- [x] 5.5 `openspec validate add-ai-streaming` 通过（必要时 rebase `local-app-settings` 与 `ai-backend-gateway` delta 到 `improve-ai-settings-with-presets` 归档后的 spec）
