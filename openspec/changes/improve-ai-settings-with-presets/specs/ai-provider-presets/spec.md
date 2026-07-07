## ADDED Requirements

### Requirement: 系统内置常用 AI 供应商预设
系统 SHALL 在前端提供一份 AI 供应商预设列表，至少包含 custom、openai、qwen、deepseek、kimi、zhipu、ernie、opencode-go 八项；每项 SHALL 包含 `id`（稳定标识）、`i18nKey`（用于本地化显示名）、`defaultBaseUrl`（默认 API 地址）、`requiresKey`（是否需要 API Key，可选）字段，且不得包含默认模型名称。

#### Scenario: 设置页显示完整供应商列表
- **WHEN** 用户打开设置页的 AI 配置 Tab
- **THEN** 供应商下拉 SHALL 至少展示 custom、openai、qwen、deepseek、kimi、zhipu、ernie、opencode-go 八项，且 custom 排在第一位

#### Scenario: 供应商显示名按当前语言本地化
- **WHEN** 用户在 zh-CN 或 en-US 语言下查看供应商下拉
- **THEN** 每项 SHALL 通过对应 i18n key 展示翻译后的显示名

### Requirement: 选中供应商时自动填充 API 地址
当用户在设置页选择一个非 custom 供应商时，系统 SHALL 自动将该供应商的 `defaultBaseUrl` 填入 API 地址字段，但 MUST 允许用户继续手动修改该字段；切换到 custom 供应商时 SHALL 清空 API 地址字段。

#### Scenario: 选择 openai 自动填充 baseUrl
- **WHEN** 用户在供应商下拉中选择 "openai"
- **THEN** API 地址字段 SHALL 自动填入 `https://api.openai.com/v1`，且该字段仍可被用户编辑

#### Scenario: 切换到 custom 清空 baseUrl
- **WHEN** 用户将供应商从其它选项切换为 custom
- **THEN** API 地址字段 SHALL 清空，等待用户手动输入

### Requirement: 模型字段支持从远端拉取与自由输入
系统的 AI 配置表单 SHALL 提供模型输入字段，其行为 MUST 同时支持两种用法：当用户成功执行"测试连接"操作后，该字段 SHALL 提供从远端 `/models` 接口拉取到的模型列表作为可选项；当用户未拉取或列表中无目标模型时，该字段 MUST 允许用户输入任意模型名称作为值。

#### Scenario: 测试连接成功后填充模型下拉
- **WHEN** 用户点击"测试连接"按钮且后端验证通过并返回模型列表
- **THEN** 模型字段 SHALL 展示该列表供用户选择，且当前已填入的模型名（若在列表中）默认被选中

#### Scenario: 未拉取时允许手动输入模型
- **WHEN** 用户尚未点击"测试连接"或拉取失败
- **THEN** 模型字段 SHALL 仍允许用户自由输入任意模型名称

#### Scenario: 模型下拉中可输入列表外的值
- **WHEN** 模型下拉已展示远端拉取的列表，但用户希望使用列表中不存在的模型名
- **THEN** 系统 MUST 接受用户输入的自定义模型名作为字段值

### Requirement: 测试连接按钮以表单当前值为输入
系统的"测试连接"按钮 MUST 使用表单当前填入的 API 地址与 API Key（无论是否已保存）发起请求；该按钮 SHALL 不依赖"保存配置"动作。

#### Scenario: 修改后立即测试无需先保存
- **WHEN** 用户在表单中修改了 API Key 但尚未点击"保存配置"
- **THEN** 点击"测试连接" SHALL 使用该未保存的新值发起请求

#### Scenario: 旧值被覆盖后立即生效于测试
- **WHEN** 用户清空了已保存的 API Key 字段后点击"测试连接"
- **THEN** 系统 SHALL 使用空 Key 发起请求，而不是使用 settings.json 中旧的值

### Requirement: 测试连接同时返回模型列表
当用户点击"测试连接"且远端验证通过时，系统 SHALL 在成功响应中同时返回该供应商的可用模型列表，并将其作为模型字段的可选项；该列表 MUST 仅来源于后端对 `GET {baseUrl}/models` 的调用结果，不在前端硬编码。

#### Scenario: 验证通过时返回模型列表
- **WHEN** 后端调用 `GET {baseUrl}/models` 成功
- **THEN** 系统 SHALL 将响应中的模型 id 列表返回给前端，用于填充模型下拉

#### Scenario: 验证失败时不下发模型列表
- **WHEN** 后端调用 `GET {baseUrl}/models` 失败（如 401、超时、网络错误）
- **THEN** 系统 SHALL 返回错误信息，模型下拉 MUST 不被填充

### Requirement: 供应商选择持久化到本地设置
系统 SHALL 将用户选择的供应商 id 保存到 `settings.json` 的 `ai_provider` 键；该字段与 `ai_base_url` / `ai_api_key` / `ai_model` / `ai_design_common_prompt` 并存，缺一不可被其它字段覆盖。

#### Scenario: 保存供应商选择
- **WHEN** 用户选择供应商并点击"保存配置"
- **THEN** 系统 SHALL 将所选供应商 id 写入 settings.json 的 `ai_provider` 键

#### Scenario: 重新打开时回填供应商
- **WHEN** 用户再次打开设置页的 AI 配置 Tab
- **THEN** 供应商下拉 SHALL 选中 `ai_provider` 保存的值；若该值不存在或不在预设列表中，则 SHALL 选中 custom
