## ADDED Requirements

### Requirement: i18n 初始化与配置
系统 SHALL 使用 i18next + react-i18next + i18next-browser-languagedetector 初始化国际化框架，配置文件位于 `src/i18n/index.ts`，MUST 在应用启动前完成初始化。翻译文件 MUST 使用扁平化 key 结构，存储在 `src/i18n/locales/zh-CN.json` 和 `src/i18n/locales/en-US.json`。

#### Scenario: 应用启动时初始化 i18n
- **WHEN** 应用启动
- **THEN** 系统 SHALL 在 React 渲染前完成 i18next 初始化，加载当前语言的翻译资源

#### Scenario: 默认语言回退
- **WHEN** 检测到的语言既不是 zh-CN 也不是 en-US
- **THEN** 系统 SHALL 回退到 zh-CN 作为默认语言

### Requirement: 语言检测与持久化
系统 SHALL 通过 i18next-browser-languagedetector 检测用户语言偏好，检测顺序 MUST 为：localStorage（key 为 `i18n_lang`）→ navigator.language → fallback zh-CN。用户切换语言后 SHALL 将选择持久化到 localStorage。

#### Scenario: 首次访问自动检测浏览器语言
- **WHEN** 用户首次打开应用且 localStorage 中没有 `i18n_lang`
- **THEN** 系统 SHALL 检测 navigator.language，若为英文则使用 en-US，否则使用 zh-CN

#### Scenario: 用户手动切换语言并持久化
- **WHEN** 用户在设置页面切换语言
- **THEN** 系统 SHALL 立即更新界面语言，并将选择保存到 localStorage 的 `i18n_lang` 字段

#### Scenario: 再次访问时恢复上次语言
- **WHEN** 用户再次打开应用且 localStorage 中有 `i18n_lang`
- **THEN** 系统 SHALL 使用 localStorage 中保存的语言设置

### Requirement: Ant Design locale 联动
系统 SHALL 在 App.tsx 的 ConfigProvider 上根据当前 i18n 语言动态设置 Ant Design 的 locale 属性，使得 Ant Design 内置组件（DatePicker、Table、Modal、Pagination 等）的文字跟随语言切换。

#### Scenario: 切换为英文时 Ant Design 组件使用英文
- **WHEN** i18n 语言切换为 en-US
- **THEN** Ant Design ConfigProvider 的 locale MUST 变更为 enUS，所有内置组件文字切换为英文

#### Scenario: 切换为中文时 Ant Design 组件使用中文
- **WHEN** i18n 语言切换为 zh-CN
- **THEN** Ant Design ConfigProvider 的 locale MUST 变更为 zhCN，所有内置组件文字切换为中文