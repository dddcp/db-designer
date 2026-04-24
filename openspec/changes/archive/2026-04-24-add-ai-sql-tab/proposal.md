## Why

项目已有 AI 表结构设计、AI 表修改和 AI 评审功能，但缺少一个核心场景：基于已有表结构，让 AI 根据自然语言描述直接生成复杂 DML（SELECT/INSERT/UPDATE/DELETE）语句。用户在对业务表结构有理解需求时，往往需要手写复杂 SQL，AI SQL 生成可以大幅降低这个门槛，并且通过多轮对话持续优化生成的 SQL。

## What Changes

- 新增项目级 Tab「AI SQL」，与 AI 评审同级
- 支持多轮对话：用户描述需求 → AI 返回 SQL + 说明 → 用户继续追问 → AI 结合上下文返回新 SQL
- 对话历史持久化到本地 SQLite，支持创建、浏览、删除对话
- AI 返回结构化 JSON `{ sql, explanation }`，SQL 可编辑、可复制
- 对话标题自动截取首条用户消息前 N 个字符
- 新建独立的 `callAiSqlApi` 函数（不复用/修改旧 `callAiApi`），支持 messages 数组传入
- 后端新增 `t_ai_sql_conversation` 表和对应 CRUD Tauri 命令
- 前端新增 `ai-sql-tab.tsx` 组件和 `AiSqlConversation` 类型定义
- i18n 新增中英文翻译 key

## Capabilities

### New Capabilities
- `ai-sql-generation`: AI SQL 生成功能，包含多轮对话、历史记录持久化、SQL 编辑与复制

### Modified Capabilities
<!-- 无需修改现有 spec -->

## Impact

- **后端**：`db.rs`（新增表 + 迁移）、新增 `ai_sql.rs` 模块（CRUD 命令）、`lib.rs`（注册命令）
- **前端**：新增 `ai-sql-tab.tsx` 组件，修改 `proj-detail/index.tsx`（注册 Tab），新增 `types/index.ts` 类型
- **i18n**：`zh-CN.json`、`en-US.json` 新增翻译 key
- **不涉及 DDL 生成**：AI SQL Tab 仅生成 DML，不生成建表/改表语句