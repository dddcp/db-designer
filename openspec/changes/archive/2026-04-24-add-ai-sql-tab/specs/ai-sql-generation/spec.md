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
系统 SHALL 提供独立的 `callAiSqlApi` 函数，接受 messages 数组作为参数，返回 `{ sql, explanation }` 结构。该函数 SHALL NOT 修改或依赖现有 `callAiApi` 函数。

#### Scenario: 调用 callAiSqlApi
- **WHEN** `callAiSqlApi` 被调用时传入历史消息数组和最新用户消息
- **THEN** 函数从本地设置读取 AI 配置，构建完整的 OpenAI 兼容 API 请求（包含 systemPrompt + 历史消息），返回解析后的 `{ sql, explanation }` 结构

#### Scenario: API 配置缺失
- **WHEN** AI 配置（base_url / api_key / model）未设置
- **THEN** 函数抛出错误，提示用户先配置 AI 参数

### Requirement: AI 返回格式容错
系统 SHALL 对 AI 返回内容进行容错处理：剥离 markdown 代码块和 thinking 标签后尝试解析 JSON；解析失败时降级为将整段文本作为 explanation、sql 留空。

#### Scenario: AI 返回合法 JSON
- **WHEN** AI 返回 `{"sql": "SELECT ...", "explanation": "..."}`
- **THEN** 系统正常解析并展示 SQL 和说明

#### Scenario: AI 返回带 markdown 包裹的 JSON
- **WHEN** AI 返回 ```json\n{"sql": "...", "explanation": "..."}\n```
- **THEN** 系统剥离 markdown 代码块后解析 JSON，正常展示

#### Scenario: AI 返回非 JSON 文本
- **WHEN** AI 返回无法解析为 JSON 的纯文本
- **THEN** 系统将文本作为 explanation 展示，SQL 区域留空

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