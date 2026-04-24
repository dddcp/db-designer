## 1. 后端：数据库与 Rust 模块

- [x] 1.1 在 `db.rs` 的 `init_database` 中新增 `t_ai_sql_conversation` 建表语句（字段：id, project_id, title, messages, database_type, created_at, updated_at）
- [x] 1.2 新建 `src-tauri/src/ai_sql.rs`，定义 `AiSqlConversation` struct 和 `AiSqlMessage` struct
- [x] 1.3 在 `ai_sql.rs` 中实现 `get_ai_sql_conversations`、`save_ai_sql_conversation`、`delete_ai_sql_conversation` 三个 Tauri command
- [x] 1.4 在 `lib.rs` 中注册新命令到 `generate_handler![]`

## 2. 前端：类型定义与 i18n

- [x] 2.1 在 `types/index.ts` 中新增 `AiSqlConversation` 和 `AiSqlMessage` 接口
- [x] 2.2 在 `zh-CN.json` 和 `en-US.json` 中新增 AI SQL 相关翻译 key（tab_ai_sql、新建对话、清空上下文、发送、复制等）

## 3. 前端：AI SQL Tab 组件

- [x] 3.1 新建 `src/components/proj-detail/ai-sql-tab.tsx`，实现独立 `callAiSqlApi` 函数（从 settings 读取配置，构建 messages 数组请求，解析 `{ sql, explanation }` 响应，容错处理）
- [x] 3.2 在 `ai-sql-tab.tsx` 中实现对话列表（左侧）和对话详情（右侧）布局
- [x] 3.3 实现新建对话流程：选择数据库类型 → 创建空对话 → 加载到右侧
- [x] 3.4 实现发送消息流程：用户输入 → 构建 systemPrompt（含表结构）+ 历史消息 → 调用 `callAiSqlApi` → 展示响应（SQL 可编辑区域 + 说明 + 复制按钮）
- [x] 3.5 实现对话标题自动截取（首条用户消息前 20 字符）
- [x] 3.6 实现对话持久化：发送消息后保存到后端，切换对话时加载历史
- [x] 3.7 实现删除对话（Popconfirm 确认后调用 `delete_ai_sql_conversation`）
- [x] 3.8 实现清空上下文按钮（清除对话消息但保留对话记录）
- [x] 3.9 实现空状态展示（无对话时 / 无选中对话时）

## 4. 前端：Tab 注册与集成

- [x] 4.1 在 `proj-detail/index.tsx` 中导入 `AiSqlTab`，在项目级 Tabs 中新增 `aisql` 项（RobotOutlined 图标 + i18n key），并渲染对应组件