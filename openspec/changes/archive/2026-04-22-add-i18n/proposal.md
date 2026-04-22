## Why

DB Designer 目前所有用户界面文字（标签、按钮、提示、错误消息等）均硬编码为中文，无法切换语言。随着产品面向更广泛的用户群体，需要支持中/英双语，让非中文用户也能顺畅使用。

## What Changes

- 引入 `i18next` + `react-i18next` + `i18next-browser-languagedetector` 作为前端国际化框架
- 创建 `zh-CN.json` 和 `en-US.json` 扁平化翻译文件，覆盖所有前端硬编码中文文案（约 600+ 处）
- 修改 `App.tsx`，在 `ConfigProvider` 上添加 Ant Design `locale` 属性，使其跟随语言切换
- 在设置页面添加语言切换下拉框，选项持久化到 `localStorage`，首次使用自动检测浏览器语言
- 将所有前端组件中的硬编码中文替换为 `t()` 调用
- 后端 `sync_service.rs` 中 `ColumnDiff.detail` 和 `IndexDiff.detail` 的拼接中文字符串改为英文
- 后端其他返回给前端的中文字符串（成功消息、错误消息等）改为英文枚举值或英文消息，前端根据 key 翻译

## Capabilities

### New Capabilities
- `i18n-framework`: 国际化基础设施搭建 — i18n 初始化配置、翻译文件结构、语言检测与持久化、AntD locale 联动
- `i18n-extraction`: 前端所有组件中文文案提取与翻译 — 将硬编码中文替换为 t() 调用，生成完整的中英文翻译文件
- `i18n-backend-strings`: 后端返回字符串国际化处理 — 将后端返回的中文字符串改为英文，前端负责翻译展示

### Modified Capabilities
- `local-app-settings`: 新增语言偏好设置项，持久化到本地配置

## Impact

- **前端依赖**: 新增 `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- **前端组件**: 几乎所有 `.tsx` 组件文件需修改（约 23 个文件），替换硬编码中文为 `t()` 调用
- **新增文件**: `src/i18n/index.ts`（i18n 配置）、`src/i18n/locales/zh-CN.json`、`src/i18n/locales/en-US.json`
- **后端文件**: `sync_service.rs`（detail 字符串改英文）、`setting_service.rs`（成功消息改英文）、`project_service.rs`、`table_service.rs`、`routine_service.rs`、`database_connection_service.rs`、`ai_review.rs`、`dialect.rs`（错误消息改英文）
- **App.tsx**: 添加 i18n 初始化、AntD locale 切换
- **设置页面**: 新增语言切换 UI