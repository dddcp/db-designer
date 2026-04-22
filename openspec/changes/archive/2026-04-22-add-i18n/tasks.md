## 1. 基础设施搭建

- [x] 1.1 安装 i18next、react-i18next、i18next-browser-languagedetector 依赖
- [x] 1.2 创建 `src/i18n/index.ts` 初始化配置（语言检测顺序：localStorage → navigator → fallback zh-CN）
- [x] 1.3 创建 `src/i18n/locales/zh-CN.json` 和 `src/i18n/locales/en-US.json` 翻译文件
- [x] 1.4 在 `main.tsx` 中导入 i18n 初始化（确保在 React 渲染前执行）
- [x] 1.5 修改 `App.tsx`：根据 i18n 语言动态设置 Ant Design ConfigProvider 的 locale 属性

## 2. 后端字符串改英文

- [x] 2.1 修改 `sync_service.rs`：将 ColumnDiff/IndexDiff detail 中的中文标签改为英文（类型→Type、可空→Nullable、默认值→Default、说明→Comment、主键→Primary Key、自增→Auto Increment、列→Columns）
- [x] 2.2 修改 `setting_service.rs`：将中文成功消息改为英文标识符
- [x] 2.3 修改 `project_service.rs`：将中文成功/错误消息改为英文标识符
- [x] 2.4 修改 `table_service.rs`：将中文成功消息改为英文标识符
- [x] 2.5 修改 `routine_service.rs`：将中文成功/错误消息改为英文标识符
- [x] 2.6 修改 `database_connection_service.rs`：将中文成功消息改为英文标识符
- [x] 2.7 修改 `ai_review.rs`：将中文错误消息改为英文标识符
- [x] 2.8 修改 `dialect.rs`：将中文数据库连接/查询错误消息改为英文
- [x] 2.9 运行 `cargo check` 验证后端编译通过

## 3. 前端翻译文件编写

- [x] 3.1 编写 `zh-CN.json` 和 `en-US.json` 中通用 key（按钮、状态、消息模板等）
- [x] 3.2 编写主页 `/` 相关翻译 key（项目列表、创建、删除、Git 弹窗等）
- [x] 3.3 编写项目详情页核心翻译 key（表设计、列编辑、索引标签等）
- [x] 3.4 编写同步 tab 相关翻译 key（表对比、编程对象对比、批量同步等）
- [x] 3.5 编写版本管理、SQL 导出、编程对象、初始化数据 tab 翻译 key
- [x] 3.6 编写 AI 相关翻译 key（AI 设计、AI 修改、AI 索引推荐、AI 评审）
- [x] 3.7 编写设置页面翻译 key（基础设置、AI 配置、数据库连接、Git 配置、数据类型）
- [x] 3.8 编写后端消息映射 key（backend.* 前缀，对应后端返回的英文标识符）

## 4. 前端组件 i18n 替换

- [x] 4.1 替换 `main/main.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.2 替换 `proj-detail/index.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.3 替换 `proj-detail/sync-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.4 替换 `proj-detail/sync-table-diff.tsx` 中所有硬编码中文为 t() 调用（含索引类型映射）
- [x] 4.5 替换 `proj-detail/sync-routine-diff.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.6 替换 `proj-detail/version-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.7 替换 `proj-detail/sql-export-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.8 替换 `proj-detail/routine-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.9 替换 `proj-detail/init-data-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.10 替换 `proj-detail/index-tab.tsx`（索引管理）中所有硬编码中文为 t() 调用
- [x] 4.11 替换 `proj-detail/database-code-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.12 替换 `proj-detail/ai-design-modal.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.13 替换 `proj-detail/ai-modify-table-modal.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.14 替换 `proj-detail/ai-recommend-index-modal.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.15 替换 `proj-detail/ai-review-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.16 替换 `setting/basic-tab.tsx` 中所有硬编码中文为 t() 调用（含新增的语言切换 Select）
- [x] 4.17 替换 `setting/ai-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.18 替换 `setting/database-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.19 替换 `setting/git-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.20 替换 `setting/data-type-tab.tsx` 中所有硬编码中文为 t() 调用
- [x] 4.21 处理前端 invoke 调用后的 message.success/error/warning 翻译（利用 backend.* key 映射）

## 5. 语言切换 UI

- [x] 5.1 在 `setting/basic-tab.tsx` 中添加语言切换 Select 组件（选项：简体中文 / English，始终以母语显示）
- [x] 5.2 语言切换时同时更新 i18n 语言和 Ant Design locale（通过 i18n.changeLanguage 自动联动）
- [ ] 5.3 应用启动时从 settings.json 读取 language 配置作为 i18n 初始语言（优先级高于浏览器检测）

## 6. 验证

- [x] 6.1 运行 `npx tsc --noEmit` 验证前端类型检查通过
- [x] 6.2 运行 `cargo check`（在 src-tauri/ 下）验证后端编译通过
- [ ] 6.3 手动验证：切换为英文后全站显示英文，切换为中文后全站显示中文，AntD 组件跟随切换
- [ ] 6.4 手动验证：关闭应用重新打开，语言偏好保持