## Context

DB Designer 是一个 Tauri v2 桌面应用，前端 React + Ant Design，后端 Rust + SQLite。项目已有三个 AI 功能（AI 设计表、AI 修改表、AI 评审），均使用 OpenAI 兼容 API 单轮调用模式，配置来自本地 settings（`ai_base_url`、`ai_api_key`、`ai_model`）。

现有 AI 功能都是"一问一答"模式，`callAiApi` 函数接受 systemPrompt + userPrompt，返回裸文本再手动剥 markdown。AI SQL Tab 需要多轮对话能力，每次请求需携带历史消息作为上下文，且返回结构化 JSON（SQL + 说明），这与旧函数的设计差异较大。

## Goals / Non-Goals

**Goals:**
- 在项目详情页新增「AI SQL」Tab，支持基于项目表结构的多轮对话生成 DML
- 对话历史持久化，用户可浏览和删除历史对话
- 生成的 SQL 可编辑、可复制
- 独立实现 `callAiSqlApi`，不修改旧 `callAiApi`

**Non-Goals:**
- 不生成 DDL（建表/改表语句）
- 不在远程数据库执行生成的 SQL
- 不做对话标题手动编辑
- 不做对话分享/导出
- 不限制上下文轮数（但提供"清空上下文"按钮）

## Decisions

### 1. 数据模型：单表内嵌 JSON

选择单表 `t_ai_sql_conversation`，`messages` 字段存 JSON 序列化的消息数组。理由：

- 桌面端 SQLite，消息量有限（几十轮），一次全量读写开销可忽略
- 和现有 AI 评审的 `result TEXT` 存 JSON 模式一致
- 简化后端 CRUD（只需 list/get/save/delete 四个命令）
- 两表模型在此场景无性能收益，徒增复杂度

表结构：
```sql
CREATE TABLE IF NOT EXISTS t_ai_sql_conversation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    messages TEXT NOT NULL,       -- JSON: [{role, content, sql, explanation}]
    database_type TEXT NOT NULL,  -- mysql / postgresql etc.
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES t_proj(id)
);
```

### 2. 交互模式：请求-响应列表

每轮对话以"用户描述 → AI 响应（SQL + 说明）"成对展示，纵向排列。每段 SQL 有独立复制按钮和可编辑区域。底部有输入框继续追问。

理由：这是一款开发工具，核心操作是"看 SQL → 复制/调整"，请求-响应列表给代码展示更宽的空间。

### 3. API 调用：独立新建 `callAiSqlApi`

不复用旧 `callAiApi`，理由：
- 旧函数返回裸文本 + 手动剥 markdown，专为"一轮出 JSON"设计
- 新函数需要 messages 数组传入、返回结构化 JSON（`{ sql, explanation }`）
- 解耦后两套逻辑互不影响

新函数签名：
```typescript
interface AiSqlMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function callAiSqlApi(messages: AiSqlMessage[]): Promise<{ sql: string; explanation: string }>
```

设置读取逻辑复用（`get_local_settings`），但请求构建和响应解析独立。

### 4. AI Prompt 设计

systemPrompt 构建：
1. 读取项目所有表结构（复用类似 `serializeTables` 的逻辑）
2. 指明数据库类型和方言特性
3. 要求 AI 只返回 DML（SELECT/INSERT/UPDATE/DELETE）
4. 要求返回 JSON 格式 `{ "sql": "...", "explanation": "..." }`

messages 传入历史轮次的 user/assistant 消息 + 最新 user 消息。

### 5. 前端文件组织

`callAiSqlApi` 放在 `ai-sql-tab.tsx` 文件内作为导出函数。如果未来其他组件也需要调用，再抽离到单独 util。

## Risks / Trade-offs

- **[AI 返回格式不稳定]** → AI 可能不严格返回 JSON，在外面包 markdown 或加思考标签。复用现有剥离逻辑（剥代码块、剥 thinking 标签），并在解析失败时降级为把整个返回作为 explanation、sql 留空。
- **[上下文过长导致 token 超限]** → 暂不处理，桌面端场景消息量有限。后续可加"清空上下文"按钮让用户主动重置。
- **[单表 JSON 的消息可读性]** → 桌面端查询场景下无需按消息粒度检索，全量读写可接受。