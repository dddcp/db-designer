## Context

当前设置页的 AI 配置（`src/components/setting/ai-tab.tsx`）要求用户手动填入 `ai_base_url` / `ai_api_key` / `ai_model` 三个必填字段，缺一不可。AI HTTP 调用分散在前端 5 个文件：

- `src/components/proj-detail/ai-design-modal.tsx` —— 导出 `callAiApi()`
- `src/components/proj-detail/ai-modify-table-modal.tsx` —— 引用 `callAiApi`
- `src/components/proj-detail/ai-recommend-index-modal.tsx` —— 引用 `callAiApi`
- `src/components/proj-detail/ai-review-tab.tsx` —— 引用 `callAiApi`
- `src/components/proj-detail/ai-sql-tab.tsx` —— 自带 `callAiSqlApi()`，与 `callAiApi` 重复实现 URL 拼接

URL 推导（`baseUrl` 末尾去除 `/chat/completions`、追加 `/v1/chat/completions`）在前端重复出现 2 次（`ai-design-modal.tsx:66-71`、`ai-sql-tab.tsx:95-100`），错误处理与状态码判断也各写一份。

`settings.json`（`src-tauri/src/storage/sqlite/local_settings_store.rs`）当前保存 `ai_base_url` / `ai_api_key` / `ai_model` / `ai_design_common_prompt` 4 个键。

约束（来自 `AGENTS.md`）：
- 后端仅做命令注册 + 服务调用，复杂逻辑放 service 层；本次 AI 网关作为基础设施层例外，直接放 `src-tauri/src/ai.rs` 不另起 service（与 `db.rs` / `dialect.rs` 风格一致）。
- 不引入新的 ORM，HTTP 客户端用 `reqwest`。
- 命令返回 `Result<T, String>`，错误用 `format!("context: {}", e)` 包裹。
- 中英文 i18n 同步新增。

## Goals / Non-Goals

**Goals:**
- 在设置页提供 8 个常用供应商预设（custom / openai / qwen / deepseek / kimi / zhipu / ernie / opencode-go），选择后自动填 baseUrl。
- 模型字段通过远端拉取 + 自由输入组合呈现，刷新按钮可重新拉取。
- 提供"测试连接"按钮，用表单当前值（无需先保存）调用后端 `GET {baseUrl}/models`，同时完成连通性验证与模型列表拉取。
- 把 AI HTTP 调用从前端迁到后端，新增 3 个 Tauri 命令 `ai_chat` / `ai_fetch_models` / `ai_test_connection`，URL 推导逻辑只在后端一份。
- 新增 `ai_provider` 本地配置键，老用户配置完整保留。

**Non-Goals:**
- 不实现流式响应（SSE），`ai_chat` 同步返回完整文本。
- 不缓存模型列表（不写入 settings.json），重新打开设置页时需重新点击"测试连接"或 ↻ 刷新。
- 不做 Ollama 等非 OpenAI 兼容协议的供应商。
- 不实现 key 加密 / 多 key 管理 / 按项目覆盖。
- 不改 `models.rs` 与 `types/index.ts` 中现有类型结构；新命令参数用本地 struct 即可。

## Decisions

### D1. AI HTTP 调用全部走后端 `ai.rs`（呼应 #5"统一"）
**决定**：新增 `src-tauri/src/ai.rs` 提供 3 个 `#[tauri::command]`：`ai_chat` / `ai_fetch_models` / `ai_test_connection`。前端 5 个调用点改为 `invoke('ai_chat', ...)`。

**理由**：
- URL 拼接（baseUrl → chat / models）逻辑只存在 1 处。
- 错误信息（401/超时/DNS）由后端统一分类，前端 i18n 映射稳定。
- 后续想加流式 / 限流 / 日志 / 代理都改后端单点。
- 与 `ai_sql.rs` / `ai_review.rs`（已存在的 AI 相关 command）保持同层结构。

**备选**：
- 保留 `tauriFetch` 在前端：改动面小（只新增 2 个调用），但 URL 推导仍散落，#5 未真正满足。已否决。

### D2. 引入 `reqwest` 作为后端 HTTP 客户端
**决定**：在 `src-tauri/Cargo.toml` 中新增 `reqwest = { version = "0.12", features = ["json", "rustls-tls"] }`（避免与已有 `mysql` crate 的 `native-tls` 冲突，统一用 rustls）。

**理由**：
- `tauri-plugin-http` 的 Rust 端是 `reqwest` 的再封装，主要服务于前端场景；后端直接用 `reqwest` 简单可控。
- 已存在 `serde` / `serde_json`，reqwest 的 `json` feature 直接对接。
- 15s 超时由 `tokio::time::timeout` 包裹，不依赖 reqwest 默认值。

**备选**：
- 用 `tauri_plugin_http::reqwest`：少 1 个依赖，但需要先在 `lib.rs` 注册插件，间接且语义不明。已否决。

### D3. baseUrl 推导规则兼容两种写法
**决定**：在 `ai.rs` 中实现：
```rust
fn derive_chat_url(base: &str) -> String {
    let t = base.trim_end_matches('/');
    if t.ends_with("/chat/completions") { t.to_string() }
    else { format!("{}/chat/completions", t) }
}
fn derive_models_url(base: &str) -> String {
    let t = base.trim_end_matches('/');
    let stripped = t.strip_suffix("/chat/completions").unwrap_or(t);
    format!("{}/models", stripped)
}
```

**理由**：
- OpenAI / 通义 / DeepSeek 等标准 base 形式（`https://api.openai.com/v1`）走"追加"分支。
- opencode-go 的完整 chat 形式（`https://opencode.ai/zen/go/v1/chat/completions`）走"原样 + 推导 models"分支。
- 两个函数都是纯函数，行为可单测。

### D4. `ai_test_connection` 与 `ai_fetch_models` 复用同一 HTTP 路径
**决定**：`ai_test_connection` 内部调用与 `ai_fetch_models` 相同的 `GET /models` 逻辑，仅返回类型简化为 `{ ok: bool, error?: String, model_count?: usize }`（不返回完整模型列表给前端，避免重复请求）。

**理由**：
- 测试连接本来就是验证 `/models` 通不通；让两个命令都做相同 HTTP 是无意义的双倍网络开销。
- 前端"测试连接"成功时直接接一次 `ai_fetch_models` 拿到列表，1+1 = 2 次请求（用户预期内）。
- 或者前端在成功回调里调 `ai_fetch_models`，后端两个命令就完全分离、各司其职。

**最终方案**：两个命令都直接返回 `Result<Vec<String>, String>`，前端根据需要使用。语义上"测试连接"也可以叫"获取模型列表"，共享同一实现。

### D5. 前端供应商预设作为 `src/data/ai-providers.ts` 常量
**决定**：新增 `src/data/ai-providers.ts`，导出 `AiProviderPreset[]` 数组与 `getPresetById()` 工具函数。

**理由**：
- 与项目惯例一致（`src/data-types.ts` 同样位于 `src/` 根而非 `types/`）。
- 常量是纯前端概念，不污染后端。
- i18nKey 走 `t()` 翻译，键名稳定。

**数据结构**（不含 defaultModel）：
```ts
export interface AiProviderPreset {
  id: 'custom' | 'openai' | 'qwen' | 'deepseek' | 'kimi' | 'zhipu' | 'ernie' | 'opencode-go';
  i18nKey: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
  docsUrl?: string;
}
```

### D6. 模型字段使用 `AutoComplete` 组件
**决定**：使用 Ant Design 的 `AutoComplete`（非 `Select`），options 来自远端拉取的 `models: string[]`，`filterOption` 默认开（输入即过滤），允许 value 不在 options 中（用户自由输入）。

**理由**：
- `Select` 的 value MUST 在 options 中（除非用 `tagRender` + `mode="tags"`，但 tagRender UX 复杂）。
- `AutoComplete` 天然支持"自由输入 + 可选下拉"两种模式。
- 拉取失败 / 未拉取时只显示输入框，无下拉箭头（`open={hasModels}` 控制）。

### D7. 错误信息分类
**决定**：后端在 `ai.rs` 中定义一个 `AiError` 内部枚举，转换为 `String` 时按分类给中文消息（"鉴权失败" / "网络超时" / "服务端错误" / "未知错误"），前端 `backend-messages.ts` 不需要新增（沿用错误字符串直显）。

**理由**：
- 与现有 `ai_sql.rs` 的错误风格一致（`format!("xxx: {}", e)`）。
- 后续 `i18n/backend-messages.ts` 想做映射时再加，前端目前直接显示后端中文。

### D8. `ai_chat` 同步返回，不做流式
**决定**：`ai_chat` 接收 `messages: Vec<ChatMessage>`，POST 完整请求体，阻塞等待响应，返回 `String`（assistant content）。

**理由**：
- 现有 5 个调用点都是 `await response.json()` 后取 `choices[0].message.content`，没有流式消费。
- 流式会改动所有调用点的 UX 与错误处理，超出本次范围。
- 同步实现简单，超时由 `tokio::time::timeout(15s)` 控制。

## Risks / Trade-offs

[R1] **reqwest 引入体积** —— reqwest + rustls 约增加 1.5MB 编译产物。  
Mitigation：Tauri 应用已自带 webview / rusqlite，体积敏感度低；如未来需要可改 `tauri_plugin_http::reqwest` 复用现有插件。

[R2] **测试连接需要联网** —— 用户在离线/限网环境点击会立即失败。  
Mitigation：后端 15s 超时；前端 toast 提示具体原因（"网络超时" / "无法连接服务器"），不阻塞保存。

[R3] **老用户缺 `ai_provider` 字段** —— settings.json 中没有该键，需要回退到 custom 但不覆盖其它值。  
Mitigation：`AiTab` 加载时若 `ai_provider` 不在预设列表中，UI 显示 custom，表单其它字段照旧从 `ai_base_url` / `ai_model` 回填。`ai_provider` 缺省在 spec `local-app-settings` 中已定义为"按 custom 处理"。

[R4] **opencode-go 的 `requiresKey`** —— 用户未明确该供应商是否需要 Key。  
Mitigation：暂按 `requiresKey: true` 实现（与其它一致），用户留空也能保存，调用时后端不带 Authorization 头（spec `ai-backend-gateway` 已定义"apiKey 为空时跳过鉴权头"）。

[R5] **baseUrl 末尾斜杠、路径前缀差异** —— 不同供应商路径前缀不一（`/compatible-mode/v1`、`/v2` 等）。  
Mitigation：推导函数不感知路径前缀，只识别 `/chat/completions` 后缀；preset 给出的 defaultBaseUrl 已包含完整路径。

## Migration Plan

部署步骤（用户透明）：
1. 升级到新版本后，settings.json 中若无 `ai_provider` 键，按 custom 处理，UI 回填现有 3 个老字段。
2. 首次保存时自动写入 `ai_provider` 键。

回滚策略：
- 新增的 3 个 Tauri 命令（`ai_chat` / `ai_fetch_models` / `ai_test_connection`）是纯增量；老代码不删除（`callAiApi` 在前端被 4 处引用，本次会被替换为 `invoke('ai_chat')`，属于删除）。
- 若需要快速回滚：保留 `callAiApi` 函数体作为 fallback，命令注册可注释掉。
- settings.json 兼容性：忽略未知键（已支持），删除 `ai_provider` 键可恢复旧行为。

## Open Questions

- **Q1** opencode-go 是否需要 API Key？当前按 `requiresKey: true`（允许空）实现，等用户实际验证后再调整。  
- **Q2** `ai_chat` 错误时是否需要把 HTTP 状态码回传给前端做更细的 i18n？当前决定用后端分类好的中文消息直显。  
- **Q3** 拉取到的模型列表要不要在 `localStorage` 缓存（避免每次打开设置页都重新点"测试连接"）？当前决定不缓存，保持简单。
