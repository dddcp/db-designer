## 1. 数据库层

- [x] 1.1 在 `src-tauri/src/db.rs` 的 `init_database` 中追加 `CREATE TABLE IF NOT EXISTS t_ai_review` 建表语句（字段：id, project_id, title, result TEXT, created_at）

## 2. 后端模块

- [x] 2.1 新建 `src-tauri/src/ai_review.rs`，定义 `AiReview` struct（含 serde 序列化）
- [x] 2.2 实现 `get_ai_reviews(project_id: i32)` 命令，按 created_at 倒序返回列表
- [x] 2.3 实现 `save_ai_review(project_id: i32, title: String, result: String)` 命令，插入记录并返回新记录
- [x] 2.4 实现 `delete_ai_review(id: i64)` 命令，删除指定记录
- [x] 2.5 在 `src-tauri/src/lib.rs` 中添加 `mod ai_review` 并注册三个新命令到 `generate_handler!`

## 3. 前端类型

- [x] 3.1 在 `src/types/index.ts` 中新增 `AiReview` 接口（id, project_id, title, result, created_at）
- [x] 3.2 在 `src/types/index.ts` 中新增 `AiReviewResult` 接口（summary, issues）和 `AiReviewIssue` 接口（level, scope, title, detail）

## 4. 前端组件

- [x] 4.1 新建 `src/components/proj-detail/ai-review-tab.tsx`，实现左右分栏布局（左侧历史列表 + 右侧详情）
- [x] 4.2 实现历史记录列表：加载 `get_ai_reviews`，按时间倒序展示，支持点击选中
- [x] 4.3 实现「新建评审」Modal：输入评审标题（可选）和业务背景（可选），确认后发起评审
- [x] 4.4 实现评审 Prompt 构建：读取 `ai_design_common_prompt`，将所有表字段信息序列化为描述文本，拼接业务背景
- [x] 4.5 实现 AI 调用逻辑：调用 `callAiApi`，解析 JSON 结果，处理解析失败的降级（原始文本作为 summary）
- [x] 4.6 实现评审结果展示：按 scope 分组，不同 level 用不同颜色 Tag（error=红/warning=橙/suggestion=蓝）
- [x] 4.7 实现删除评审记录：Popconfirm 确认后调用 `delete_ai_review`，刷新列表
- [x] 4.8 实现空状态：无历史记录时右侧展示引导提示；项目无表时禁用「开始评审」按钮

## 5. Tab 接入

- [x] 5.1 在 `src/components/proj-detail/index.tsx` 中引入 `AiReviewTab` 组件
- [x] 5.2 将 AI 评审 Tab 添加到项目级 Tabs 列表中（与版本管理、远程同步平级）

## 6. 验证

- [x] 6.1 在 `src-tauri/` 目录运行 `cargo check` 确认 Rust 编译无误
- [x] 6.2 在项目根目录运行 `npx tsc --noEmit` 确认 TypeScript 类型检查通过
