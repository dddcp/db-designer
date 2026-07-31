## MODIFIED Requirements

### Requirement: 独立的 AI API 调用函数
系统 SHALL 提供独立的流式 AI 调用函数 `callAiSqlApi`，接受会话消息数组作为参数，经 `ai_chat_stream` 命令以流式方式获取回复，逐块累积 AI 原始输出文本，并在生成结束后对累积文本执行容错解析，得到 `{ sql, explanation }` 及累积原文。该函数 SHALL NOT 修改或依赖现有 `callAiApi` 函数。

#### Scenario: 流式累积并解析
- **WHEN** `callAiSqlApi` 被调用并传入历史消息数组和最新用户消息
- **THEN** 函数从本地设置读取 AI 配置，经 `ai_chat_stream` 流式获取回复并逐块累积原文，生成结束后解析出 `{ sql, explanation }` 并返回累积原文

#### Scenario: API 配置缺失
- **WHEN** AI 配置（base_url / api_key / model）未设置
- **THEN** 函数抛出错误，提示用户先配置 AI 参数

#### Scenario: 流式中途取消
- **WHEN** 流式生成过程中前端 Channel 失效（如切换对话或组件卸载）
- **THEN** 函数停止累积，不再产出结果，已部分生成的内容不落库

### Requirement: AI 返回格式容错
系统 SHALL 对 AI 返回内容进行容错处理：剥离 markdown 代码块和 thinking 标签后尝试解析 JSON；解析失败时降级为将整段文本作为 explanation、sql 留空。该容错解析 SHALL 在流式生成结束后对累积原文执行。

#### Scenario: AI 返回合法 JSON
- **WHEN** 累积原文为 `{"sql": "SELECT ...", "explanation": "..."}`
- **THEN** 系统正常解析并提取 SQL 和说明

#### Scenario: AI 返回带 markdown 包裹的 JSON
- **WHEN** 累积原文为 ```json\n{"sql": "...", "explanation": "..."}\n```
- **THEN** 系统剥离 markdown 代码块后解析 JSON，正常提取

#### Scenario: AI 返回非 JSON 文本
- **WHEN** 累积原文无法解析为 JSON
- **THEN** 系统将文本作为 explanation，SQL 留空

## ADDED Requirements

### Requirement: 流式生成期间展示可折叠原文
assistant 消息气泡顶部 SHALL 提供一个可折叠的「AI 原文输出」区域，在流式生成期间实时逐字填充 AI 的原始输出文本（保留 JSON 等原始结构，不做字段提取）。

#### Scenario: 生成中逐字填充原文
- **WHEN** 流式生成进行中
- **THEN** 原文区域随增量到达实时显示累积的原始文本

#### Scenario: 生成完成后默认折叠
- **WHEN** 流式生成结束、SQL 已提取展示
- **THEN** 原文区域自动折叠，默认不遮挡下方 SQL

#### Scenario: 手动展开查看原文
- **WHEN** 用户点击原文区域标题
- **THEN** 区域展开显示完整原始输出，再次点击折叠

### Requirement: 流式完成后提取并高亮 SQL
流式生成结束后，系统 SHALL 从累积原文中提取 `sql` 字段，在原文区域下方以高亮代码块展示，并保留 `explanation` 说明；提取完成前 SQL 区域 SHALL 显示生成中占位。

#### Scenario: 流式结束后展示 SQL
- **WHEN** 流式生成结束并成功解析出 sql
- **THEN** 系统在原文区域下方高亮展示 SQL 代码块，并展示 explanation 说明

#### Scenario: 生成中 SQL 占位
- **WHEN** 流式生成进行中、sql 尚未就绪
- **THEN** SQL 区域显示生成中占位或不渲染

### Requirement: 原文持久化与历史回看
`AiSqlMessage` SHALL 新增 `rawText` 字段保存 AI 原始流文本，并随对话消息持久化；历史对话中的 assistant 消息 SHALL 可经原文区域展开查看 `rawText`。

#### Scenario: 持久化原文
- **WHEN** 系统保存包含 assistant 消息的对话
- **THEN** 每条 assistant 消息的 `rawText` 随 messages JSON 一并持久化

#### Scenario: 历史回看原文
- **WHEN** 用户打开历史对话中的 assistant 消息
- **THEN** 原文区域可展开显示该消息生成时的原始输出

#### Scenario: 旧消息兼容
- **WHEN** 历史消息无 `rawText` 字段
- **THEN** 该消息不渲染原文区域，其余展示不受影响

### Requirement: 流式更新的性能与取消
流式增量更新 SHALL 仅作用于当前生成中的 assistant 气泡，不得触发整个消息列表的高频重渲染；切换对话或组件卸载时 SHALL 取消进行中的流式任务。

#### Scenario: 局部更新当前气泡
- **WHEN** 流式增量到达
- **THEN** 仅当前生成中的气泡原文区域更新，其余消息不重渲染

#### Scenario: 中途取消流式
- **WHEN** 流式生成期间用户切换对话或组件卸载
- **THEN** 系统停止流式任务并丢弃未完成的占位消息，不将其落库
