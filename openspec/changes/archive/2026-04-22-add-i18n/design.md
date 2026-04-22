## Context

DB Designer 是一个 Tauri v2 桌面应用，前端 React 18 + Ant Design 5，后端 Rust + SQLite。当前所有 UI 文字硬编码为中文：

- 前端：约 23 个 `.tsx` 文件、600+ 处硬编码中文（按钮、标签、提示、错误消息等）
- 后端：约 10 个 `.rs` 文件、150+ 处中文（IPC 返回的成功/错误消息、diff detail 标签、SQL 注释）
- 零 i18n 基础设施

前端使用 Ant Design 5（天然支持 locale 切换），项目已有 `ConfigProvider`（只配了 theme）。

已选方案：后端 `detail` 字段等拼接字符串改用英文，前端负责所有翻译。扁平化 key 组织，localStorage 持久化 + 浏览器语言检测，语言切换放在设置页面。

## Goals / Non-Goals

**Goals:**
- 引入 i18n 基础设施，支持中/英双语切换
- 提取所有前端硬编码中文到翻译文件
- 后端返回给前端的用户可见字符串改为英文，前端根据 key 翻译
- Ant Design 组件 locale 跟随语言切换
- 语言选择持久化，首次打开自动检测浏览器语言
- 设置页面提供语言切换入口

**Non-Goals:**
- 不支持超过中/英两种语言（架构上可扩展，但只实现中英）
- 不翻译代码注释
- 不翻译 SQL 生成内容中的关键字（SQL 语句本身保持英文关键字）
- 不实现后端 Rust i18n 库（后端只返回英文）
- 不改变现有 IPC 数据结构（除 detail 字段内容改英文外）

## Decisions

### 1. i18n 库选择：i18next + react-i18next

**选择**: i18next + react-i18next + i18next-browser-languagedetector

**替代方案**: react-intl — 更重，message 格式不直观，生态不如 i18next 成熟

**理由**: React 生态最流行的 i18n 方案；i18next 支持插值（`{{name}}`）、复数、嵌套；react-i18next 的 `useTranslation` hook 与 React 18 完美配合；browser-languagedetector 开箱即用。

### 2. 翻译文件结构：扁平化 key，单文件

**选择**: 扁平化 key（如 `proj_create_success`），每个语言一个 JSON 文件

```
src/i18n/
  index.ts          # i18n 初始化配置
  locales/
    zh-CN.json       # 中文翻译（完整）
    en-US.json       # 英文翻译（完整）
```

**替代方案**: 按 namespace 拆分多文件 — 项目规模适中，单文件足够管理，避免 namespace 引用的复杂性

**理由**: 项目 600+ 个 key，单文件 JSON 可维护；扁平 key 避免了 `t('sync.table_name')` vs `t('sync_table_name')` 的混乱；globally unique key 更便于搜索和避免冲突。

### 3. 语言检测与持久化

**选择**: i18next-browser-languagedetector，检测顺序：localStorage → navigator.language → fallback 'zh-CN'

**配置**:
```ts
detection: {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: 'i18n_lang',
  caches: ['localStorage'],
  fallbackLng: 'zh-CN',
}
```

**理由**: localStorage 持久化用户选择；navigator 检测首次使用时的语言偏好；默认回退中文（现有用户群体以中文为主）。

### 4. 后端字符串策略：改英文，前端翻译

**选择**: 后端 IPC 返回的中文成功/错误消息改为英文，前端根据内容映射到翻译 key

**具体做法**:
- 后端 `Ok("保存成功".to_string())` → `Ok("save_success".to_string())`
- 后端 `Err("项目不存在".to_string())` → `Err("project_not_found".to_string())`
- 后端 diff detail 拼接字符串改为英文（`"Type: INT -> BIGINT; Nullable: true -> false"`）
- 前端用映射表或 key 直接翻译：`t('backend.' + message)` 或 `messageMap[message]`

**替代方案**: 后端也做 i18n — 需要在 Rust 中引入 i18n 库，维护两套翻译文件，语言需要前后端同步传递，复杂度高且实际上不需要

**替代方案**: 后端返回结构化错误码 — 更规范但需要定义大量枚举，当前项目规模不需要

**理由**: 后端保持简单，只返回英文标识符；前端统一翻译；减少跨层耦合。

### 5. 语言切换 UI：设置页面

**选择**: 在设置页面的「基础设置」tab 中添加语言选择 Select 组件

**理由**: 这是应用级的偏好设置，放在设置页最合理；不需要每个页面都有入口。

### 6. Ant Design locale 联动

**选择**: 在 App.tsx 的 ConfigProvider 上动态设置 locale prop

```tsx
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';

const antdLocale = i18n.language === 'en-US' ? enUS : zhCN;
<ConfigProvider locale={antdLocale} ...>
```

**理由**: Ant Design 5 原生支持，只需一个 prop，自动覆盖所有内置组件（DatePicker、Table、Modal、Pagination 等）的文字。

## Risks / Trade-offs

- **[翻译遗漏]** 遍历 600+ 处中文可能遗漏 → 分文件逐个提取，每个组件修改后立即运行 typecheck 验证
- **[后端错误消息重构]** 改后端返回值可能影响前端现有错误处理逻辑 → 搜索前端所有 `message.error` 和 `catch` 块，确保映射完整
- **[翻译质量]** 英文翻译需要准确的专业术语 → 参考 Ant Design 官方英文翻译和数据库领域标准术语
- **[动态文本拼接]** 部分中文通过模板字符串拼接（如 `` `表 ${name} 同步成功` ``）→ 使用 i18next 插值 `t('table_sync_success', { name })` 替代
- **[key 命名一致性]** 扁平 key 可能命名冲突 → 使用模块前缀约定（proj_, table_, column_, sync_, setting_ 等）

## Open Questions

- 后端错误码映射方式：前端用 `t('backend.' + code)` 直接映射还是维护一个 messageMap 对象？推荐前者，更简洁。
- 是否需要在 Tauri 窗口标题栏也做 i18n？当前标题栏可能硬编码中文。