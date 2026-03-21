## 1. 数据层 (Backend Model + Migration)

- [x] 1.1 `db.rs`: 在 `init_database` 中添加 migration，执行 `ALTER TABLE t_routine ADD COLUMN db_type TEXT`
- [x] 1.2 `models.rs`: `RoutineDef` 增加 `#[serde(default)] pub db_type: Option<String>` 字段
- [x] 1.3 `types/index.ts`: `RoutineDef` 接口增加 `dbType?: string` 字段

## 2. CRUD 操作 (Backend routine.rs)

- [x] 2.1 `get_project_routines`: SELECT 语句增加 `db_type` 列，映射到 `RoutineDef.db_type`
- [x] 2.2 `save_routine`: INSERT/UPSERT 语句增加 `db_type` 列
- [x] 2.3 `delete_routine`: 无需改动（按 id 删除），确认即可

## 3. SQL 导出 (Backend routine.rs + version.rs)

- [x] 3.1 `export_routines_sql`: 增加 `database_type: String` 参数，WHERE 条件加 `(db_type = ?2 OR db_type IS NULL)`，NULL 的加注释提示
- [x] 3.2 `version.rs` → `export_version_sql`: 遍历 snapshot routines 时按 db_type 过滤（匹配 database_type 或 db_type 为 None）
- [x] 3.3 `lib.rs`: 确认 `export_routines_sql` 的 handler 注册参数同步更新

## 4. 远程同步 (Backend routine.rs)

- [x] 4.1 `compare_routines`: 增加 `db_type: String` 参数，本地查询加 `WHERE db_type = ?` 过滤
- [x] 4.2 `sync_remote_routine_to_local`: 增加 `db_type: String` 参数，UPSERT 按 `project_id + name + type + db_type` 定位，新建时写入 db_type
- [x] 4.3 `get_remote_routines_cmd`: 无需改动（返回 RemoteRoutine 不含 db_type），确认即可

## 5. 版本快照 (Backend version.rs)

- [x] 5.1 `create_version`: 确认快照序列化自然包含 `db_type` 字段（RoutineDef 加了 serde(default) 即可）

## 6. 前端 - 编程对象维护 (routine-tab.tsx)

- [x] 6.1 编辑 Drawer 增加数据库类型选择器（Select 组件，选项从 `get_supported_database_types` 获取，允许留空"未指定"）
- [x] 6.2 列表增加 db_type 列，显示数据库类型 Tag（颜色与 dbTypes 配置一致，NULL 显示灰色"未指定"）
- [x] 6.3 列表顶部增加数据库类型过滤器（Select，含"全部"选项）
- [x] 6.4 SQL 导出 Tab 增加数据库类型选择器，调用 `export_routines_sql` 时传入 `databaseType` 参数

## 7. 前端 - 同步对比 (sync-routine-diff.tsx)

- [x] 7.1 `compare_routines` 调用时传入连接的 `db_type`
- [x] 7.2 `sync_remote_routine_to_local` 调用时传入连接的 `db_type`
- [x] 7.3 对比界面显示当前比较的数据库类型信息

## 8. 验证

- [x] 8.1 `cargo check` 通过
- [x] 8.2 `npx tsc --noEmit` 通过
