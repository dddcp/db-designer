## ADDED Requirements

### Requirement: 前端中文文案提取为 t() 调用
系统 SHALL 将所有前端组件中的硬编码中文文案替换为 react-i18next 的 `t()` 函数调用，使用扁平化 key（如 `proj_create_success`）。翻译文件 MUST 包含完整的 zh-CN.json 和 en-US.json，覆盖所有提取的 key。

#### Scenario: 替换按钮文字
- **WHEN** 组件中有硬编码的按钮文字如 `创建`
- **THEN** MUST 替换为 `t('create')`，zh-CN.json 中对应 `"create": "创建"`，en-US.json 中对应 `"create": "Create"`

#### Scenario: 替换动态拼接文字
- **WHEN** 组件中有模板字符串如 `` `表 ${name} 同步成功` ``
- **THEN** MUST 替换为 `t('table_sync_success', { name })`，zh-CN.json 中对应 `"table_sync_success": "表 {{name}} 同步成功"`

#### Scenario: 替换条件显示文字
- **WHEN** 组件中有三元表达式如 `record.status === 'same' ? '结构一致' : '有差异'`
- **THEN** MUST 替换为使用翻译 key 如 `t('status_same')` / `t('status_different')`

### Requirement: 中文翻译文件完整性
zh-CN.json MUST 包含所有提取的 key，翻译值为当前硬编码的中文原文。en-US.json MUST 包含与 zh-CN.json 完全相同的 key 集合，翻译值为准确的英文专业术语。

#### Scenario: key 集合一致性
- **WHEN** 比对 zh-CN.json 和 en-US.json 的 key 集合
- **THEN** 两个文件的 key 集合 MUST 完全一致，不允许一个文件有而另一个文件没有的 key

#### Scenario: 英文翻译专业性
- **WHEN** 翻译数据库领域术语（如「字段」「索引」「存储过程」）
- **THEN** en-US.json MUST 使用标准英文术语（如 Column、Index、Stored Procedure），不使用非标准翻译

### Requirement: 索引类型映射国际化
系统 SHALL 将硬编码的索引类型中文映射（`{ normal: '普通', unique: '唯一', fulltext: '全文' }`）提取为 i18n key，并通过 `t()` 函数获取显示文字。

#### Scenario: 索引类型显示为当前语言
- **WHEN** 用户查看索引类型列表且当前语言为英文
- **THEN** 索引类型 MUST 显示为 Normal/Unique/Full-text 而非 普通/唯一/全文