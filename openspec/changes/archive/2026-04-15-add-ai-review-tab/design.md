## Context

DB Designer 已有三个 AI 功能（AI 设计表、AI 修改表、AI 推荐索引），均为单表粒度，AI 调用在前端完成（通过 `callAiApi` 工具函数），后端只负责数据存取。

本功能引入**项目级 AI 评审**：一次性收集整个项目所有表结构，发送给 AI，获取分级问题列表，并将每次评审结果持久化到 SQLite，供用户随时查阅。

## Goals / Non-Goals

**Goals:**
- 对整个项目所有表结构进行 AI 评审，返回分级问题（error / warning / suggestion）
- 结果按表分组展示，支持查看历史评审记录及删除
- 评审时自动附带用户设置中的「AI设计通用提示词」（`ai_design_common_prompt`）
- 后端仅负责存储，AI 调用在前端完成，保持与现有 AI 功能一致的架构

**Non-Goals:**
- 评审结果不提供一键修改/应用功能（纯只读展示）
- 不做跨项目评审
- 不自动触发评审（用户手动发起）

## Decisions

### 决策 1：AI 调用在前端完成

**选择**：继续在前端调用 `callAiApi`，后端不做 HTTP 请求。

**理由**：与现有三个 AI 功能保持一致，避免引入新的架构模式；AI 配置（API Key、Base URL、Model）已在前端读取 settings 的封装中处理好。

**备选**：在后端 Rust 发起 HTTP 请求。被否决，因为会引入 `reqwest` 依赖，且增加架构复杂度。

---

### 决策 2：评审结果以 JSON 字符串存入 SQLite

**选择**：`t_ai_review.result` 字段存储 AI 返回的 JSON 字符串。

**理由**：结构灵活，AI 返回的字段可能随 prompt 调整而演进；不需要为 issues 单独建表，查询时在前端反序列化即可。

**结构**：
```json
{
  "summary": "发现 N 个问题，其中 X 个严重",
  "issues": [
    {
      "level": "error" | "warning" | "suggestion",
      "scope": "<表名 或 '项目整体'>",
      "title": "<问题标题>",
      "detail": "<详细说明与建议>"
    }
  ]
}
```

---

### 决策 3：Tab 布局采用左右分栏

**选择**：左侧历史记录列表，右侧展示当前选中评审的详情；顶部有「新建评审」按钮。

**理由**：复用版本管理 Tab 的交互模式（列表 + 详情），用户已熟悉；Drawer 模式（类似 ai-recommend-index）不适合有历史记录的场景。

---

### 决策 4：项目表结构数据的收集方式

**选择**：前端直接使用已有的 `tables`（含 columns）状态，不新增后端命令。

**理由**：`proj-detail/index.tsx` 加载时已拉取完整的 tables 列表（含列定义），AI 评审 Tab 接收 `tables` prop 即可使用，无需额外 IPC 调用。

索引数据需单独拉取（当前 columns 已在 tables 中，indexes 需要按表调用 `get_table_indexes`）。可在评审发起时批量获取各表索引，或在 Prompt 中仅提供字段信息（不含索引，因为有专门的 ai-recommend-index 功能处理索引）。选择**仅提供字段信息**，保持 prompt 简洁。

## Risks / Trade-offs

- **Token 消耗较大**：项目表数多时，prompt 会很长。→ 缓解：前端可显示预估的表数量，用户知情后再触发
- **AI 返回格式不稳定**：callAiApi 已有 JSON 剥离逻辑，但格式错误仍可能导致解析失败。→ 缓解：解析失败时将原始文本作为 summary 展示，不丢弃结果
- **SQLite 迁移**：新增 `t_ai_review` 表通过 `init_database` 中的 `CREATE TABLE IF NOT EXISTS` 追加，无破坏性

## Migration Plan

1. `db.rs::init_database` 追加 `CREATE TABLE IF NOT EXISTS t_ai_review`
2. 无需数据迁移，纯新增表
3. 旧版本升级后首次启动时表自动创建
