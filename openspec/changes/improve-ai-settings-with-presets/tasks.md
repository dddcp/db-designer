## 1. 后端基础设施

- [x] 1.1 在 `src-tauri/Cargo.toml` 中新增 `reqwest = { version = "0.12", features = ["json", "rustls-tls"] }` 依赖
- [x] 1.2 新增 `src-tauri/src/ai.rs`，实现 `derive_chat_url` / `derive_models_url` 纯函数（兼容 base 形式与完整 chat URL 形式）
- [x] 1.3 在 `ai.rs` 中实现 `ai_chat` Tauri command：接收 `base_url` / `api_key` / `messages: Vec<{role, content}>`，POST 推导出的 chat URL，返回 `String`（assistant content），非空 api_key 时附加 `Authorization: Bearer ...`，15s 超时
- [x] 1.4 在 `ai.rs` 中实现 `ai_fetch_models` 与 `ai_test_connection` Tauri command：均 `GET {modelsUrl}`，返回 `Result<Vec<String>, String>`；错误信息按 HTTP 状态码 / 网络错误分类成中文消息（"鉴权失败" / "网络超时" / "服务端错误" / "无法连接服务器"）
- [x] 1.5 在 `src-tauri/src/lib.rs` 的 `generate_handler![]` 宏中注册 `ai::ai_chat` / `ai::ai_fetch_models` / `ai::ai_test_connection`

## 2. 前端供应商预设

- [x] 2.1 新增 `src/data/ai-providers.ts`：定义 `AiProviderPreset` interface（id / i18nKey / defaultBaseUrl / requiresKey / docsUrl?）与 8 项预设数组（custom / openai / qwen / deepseek / kimi / zhipu / ernie / opencode-go），custom 排首位；导出 `getPresetById()` 工具函数
- [x] 2.2 i18n: 在 `src/i18n/locales/zh-CN.json` 与 `en-US.json` 中新增 8 条 `ai_provider_*` 键（"自定义(OpenAI 兼容)" / "OpenAI" / "通义千问" / "DeepSeek" / "月之暗面 Kimi" / "智谱 GLM" / "文心一言" / "OpenCode Go"）

## 3. 设置页重写

- [x] 3.1 i18n: 在两份 locale 文件中新增 `ai_provider_label` / `ai_get_api_key` / `ai_test_connection` / `ai_test_success_with_count` / `ai_test_fail` / `ai_refresh_models` / `ai_model_fetch_fail` / `ai_base_url_placeholder_custom` / `ai_provider_required` 等键
- [x] 3.2 重写 `src/components/setting/ai-tab.tsx`：新增供应商 `Select`（onChange 自动填 baseUrl，切到 custom 时清空）；API Key `Input.Password` 旁加"测试连接"按钮；模型字段改为 `AutoComplete`（options 来自 `ai_fetch_models` 返回值，allowClear 自由输入）；基础提示词 `Input.TextArea` 保持；保存按钮同时写 `ai_provider` 键；缺省 `ai_provider` 时按 custom 回填但不覆盖 `ai_base_url` / `ai_model` 等老值

## 4. AI 调用点迁移到后端

- [x] 4.1 重构 `src/components/proj-detail/ai-design-modal.tsx` 的 `callAiApi`：删除 `tauriFetch` 与 URL 拼接逻辑，内部改为 `invoke<string>('ai_chat', { baseUrl, apiKey, messages: [{role:'system',...},{role:'user',...}] })`；保留原签名（systemPrompt / userPrompt → string）
- [x] 4.2 重构 `src/components/proj-detail/ai-sql-tab.tsx` 的 `callAiSqlApi`：删除 `tauriFetch` 与本地 URL 拼接，内部改为 `invoke<string>('ai_chat', { baseUrl, apiKey, messages })` 拿到原始 content 字符串，再在本地 `JSON.parse` 提取 `sql` / `explanation`（与 spec `ai_chat` 返回 String 一致）
- [x] 4.3 `ai-modify-table-modal.tsx` / `ai-recommend-index-modal.tsx` / `ai-review-tab.tsx` 保持不变（通过 `callAiApi` 自动获得新行为）

## 5. 验证

- [x] 5.1 前端类型检查：`npx tsc --noEmit` 无错误
- [x] 5.2 后端类型检查：`cd src-tauri && cargo check` 无错误
- [ ] 5.3 手动验证：设置页切换各供应商 / 填 key / 点测试连接看到模型列表 / 保存后触发 AI 设计、修改、推荐索引、评审、SQL 各 1 次，确认 chat 接口可用
