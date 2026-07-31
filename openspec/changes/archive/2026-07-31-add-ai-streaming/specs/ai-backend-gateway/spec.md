## MODIFIED Requirements

### Requirement: 后端提供 AI 聊天命令
后端 SHALL 提供 `ai_chat` Tauri 命令，接受会话消息列表、本地 AI 配置以及可选的思考开关输入，调用供应商的 chat completion 接口并返回助手回复文本；该命令 MUST 在内部统一完成 baseUrl 到 chat URL 的推导，不依赖前端预先拼接路径。请求体 SHALL 视思考开关取值决定是否附加控制模型思考链的字段：当开关指示关闭思考时 MUST 附加相应字段以抑制思考，当开关缺省或指示开启时保持模型默认行为。该请求体思考字段规则同样适用于流式聊天命令。

#### Scenario: 成功调用聊天接口
- **WHEN** 前端调用 `ai_chat` 并传入合法的 `baseUrl` / `apiKey` / `model` / `messages`
- **THEN** 后端 SHALL 发送 `POST {chatUrl}` 请求，解析 `choices[0].message.content` 并以字符串形式返回给前端

#### Scenario: 关闭模型思考
- **WHEN** 调用方传入指示关闭思考的思考开关
- **THEN** 后端 SHALL 在请求体附加控制思考的字段，使模型按关闭思考的方式生成

#### Scenario: 聊天接口返回 4xx/5xx 时透传错误
- **WHEN** 后端调用 chat 接口收到 4xx 或 5xx 响应
- **THEN** 系统 SHALL 返回包含 HTTP 状态码与响应体的错误信息给前端
