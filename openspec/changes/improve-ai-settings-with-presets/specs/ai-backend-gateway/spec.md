## ADDED Requirements

### Requirement: 后端提供 AI 聊天命令
后端 SHALL 提供 `ai_chat` Tauri 命令，接受会话消息列表与本地 AI 配置，调用供应商的 chat completion 接口并返回助手回复文本；该命令 MUST 在内部统一完成 baseUrl 到 chat URL 的推导，不依赖前端预先拼接路径。

#### Scenario: 成功调用聊天接口
- **WHEN** 前端调用 `ai_chat` 并传入合法的 `baseUrl` / `apiKey` / `model` / `messages`
- **THEN** 后端 SHALL 发送 `POST {chatUrl}` 请求，解析 `choices[0].message.content` 并以字符串形式返回给前端

#### Scenario: 聊天接口返回 4xx/5xx 时透传错误
- **WHEN** 后端调用 chat 接口收到 4xx 或 5xx 响应
- **THEN** 系统 SHALL 返回包含 HTTP 状态码与响应体的错误信息给前端

### Requirement: 后端提供拉取模型列表命令
后端 SHALL 提供 `ai_fetch_models` Tauri 命令，调用 `GET {baseUrl}/models` 并以字符串数组形式返回模型 id 列表；调用方 MUST 无需关心 baseUrl 末尾是否已包含 `/chat/completions` 等后缀。

#### Scenario: 拉取到模型列表
- **WHEN** 前端调用 `ai_fetch_models` 并传入合法的 `baseUrl` / `apiKey`
- **THEN** 后端 SHALL 发起 `GET {baseUrl}/models` 请求，解析响应中的模型 id 列表并以 `Vec<String>` 形式返回

#### Scenario: 远端无响应或鉴权失败
- **WHEN** 后端调用 `/models` 接口失败（网络错误 / 401 / 403 / 4xx / 5xx / 超时）
- **THEN** 系统 SHALL 返回分类清晰的错误信息（如 "鉴权失败" / "网络超时" / "服务端错误"）

### Requirement: 后端提供测试连接命令
后端 SHALL 提供 `ai_test_connection` Tauri 命令，行为与 `ai_fetch_models` 等价（同一 `GET {baseUrl}/models` 请求），但语义上表示"验证连通性"；该命令 SHALL 复用与 `ai_fetch_models` 相同的 URL 推导与错误处理逻辑，避免重复实现。

#### Scenario: 测试连接成功
- **WHEN** 前端调用 `ai_test_connection` 且远端 `/models` 返回 2xx
- **THEN** 系统 SHALL 返回成功结果（包含或不包含模型列表均可，调用方不强制要求）

#### Scenario: 测试连接失败
- **WHEN** 前端调用 `ai_test_connection` 且远端 `/models` 返回非 2xx 或网络异常
- **THEN** 系统 SHALL 返回与 `ai_fetch_models` 一致格式的错误信息

### Requirement: baseUrl 推导同时支持 API 根与完整 chat URL
后端的 URL 推导函数 MUST 同时支持以下两种 baseUrl 写法：
- API 根形式（如 `https://api.openai.com/v1`），系统 SHALL 在末尾追加 `/chat/completions` 或 `/models`；
- 完整 chat URL 形式（如 `https://opencode.ai/zen/go/v1/chat/completions`），系统 SHALL 识别该后缀并直接用于 chat 请求；models 端点 SHALL 通过去除 `/chat/completions` 后缀再追加 `/models` 得到。

#### Scenario: 推导 openai 风格的 baseUrl
- **WHEN** 后端收到 `baseUrl = "https://api.openai.com/v1"`
- **THEN** chat URL SHALL 为 `https://api.openai.com/v1/chat/completions`，models URL SHALL 为 `https://api.openai.com/v1/models`

#### Scenario: 推导 opencode-go 风格的 baseUrl
- **WHEN** 后端收到 `baseUrl = "https://opencode.ai/zen/go/v1/chat/completions"`
- **THEN** chat URL SHALL 为 `https://opencode.ai/zen/go/v1/chat/completions`（原样），models URL SHALL 为 `https://opencode.ai/zen/go/v1/models`

### Requirement: 鉴权与超时统一处理
所有 AI 相关后端命令 MUST 在请求头中根据 `requiresKey` 与 `apiKey` 是否非空决定是否携带 `Authorization: Bearer {apiKey}`；所有命令 MUST 设置 15 秒请求超时，超时后返回明确的超时错误信息。

#### Scenario: apiKey 为空时跳过鉴权头
- **WHEN** 调用方传入空字符串 `apiKey`（且供应商 `requiresKey = false`）
- **THEN** 后端 SHALL 不附加 `Authorization` 请求头

#### Scenario: 请求超时返回明确错误
- **WHEN** 后端在 15 秒内未收到远端响应
- **THEN** 系统 SHALL 返回 "网络超时" 类错误信息给前端
