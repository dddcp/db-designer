## Why

当前 AI 设计表结构能力只能基于本次输入需求和已有表上下文生成结果，无法复用用户长期稳定的设计偏好，例如主键类型倾向、常用审计字段、字段命名习惯等。这会导致用户需要重复描述相同约束，也让生成结果难以持续贴合个人或团队的建模习惯。

## What Changes

- 在设置页 AI 配置中新增“AI 设计通用提示词”配置项，允许用户保存长期复用的默认设计偏好。
- 将该配置作为本地 AI 设置的一部分持久化到 `settings.json`，与现有 AI API 地址、Key、模型配置统一管理。
- 在 AI 自动设计表结构时，将用户配置的通用提示词追加到系统提示词中，使生成结果尽量遵循用户的默认设计习惯。
- 仅对“AI 自动设计表结构”流程生效，不改变 AI 修改表结构与 AI 推荐索引流程的行为。

## Capabilities

### New Capabilities
- `ai-design-default-prompt`: 配置并应用用户的 AI 设计通用提示词，使 AI 自动设计表结构时能够遵循默认建模偏好。

### Modified Capabilities
- `local-app-settings`: 扩展本地 AI 设置字段，支持持久化 AI 设计通用提示词。

## Impact

- 前端设置页 AI 配置表单：`src/components/setting/ai-tab.tsx`
- 前端 AI 自动设计逻辑：`src/components/proj-detail/ai-design-modal.tsx`
- 后端本地设置白名单：`src-tauri/src/services/setting_service.rs`
- 本地配置文件 `settings.json` 的 AI 设置字段集合
