## ADDED Requirements

### Requirement: 用户可配置 AI 设计通用提示词
系统 SHALL 在设置页的 AI 配置中提供"AI 设计通用提示词"输入项，允许用户保存长期复用的默认设计偏好说明。

#### Scenario: 加载已保存的通用提示词
- **WHEN** 用户打开设置页的 AI 配置，且本地设置中已存在 `ai_design_common_prompt`
- **THEN** 系统 SHALL 在对应输入项中回填该提示词内容

#### Scenario: 保存通用提示词
- **WHEN** 用户在设置页填写或修改 AI 设计通用提示词并执行保存
- **THEN** 系统 SHALL 将该值作为本地 AI 设置保存成功

### Requirement: AI 自动设计表结构时应用通用提示词
系统 SHALL 在执行 AI 自动设计表结构时，将用户配置的 AI 设计通用提示词作为默认设计偏好附加到 system prompt 中；当该配置为空时，系统 MUST 保持现有 prompt 行为不变。

#### Scenario: 配置非空时附加默认偏好
- **WHEN** 用户已配置非空的 `ai_design_common_prompt`，并触发 AI 自动设计表结构
- **THEN** 系统 SHALL 在发送给 AI 的 system prompt 中包含该默认设计偏好内容

#### Scenario: 配置为空时保持原行为
- **WHEN** 用户未配置 `ai_design_common_prompt` 或配置值为空，且触发 AI 自动设计表结构
- **THEN** 系统 SHALL 不附加默认偏好段落，并继续使用现有 AI 自动设计 prompt

### Requirement: 通用提示词仅作用于 AI 自动设计表结构
系统 MUST 将 AI 设计通用提示词的生效范围限制在"AI 自动设计表结构"流程内，不得改变其他 AI 功能的 prompt 行为。

#### Scenario: AI 修改表结构不受影响
- **WHEN** 用户触发 AI 修改表结构功能
- **THEN** 系统 SHALL 不因 `ai_design_common_prompt` 的存在而修改该流程的 prompt 组装逻辑

#### Scenario: AI 推荐索引不受影响
- **WHEN** 用户触发 AI 推荐索引功能
- **THEN** 系统 SHALL 不因 `ai_design_common_prompt` 的存在而修改该流程的 prompt 组装逻辑
