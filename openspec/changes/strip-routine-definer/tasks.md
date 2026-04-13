## 1. 新增归一化函数

- [ ] 1.1 在 `dialect.rs` 中新增 `pub fn normalize_routine_body(body: &str, db_type: &str) -> String`，MySQL 时用改进后的正则 `(?i)CREATE\s+DEFINER\s*=\s*(?:`[^`]*`|[^\s@]+)@(?:`[^`]*`|[^\s]+)\s+` 剥离 `DEFINER=...` 子句，其他方言（包括空字符串）直接返回原值

## 2. 拉取时剥离

- [ ] 2.1 在 `MysqlConnector::get_remote_routines()` 中，存储 body 前调用 `normalize_routine_body()` 剥离 DEFINER

## 3. 对比时归一化

- [ ] 3.1 在 `routine_service.rs` 的 `compare_routines()` 中，对比前对 local_body 和 remote_body 都调用 `normalize_routine_body()`
- [ ] 3.2 在 `version_service.rs` 的版本间 routine diff 中，对比前对双方 body 调用 `normalize_routine_body()`

## 4. 同步时归一化

- [ ] 4.1 在 `routine_service.rs` 的 `sync_remote_routine_to_local()` 中，存储前对 body 调用 `normalize_routine_body()`

## 5. 导出时归一化

- [ ] 5.1 在 `routine_service.rs` 的 `export_routines_sql()` 中，输出 body 前调用 `normalize_routine_body()`
- [ ] 5.2 在 `version_service.rs` 的 `export_version_sql()` 中，输出 body 前调用 `normalize_routine_body()`
- [ ] 5.3 在 `version_service.rs` 的 `export_upgrade_sql()` 中，修改的 routine 和新增的 routine 输出 body 前调用 `normalize_routine_body()`

## 6. 验证

- [ ] 6.1 运行 `cargo check` 确认编译通过

## 备注

- `version_service.rs` 的 `export_project_sql` 当前不导出 routines，不在本次变更范围内，但未来如增加 routines 导出需同样应用 normalize
- 调用 `normalize_routine_body` 时，`RoutineDef.db_type` 为 `None` 的情况使用 `r.db_type.as_deref().unwrap_or("")` 处理，空字符串不触发 MySQL 分支
