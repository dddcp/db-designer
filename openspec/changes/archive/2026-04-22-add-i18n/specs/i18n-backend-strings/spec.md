## ADDED Requirements

### Requirement: 后端 success/error 消息改为英文标识符
所有后端 Tauri command 返回的成功和错误消息 SHALL 使用英文标识符或英文短语，而非中文。前端 MUST 根据返回的标识符通过 i18n 映射为对应语言的显示文字。

涉及文件：`setting_service.rs`、`project_service.rs`、`table_service.rs`、`routine_service.rs`、`database_connection_service.rs`、`ai_review.rs`、`dialect.rs`

#### Scenario: 保存成功消息
- **WHEN** 后端操作成功，当前返回 `Ok("保存成功".to_string())`
- **THEN** MUST 改为 `Ok("save_success".to_string())` 或类似英文标识，前端通过 `t('backend.save_success')` 翻译

#### Scenario: 错误消息
- **WHEN** 后端操作失败，当前返回 `Err("项目不存在".to_string())`
- **THEN** MUST 改为 `Err("project_not_found".to_string())` 或类似英文标识，前端通过 `t('backend.project_not_found')` 翻译

### Requirement: diff detail 字符串改为英文
`sync_service.rs` 中 `ColumnDiff.detail` 和 `IndexDiff.detail` 的拼接字符串 SHALL 使用英文标签，而非中文标签。

#### Scenario: 列差异详情使用英文标签
- **WHEN** 后端生成列差异详情，当前格式为 `"类型: INT -> BIGINT; 可空: true -> false"`
- **THEN** MUST 改为 `"Type: INT -> BIGINT; Nullable: true -> false"`

#### Scenario: 索引差异详情使用英文标签
- **WHEN** 后端生成索引差异详情，当前格式为 `"类型: BTREE -> HASH; 列: [id] -> [id,name]"`
- **THEN** MUST 改为 `"Type: BTREE -> HASH; Columns: [id] -> [id,name]"`

### Requirement: 前端处理后端返回的英文标识符
前端所有通过 `invoke` 调用后端的 `message.success()`、`message.error()`、`message.warning()` 等消息提示 SHALL 通过 i18n 翻译显示，而非直接展示后端返回的原始字符串。

#### Scenario: 后端返回英文标识符时前端翻译为中文
- **WHEN** i18n 语言为 zh-CN，后端返回 `"save_success"`
- **THEN** 前端 MUST 显示 "保存成功"

#### Scenario: 后端返回英文标识符时前端翻译为英文
- **WHEN** i18n 语言为 en-US，后端返回 `"save_success"`
- **THEN** 前端 MUST 显示 "Saved successfully"

#### Scenario: 后端返回未映射的标识符时回退显示
- **WHEN** 后端返回的字符串在翻译文件中无对应 key
- **THEN** 前端 MUST 回退显示后端返回的原始字符串