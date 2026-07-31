## ADDED Requirements

### Requirement: AI SQL Tab 可见性与入口
系统 SHALL 在项目详情页的项目级 Tab 栏中提供「AI SQL」Tab，与 AI 评审同级，使用 `RobotOutlined` 图标，标签文字为 i18n key `tab_ai_sql`。

#### Scenario: 用户进入 AI SQL Tab
- **WHEN** 用户点击项目详情页顶部的「AI SQL」Tab
- **THEN** 系统显示 AI SQL 主界面，包含左侧对话历史列表和右侧当前对话内容区

### Requirement: 创建新对话
系统 SHALL 允许用户创建新的 AI SQL 对话。创建时需要选择数据库类型（MySQL/PostgreSQL 等）。对话标题 SHALL 自动截取首条用户消息的前 20 个字符。

#### Scenario: 创建新对话
- **WHEN** 用户点击「新建对话」按钮
- **THEN** 系统创建一个空对话，右侧显示空状态和输入区域，左侧对话列表新增一条记录

#### Scenario: 对话标题自动生成
- **WHEN** 用户在新对话中发送第一条消息
- **THEN** 系统将首条用户消息的前 20 个字符设为对话标题

### Requirement: 多轮对话生成 DML
系统 SHALL 支持多轮对话：用户输入自然语言描述，AI 根据项目表结构和历史上下文返回 DML SQL 语句及说明。AI SHALL 仅生成 DML（SELECT/INSERT/UPDATE/DELETE），不生成 DDL。

#### Scenario: 首轮生成 SQL
- **WHEN** 用户输入"查询最近30天每个用户的订单金额统计"并发送
- **THEN** AI 返回结构化响应，包含 SQL 语句和说明文字，右侧展示用户描述和 AI 响应对

#### Scenario: 多轮追问
- **WHEN** 用户在已有对话中输入"加上按订单状态筛选"并发送
- **THEN** AI 结合历史上下文和项目表结构返回新的 SQL 语句，历史对话内容保留可查看

#### Scenario: AI 上下文包含表结构
- **WHEN** AI 生成 SQL 时
- **THEN** systemPrompt SHALL 包含项目所有表的字段信息、类型、关联关系，确保 AI 理解表间关系

### Requirement: SQL 可编辑与复制
系统 SHALL 将 AI 返回的 SQL 展示在可编辑的文本区域中，每段 SQL 旁 SHALL 有复制按钮。

#### Scenario: 复制 SQL
- **WHEN** 用户点击某轮 AI 响应中的复制按钮
- **THEN** 对应 SQL 文本被复制到剪贴板，显示复制成功提示

#### Scenario: 编辑 SQL
- **WHEN** 用户直接修改 AI 生成的 SQL 文本
- **THEN** 修改后的内容保留在编辑区域，不影响原始 AI 返回的数据（后续轮次仍基于原始数据）

### Requirement: 对话历史持久化
系统 SHALL 将对话记录持久化到本地 SQLite 数据库。用户可浏览历史对话列表，可删除对话。

#### Scenario: 浏览历史对话
- **WHEN** 用户点击左侧对话列表中的某条记录
- **THEN** 右侧展示该对话的完整消息历史（所有轮次的用户描述和 AI 响应）

#### Scenario: 删除对话
- **WHEN** 用户确认删除某条对话
- **THEN** 系统从数据库中删除该记录，左侧列表移除该项

### Requirement: 清空上下文
系统 SHALL 提供「清空上下文」按钮，允许用户在不删除对话的情况下清除多轮上下文记忆，后续 AI 生成将不再参考历史轮次。

#### Scenario: 清空上下文
- **WHEN** 用户点击「清空上下文」按钮
- **THEN** 对话中的历史消息被清除，但对话记录本身保留，后续 AI 生成仅基于 systemPrompt 和新的用户输入

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

### Requirement: 后端 SQLite 表和 Tauri 命令
系统 SHALL 在后端创建 `t_ai_sql_conversation` 表，并提供 Tauri IPC 命令：`get_ai_sql_conversations`、`save_ai_sql_conversation`、`delete_ai_sql_conversation`。

#### Scenario: 保存对话
- **WHEN** 前端调用 `save_ai_sql_conversation` 传入 project_id、title、messages JSON、database_type
- **THEN** 后端插入或更新记录，返回保存后的对话对象

#### Scenario: 获取对话列表
- **WHEN** 前端调用 `get_ai_sql_conversations` 传入 project_id
- **THEN** 后端返回该项目的所有对话记录，按 updated_at 倒序

#### Scenario: 删除对话
- **WHEN** 前端调用 `delete_ai_sql_conversation` 传入 id
- **THEN** 后端删除该记录

### Requirement: TypeScript 类型定义
系统 SHALL 在 `types/index.ts` 中新增 `AiSqlConversation` 和 `AiSqlMessage` 类型，与后端 Rust struct 保持字段同步。

#### Scenario: 类型字段同步
- **WHEN** 后端 AiSqlConversation struct 包含 id、project_id、title、messages、database_type、created_at、updated_at
- **THEN** 前端 AiSqlConversation interface SHALL 包含对应的 camelCase 字段

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