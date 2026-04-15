## Why

项目设计完成后，用户缺乏一种系统性的方式来发现潜在的数据库设计问题（如不规范的字段类型、缺失的审计字段、命名不一致等）。通过引入 AI 评审功能，可以在设计阶段提前发现问题，提升数据库设计质量。

## What Changes

- 新增 **AI 评审 Tab**（项目级别），与版本管理、远程同步平级
- 新增 **评审历史记录**：每次评审结果持久化存储，支持查看历史和删除
- 新建评审时可输入业务背景补充说明，AI 会结合用户设置中的「AI设计通用提示词」进行评审
- AI 评审结果按表分组展示，问题分为三级：严重（error）、警告（warning）、建议（suggestion）
- 新增 SQLite 表 `t_ai_review` 存储评审记录
- 新增后端 Tauri 命令：`get_ai_reviews`、`save_ai_review`、`delete_ai_review`

## Capabilities

### New Capabilities

- `ai-project-review`: 对整个项目所有表结构进行 AI 评审，生成分级问题列表，并持久化保存评审历史记录

### Modified Capabilities

（无）

## Impact

- **新文件**：`src/components/proj-detail/ai-review-tab.tsx`、`src-tauri/src/ai_review.rs`
- **修改文件**：
  - `src-tauri/src/db.rs`：新增 `t_ai_review` 表定义及迁移
  - `src-tauri/src/lib.rs`：注册新命令、新增 `mod ai_review`
  - `src/components/proj-detail/index.tsx`：引入并挂载 AI 评审 Tab
  - `src/types/index.ts`：新增 `AiReview`、`AiReviewIssue` 类型定义
- **无破坏性变更**：纯新增功能，不影响现有功能
