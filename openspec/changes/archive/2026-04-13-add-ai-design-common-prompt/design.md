## Context

当前 AI 设计能力的请求发送由 `src/components/proj-detail/ai-design-modal.tsx` 中的 `callAiApi` 统一处理，但真正决定生成行为的是各个场景分别构造的 system prompt。现有设置页 AI 配置仅覆盖 API 地址、Key 与模型名称，本地设置白名单也只允许这些固定键写入 `settings.json`。

这次变更同时涉及设置页表单、本地设置持久化以及 AI 设计 prompt 组装逻辑，但不涉及新的外部依赖、数据库结构或后端 AI 调用方式。功能目标是让用户能配置长期稳定的设计偏好，并在“AI 自动设计表结构”场景中复用这些偏好，而不改变其他 AI 功能的行为。

## Goals / Non-Goals

**Goals:**
- 在设置页提供可编辑的 AI 设计通用提示词输入区域。
- 将通用提示词作为本地 AI 配置的一部分保存到 `settings.json`。
- 在 AI 自动设计表结构时，将该提示词作为额外上下文拼接到 system prompt 中。
- 保持该配置为用户本机偏好，而不是项目共享配置。
- 在配置为空时保持现有 AI 设计行为不变。

**Non-Goals:**
- 不将通用提示词扩展到 AI 修改表结构或 AI 推荐索引流程。
- 不把通用提示词拆分成结构化字段（如主键类型、审计字段列表等单独表单项）。
- 不改造 `callAiApi` 的接口，不在网络层自动为所有 AI 请求注入默认提示词。
- 不将该配置迁移到 SQLite 或项目级设置。

## Decisions

### Decision: 将通用提示词作为新的本地 AI 设置字段保存
新增本地设置键 `ai_design_common_prompt`，继续复用现有 `get_local_settings` / `save_local_setting` 流程，并扩展 `SettingsService` 中的本地设置白名单。

这样可以与现有 AI API 配置保持一致的存储位置和读写路径，也符合“个人长期偏好属于本机设置”的语义。

**Alternatives considered:**
- 使用 SQLite `t_setting` 保存。Rejected，因为该字段与 AI Key、模型等一样属于用户本机偏好，不应随着设计数据库共享。
- 保存为项目级配置。Rejected，因为当前需求强调的是通用默认提示，不是单项目定制策略。

### Decision: 仅在 AI 自动设计表结构时注入提示词
通用提示词只在 `src/components/proj-detail/ai-design-modal.tsx` 的 system prompt 组装逻辑中使用，不在 `callAiApi` 内部自动附加。

这样可以精准控制生效范围，避免无意影响 AI 修改表结构和 AI 推荐索引等其他场景，同时保留后续单独扩展的空间。

**Alternatives considered:**
- 在 `callAiApi` 中统一为所有请求附加通用提示词。Rejected，因为不同 AI 功能的目标不同，索引推荐和表结构修改未必适合使用同一组设计偏好。
- 同时接入所有 AI 场景。Rejected，因为会扩大行为变更范围，降低首版可控性。

### Decision: 以自由文本方式表达默认偏好
设置页使用多行文本输入，让用户自由描述主键偏好、命名习惯、常用字段、审计字段等内容；系统不解析文本结构，只在 prompt 中原样作为“默认设计偏好”传递给模型。

这种方式与自然语言驱动的 AI 能力最匹配，能覆盖更多真实场景，也避免为未稳定的偏好模型过早引入复杂表单和校验逻辑。

**Alternatives considered:**
- 将偏好拆为结构化表单项。Rejected，因为初期需求范围有限，且字段设计容易快速膨胀。
- 仅提供预定义模板。Rejected，因为难以覆盖不同团队的命名与建模习惯。

### Decision: 将通用提示词作为软约束拼接到 system prompt
在 AI 自动设计的 system prompt 中新增独立段落，例如“用户提供了以下默认设计偏好，请在不违背业务需求的前提下尽量遵循”。当配置为空时不拼接该段。

这能明确区分系统硬性规则与用户偏好，减少模型将偏好误解为绝对约束的风险。

**Alternatives considered:**
- 将用户偏好混入现有硬规则列表。Rejected，因为会模糊规则层级，增加提示词歧义。
- 将用户偏好作为 user prompt 而不是 system prompt。Rejected，因为该信息属于稳定约束，放在 system prompt 更符合优先级语义。

## Risks / Trade-offs

- [自由文本提示词可能写得过长或过于含糊] → Mitigation: 在设置页提供用途说明与示例，引导用户填写主键偏好、命名习惯、常用字段等高价值内容。
- [通用偏好可能与单次业务需求冲突] → Mitigation: prompt 文案明确其为“尽量遵循”的默认偏好，而非强制规则。
- [新增本地设置键若未加入白名单将导致保存失败] → Mitigation: 实现时同步修改前端保存逻辑与后端 `LOCAL_SETTING_KEYS`，并通过读取回填验证链路完整。
- [未来若扩展到项目级 AI 提示词，当前字段命名可能过于偏全局] → Mitigation: 明确命名为 `ai_design_common_prompt`，强调其为全局默认项，为后续项目级附加提示保留区分空间。

## Migration Plan

1. 在本地设置白名单中加入 `ai_design_common_prompt`，确保前后端能读写该字段。
2. 扩展设置页 AI 配置表单，支持加载、编辑、保存该字段，并补充填写说明。
3. 调整 AI 自动设计表结构的 prompt 组装逻辑，在读取本地设置后按需拼接通用提示词。
4. 手工验证配置为空与配置非空两种情况下的 AI 设计行为，确认仅 AI 自动设计流程受到影响。

Rollback strategy: 若需要回退，只需移除设置页字段、白名单键与 AI 设计 prompt 拼接逻辑。该配置保存在本地 JSON 中，回退后即使残留字段未被使用，也不会影响现有功能。

## Open Questions

- 设置页是否需要提供更明确的示例文案，以帮助用户写出高质量的通用提示词？
- 后续若用户反馈希望 AI 修改表结构也复用同一偏好，是否作为独立变更推进，而不是在本次一并纳入？
