use std::collections::{HashMap, HashSet};

use crate::dialect::{get_dialect, normalize_routine_body};
use crate::models::{ColumnDef, IndexDef, RoutineDef, Snapshot, SnapshotTable, TableDef, Version};
use crate::services::routine_service::RoutineService;
use crate::services::setting_service::SettingsService;
use crate::services::table_service::TableService;
use crate::storage::sqlite::version_store::SqliteVersionStore;
use crate::storage::VersionStore;

pub struct VersionService {
    store: Box<dyn VersionStore>,
    table_service: TableService,
    routine_service: RoutineService,
    settings_service: SettingsService,
}

impl VersionService {
    pub fn new() -> Self {
        Self {
            store: Box::new(SqliteVersionStore::new()),
            table_service: TableService::new(),
            routine_service: RoutineService::new(),
            settings_service: SettingsService::new(),
        }
    }

    pub fn get_versions(&self, project_id: i32) -> Result<Vec<Version>, String> {
        self.store.get_versions(project_id)
    }

    pub fn create_version(&self, project_id: i32, name: String) -> Result<Version, String> {
        let snapshot = self.build_project_snapshot(project_id)?;
        let snapshot_json = serde_json::to_string(&snapshot)
            .map_err(|e| format!("Error serializing snapshot: {}", e))?;

        self.store.create_version(project_id, name, snapshot_json)
    }

    pub fn delete_version(&self, id: i64) -> Result<String, String> {
        self.store.delete_version(id)?;
        Ok("version_delete_success".to_string())
    }

    pub fn export_version_sql(&self, version_id: i64, database_type: String) -> Result<String, String> {
        let snapshot = self.get_snapshot_by_version_id(version_id)?;
        let (length_types, scale_types) = self.get_type_length_info()?;
        let dialect = get_dialect(&database_type);
        let mut sql = String::new();

        for table in &snapshot.tables {
            sql.push_str(&self.build_create_table_sql(table, dialect.as_ref(), &length_types, &scale_types));
        }

        let filtered_routines: Vec<&RoutineDef> = snapshot
            .routines
            .iter()
            .filter(|r| r.db_type.as_deref() == Some(&database_type) || r.db_type.is_none())
            .collect();
        if !filtered_routines.is_empty() {
            sql.push_str("-- 编程对象\n\n");
            for r in &filtered_routines {
                let type_label = match r.r#type.as_str() {
                    "function" => "函数",
                    "procedure" => "存储过程",
                    "trigger" => "触发器",
                    _ => "编程对象",
                };
                if r.db_type.is_none() {
                    sql.push_str(&format!(
                        "-- {} : {} (未指定数据库类型)\n",
                        type_label, r.name
                    ));
                } else {
                    sql.push_str(&format!("-- {} : {}\n", type_label, r.name));
                }
                sql.push_str(normalize_routine_body(r.body.trim(), &database_type).trim());
                sql.push_str("\n\n");
            }
        }

        Ok(sql)
    }

    pub fn export_upgrade_sql(
        &self,
        old_version_id: i64,
        new_version_id: i64,
        database_type: String,
    ) -> Result<String, String> {
        let old_snap = self.get_snapshot_by_version_id_with_label(old_version_id, "old")?;
        let new_snap = self.get_snapshot_by_version_id_with_label(new_version_id, "new")?;
        let (length_types, scale_types) = self.get_type_length_info()?;

        let dialect = get_dialect(&database_type);
        let mut sql = String::new();
        sql.push_str("-- 升级脚本\n\n");

        let old_map: HashMap<String, &SnapshotTable> = old_snap
            .tables
            .iter()
            .map(|t| (t.name.clone(), t))
            .collect();
        let new_map: HashMap<String, &SnapshotTable> = new_snap
            .tables
            .iter()
            .map(|t| (t.name.clone(), t))
            .collect();

        for new_table in &new_snap.tables {
            if !old_map.contains_key(&new_table.name) {
                sql.push_str(&format!("-- 新增表: {}\n", new_table.name));
                sql.push_str(&self.build_create_table_body(
                    new_table,
                    dialect.as_ref(),
                    &length_types,
                    &scale_types,
                ));
                sql.push_str("\n");
            }
        }

        for old_table in &old_snap.tables {
            if !new_map.contains_key(&old_table.name) {
                sql.push_str(&format!("-- 删除表: {}\n", old_table.name));
                sql.push_str(&dialect.drop_table_sql(&old_table.name));
                sql.push('\n');
            }
        }

        for new_table in &new_snap.tables {
            if let Some(old_table) = old_map.get(&new_table.name) {
                let old_cols: HashMap<String, &ColumnDef> = old_table
                    .columns
                    .iter()
                    .map(|c| (c.name.clone(), c))
                    .collect();
                let new_cols: HashMap<String, &ColumnDef> = new_table
                    .columns
                    .iter()
                    .map(|c| (c.name.clone(), c))
                    .collect();

                let mut changes = Vec::new();
                let mut comment_changes = Vec::new();

                for col in &new_table.columns {
                    if !old_cols.contains_key(&col.name) {
                        let def = self.build_column_definition(
                            col,
                            dialect.as_ref(),
                            &length_types,
                            &scale_types,
                            false,
                        );
                        changes.push(dialect.add_column_clause(&def));
                        if !dialect.supports_inline_comment() {
                            let comment_text = self.get_column_comment_text(col);
                            if !comment_text.is_empty() {
                                let cs = dialect.column_comment_sql(
                                    &new_table.name,
                                    &col.name,
                                    &comment_text,
                                );
                                if !cs.is_empty() {
                                    comment_changes.push(cs);
                                }
                            }
                        }
                    }
                }

                for col in &old_table.columns {
                    if !new_cols.contains_key(&col.name) {
                        changes.push(dialect.drop_column_clause(&col.name));
                    }
                }

                for col in &new_table.columns {
                    if let Some(old_col) = old_cols.get(&col.name) {
                        let type_changed = col.data_type != old_col.data_type
                            || col.length != old_col.length
                            || col.scale != old_col.scale
                            || col.nullable != old_col.nullable;
                        let default_changed = col.default_null != old_col.default_null
                            || col.default_value != old_col.default_value;
                        let ai_changed = col.auto_increment != old_col.auto_increment;
                        let comment_text = self.get_column_comment_text(col);
                        let old_comment_text = self.get_column_comment_text(old_col);
                        let comment_changed = comment_text != old_comment_text;
                        if type_changed || default_changed || ai_changed || comment_changed {
                            let type_with_suffix = self.build_column_definition(
                                col,
                                dialect.as_ref(),
                                &length_types,
                                &scale_types,
                                false,
                            );
                            changes.push(dialect.modify_column_clause(&col.name, &type_with_suffix));
                        }
                        if comment_changed && !dialect.supports_inline_comment() {
                            let cs = dialect.column_comment_sql(&new_table.name, &col.name, &comment_text);
                            if !cs.is_empty() {
                                comment_changes.push(cs);
                            }
                        }
                    }
                }

                if !changes.is_empty() {
                    sql.push_str(&format!("-- 修改表: {}\n", new_table.name));
                    sql.push_str(&format!(
                        "ALTER TABLE {}\n{};\n\n",
                        new_table.name,
                        changes.join(",\n")
                    ));
                }

                if new_table.display_name != old_table.display_name {
                    sql.push_str(&dialect.table_comment_sql(&new_table.name, &new_table.display_name));
                }

                if !comment_changes.is_empty() {
                    for cs in &comment_changes {
                        sql.push_str(cs);
                    }
                }

                let old_idx_map: HashMap<String, &IndexDef> = old_table
                    .indexes
                    .iter()
                    .map(|i| (i.name.clone(), i))
                    .collect();
                let new_idx_map: HashMap<String, &IndexDef> = new_table
                    .indexes
                    .iter()
                    .map(|i| (i.name.clone(), i))
                    .collect();

                let resolve_idx_cols = |idx: &IndexDef, table: &SnapshotTable| -> Vec<String> {
                    idx.fields
                        .iter()
                        .map(|f| {
                            table
                                .columns
                                .iter()
                                .find(|c| c.id == f.column_id)
                                .map(|c| c.name.clone())
                                .unwrap_or_else(|| "?".to_string())
                        })
                        .collect()
                };

                let mut idx_changes = Vec::new();

                for idx_name in old_idx_map.keys() {
                    if !new_idx_map.contains_key(idx_name) {
                        idx_changes.push(dialect.drop_index_sql(idx_name, &new_table.name));
                    }
                }

                for (idx_name, new_idx) in &new_idx_map {
                    if !old_idx_map.contains_key(idx_name) {
                        let col_names = resolve_idx_cols(new_idx, new_table);
                        let col_refs: Vec<&str> = col_names.iter().map(|s| s.as_str()).collect();
                        idx_changes.push(dialect.create_index_sql(
                            idx_name,
                            &new_table.name,
                            &col_refs,
                            &new_idx.index_type,
                        ));
                    }
                }

                for (idx_name, new_idx) in &new_idx_map {
                    if let Some(old_idx) = old_idx_map.get(idx_name) {
                        let old_col_names = resolve_idx_cols(old_idx, old_table);
                        let new_col_names = resolve_idx_cols(new_idx, new_table);
                        if old_idx.index_type != new_idx.index_type || old_col_names != new_col_names {
                            idx_changes.push(dialect.drop_index_sql(idx_name, &new_table.name));
                            let col_refs: Vec<&str> = new_col_names.iter().map(|s| s.as_str()).collect();
                            idx_changes.push(dialect.create_index_sql(
                                idx_name,
                                &new_table.name,
                                &col_refs,
                                &new_idx.index_type,
                            ));
                        }
                    }
                }

                if !idx_changes.is_empty() {
                    sql.push_str(&format!("-- 索引变更: {}\n", new_table.name));
                    for change in &idx_changes {
                        sql.push_str(change);
                    }
                    sql.push('\n');
                }

                let old_data_set: HashSet<&String> = old_table.init_data.iter().collect();
                let new_data_set: HashSet<&String> = new_table.init_data.iter().collect();

                let added_data: Vec<&&String> = new_data_set.difference(&old_data_set).collect();
                let removed_data: Vec<&&String> = old_data_set.difference(&new_data_set).collect();

                if !added_data.is_empty() && !new_table.columns.is_empty() {
                    let col_names: Vec<&str> = new_table.columns.iter().map(|c| c.name.as_str()).collect();
                    sql.push_str(&format!("-- {} 新增元数据\n", new_table.name));
                    for data_json in added_data {
                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                            let values: Vec<String> = col_names
                                .iter()
                                .map(|cn| match data.get(*cn) {
                                    Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                                    Some(serde_json::Value::Number(n)) => n.to_string(),
                                    Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                                    Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                                    Some(other) => dialect.string_literal(&other.to_string()),
                                })
                                .collect();
                            sql.push_str(&dialect.insert_sql(&new_table.name, &col_names, &values));
                        }
                    }
                    sql.push('\n');
                }

                if !removed_data.is_empty() && !old_table.columns.is_empty() {
                    sql.push_str(&format!(
                        "-- {} 删除的元数据（请根据实际情况调整 WHERE 条件）\n",
                        new_table.name
                    ));
                    let pk_cols: Vec<&str> = old_table
                        .columns
                        .iter()
                        .filter(|c| c.primary_key)
                        .map(|c| c.name.as_str())
                        .collect();
                    for data_json in removed_data {
                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                            if !pk_cols.is_empty() {
                                let conditions: Vec<String> = pk_cols
                                    .iter()
                                    .map(|pk| match data.get(*pk) {
                                        Some(serde_json::Value::String(s)) => {
                                            format!("{} = {}", pk, dialect.string_literal(s))
                                        }
                                        Some(serde_json::Value::Number(n)) => format!("{} = {}", pk, n),
                                        _ => format!("{} = NULL", pk),
                                    })
                                    .collect();
                                sql.push_str(&dialect.delete_sql(&new_table.name, &conditions));
                            }
                        }
                    }
                    sql.push('\n');
                }
            }
        }

        let old_routines: Vec<&RoutineDef> = old_snap
            .routines
            .iter()
            .filter(|r| r.db_type.as_deref() == Some(&database_type) || r.db_type.is_none())
            .collect();
        let new_routines: Vec<&RoutineDef> = new_snap
            .routines
            .iter()
            .filter(|r| r.db_type.as_deref() == Some(&database_type) || r.db_type.is_none())
            .collect();

        if !old_routines.is_empty() || !new_routines.is_empty() {
            let old_routine_map: HashMap<(&str, &str), &RoutineDef> = old_routines
                .iter()
                .map(|r| ((r.name.as_str(), r.r#type.as_str()), *r))
                .collect();
            let new_routine_map: HashMap<(&str, &str), &RoutineDef> = new_routines
                .iter()
                .map(|r| ((r.name.as_str(), r.r#type.as_str()), *r))
                .collect();

            let mut added_routines = Vec::new();
            let mut removed_routines = Vec::new();
            let mut modified_routines = Vec::new();

            for ((name, rtype), new_r) in &new_routine_map {
                if let Some(old_r) = old_routine_map.get(&(*name, *rtype)) {
                    let old_normalized = normalize_routine_body(old_r.body.trim(), &database_type);
                    let new_normalized = normalize_routine_body(new_r.body.trim(), &database_type);
                    if old_normalized != new_normalized {
                        modified_routines.push((*name, *rtype, *old_r, *new_r));
                    }
                } else {
                    added_routines.push((*name, *rtype, *new_r));
                }
            }

            for ((name, rtype), old_r) in &old_routine_map {
                if !new_routine_map.contains_key(&(*name, *rtype)) {
                    removed_routines.push((*name, *rtype, *old_r));
                }
            }

            if !added_routines.is_empty() || !removed_routines.is_empty() || !modified_routines.is_empty() {
                sql.push_str("-- 编程对象变更\n\n");

                for (name, rtype, _routine) in &removed_routines {
                    sql.push_str(&format!(
                        "-- 删除 {}: {}\n",
                        self.get_routine_type_label(rtype),
                        name
                    ));
                    sql.push_str(&dialect.drop_routine_sql(name, rtype));
                    sql.push_str("\n");
                }

                for (name, rtype, _old_routine, new_routine) in &modified_routines {
                    sql.push_str(&format!(
                        "-- 修改 {}: {}\n",
                        self.get_routine_type_label(rtype),
                        name
                    ));
                    sql.push_str(&dialect.drop_routine_sql(name, rtype));
                    sql.push_str(normalize_routine_body(new_routine.body.trim(), &database_type).trim());
                    sql.push_str("\n\n");
                }

                for (name, rtype, routine) in &added_routines {
                    sql.push_str(&format!(
                        "-- 新增 {}: {}\n",
                        self.get_routine_type_label(rtype),
                        name
                    ));
                    sql.push_str(normalize_routine_body(routine.body.trim(), &database_type).trim());
                    sql.push_str("\n\n");
                }
            }
        }

        if sql.trim() == "-- 升级脚本" {
            sql.push_str("-- 无差异\n");
        }

        Ok(sql)
    }

    pub fn export_project_sql(&self, project_id: i32, database_type: String) -> Result<String, String> {
        let snapshot = self.build_project_snapshot(project_id)?;
        let (length_types, scale_types) = self.get_type_length_info()?;
        let dialect = get_dialect(&database_type);
        let mut sql = String::new();

        for table in &snapshot.tables {
            sql.push_str(&self.build_create_table_sql(table, dialect.as_ref(), &length_types, &scale_types));
        }

        if sql.is_empty() {
            sql.push_str("-- 项目中暂无表结构\n");
        }

        Ok(sql)
    }

    pub fn export_table_sql(&self, table_id: String, database_type: String) -> Result<String, String> {
        let table = self.build_snapshot_table(&table_id)?;
        let (length_types, scale_types) = self.get_type_length_info()?;
        let dialect = get_dialect(&database_type);

        Ok(self.build_create_table_sql(&table, dialect.as_ref(), &length_types, &scale_types))
    }

    fn build_project_snapshot(&self, project_id: i32) -> Result<Snapshot, String> {
        let tables = self.table_service.get_project_tables(project_id)?;
        let mut snapshot_tables = Vec::new();

        for table in &tables {
            snapshot_tables.push(self.build_snapshot_table(&table.id)?);
        }

        let snapshot_routines = self.routine_service.get_project_routines(project_id)?;

        Ok(Snapshot {
            tables: snapshot_tables,
            routines: snapshot_routines,
        })
    }

    fn build_snapshot_table(&self, table_id: &str) -> Result<SnapshotTable, String> {
        let table = self
            .table_service
            .get_table_by_id(table_id.to_string())?
            .ok_or_else(|| "Error: table not found".to_string())?;

        self.build_snapshot_table_from_def(&table)
    }

    fn get_snapshot_by_version_id_with_label(&self, version_id: i64, label: &str) -> Result<Snapshot, String> {
        let snapshot_json = self.store.get_version_snapshot(version_id).map_err(|e| {
            if label == "old" {
                format!("Error reading old version: {}", e.trim_start_matches("Error reading version: "))
            } else {
                format!("Error reading new version: {}", e.trim_start_matches("Error reading version: "))
            }
        })?;

        serde_json::from_str(&snapshot_json).map_err(|e| {
            if label == "old" {
                format!("Error parsing old snapshot: {}", e)
            } else {
                format!("Error parsing new snapshot: {}", e)
            }
        })
    }

    fn build_snapshot_table_from_def(&self, table: &TableDef) -> Result<SnapshotTable, String> {
        let columns = self.table_service.get_table_columns(table.id.clone())?;
        let indexes = self.table_service.get_table_indexes(table.id.clone())?;
        let init_data = self
            .table_service
            .get_init_data(table.id.clone())?
            .into_iter()
            .map(|row| row.data)
            .collect();

        Ok(SnapshotTable {
            id: table.id.clone(),
            name: table.name.clone(),
            display_name: table.display_name.clone(),
            comment: table.comment.clone(),
            columns,
            indexes,
            init_data,
        })
    }

    fn get_snapshot_by_version_id(&self, version_id: i64) -> Result<Snapshot, String> {
        let snapshot_json = self.store.get_version_snapshot(version_id)?;
        serde_json::from_str(&snapshot_json)
            .map_err(|e| format!("Error parsing snapshot: {}", e))
    }

    fn get_type_length_info(&self) -> Result<(HashSet<String>, HashSet<String>), String> {
        let mut length_types: HashSet<String> =
            ["varchar", "char"].iter().map(|s| s.to_string()).collect();
        let mut scale_types: HashSet<String> = ["decimal"].iter().map(|s| s.to_string()).collect();

        if let Some(json) = self.settings_service.get_setting("custom_data_types".to_string())? {
            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&json) {
                for item in &arr {
                    if let Some(value) = item.get("value").and_then(|v| v.as_str()) {
                        let val = value.to_lowercase();
                        let has_scale = item
                            .get("hasScale")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        let has_length = item
                            .get("hasLength")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);
                        if has_scale {
                            scale_types.insert(val);
                        } else if has_length {
                            length_types.insert(val);
                        }
                    }
                }
            }
        }

        Ok((length_types, scale_types))
    }

    fn append_type_suffix(
        &self,
        def: &mut String,
        data_type: &str,
        length: Option<i32>,
        scale: Option<i32>,
        length_types: &HashSet<String>,
        scale_types: &HashSet<String>,
    ) {
        if let Some(len) = length {
            let dt_lower = data_type.to_lowercase();
            if scale_types.contains(&dt_lower) {
                let s = scale.unwrap_or(0);
                def.push_str(&format!("({},{})", len, s));
            } else if length_types.contains(&dt_lower) {
                def.push_str(&format!("({})", len));
            }
        }
    }

    fn build_column_definition(
        &self,
        col: &ColumnDef,
        dialect: &dyn crate::dialect::DatabaseDialect,
        length_types: &HashSet<String>,
        scale_types: &HashSet<String>,
        with_indent: bool,
    ) -> String {
        let mapped_type = dialect.map_data_type(&col.data_type);
        let prefix = if with_indent { "  " } else { "" };
        let mut def = format!("{}{} {}", prefix, col.name, mapped_type.to_uppercase());
        self.append_type_suffix(
            &mut def,
            &col.data_type,
            col.length,
            col.scale,
            length_types,
            scale_types,
        );
        if !col.nullable {
            def.push_str(dialect.not_null_clause());
        }
        if col.auto_increment {
            def.push_str(dialect.auto_increment_suffix());
        }
        if col.default_null {
            def.push_str(" DEFAULT NULL");
        } else if let Some(dv) = &col.default_value {
            if !dv.is_empty() {
                def.push_str(&dialect.default_value_clause(dv));
            }
        }
        if dialect.supports_inline_comment() {
            let comment_text = self.get_column_comment_text(col);
            if !comment_text.is_empty() {
                def.push_str(&format!(" COMMENT '{}'", comment_text.replace('\'', "''")));
            }
        }
        def
    }

    fn build_create_table_body(
        &self,
        table: &SnapshotTable,
        dialect: &dyn crate::dialect::DatabaseDialect,
        length_types: &HashSet<String>,
        scale_types: &HashSet<String>,
    ) -> String {
        let mut sql = String::new();
        sql.push_str(&dialect.create_table_prefix(&table.name));

        let mut col_defs: Vec<String> = table
            .columns
            .iter()
            .map(|col| self.build_column_definition(col, dialect, length_types, scale_types, true))
            .collect();

        let pks: Vec<&str> = table
            .columns
            .iter()
            .filter(|c| c.primary_key)
            .map(|c| c.name.as_str())
            .collect();
        if !pks.is_empty() {
            col_defs.push(dialect.primary_key_clause(&pks));
        }

        sql.push_str(&col_defs.join(",\n"));
        sql.push_str("\n);\n\n");

        let table_comment = table.display_name.replace("\r\n", "\\n").replace("\n", "\\n");
        sql.push_str(&dialect.table_comment_sql(&table.name, &table_comment));
        for col in &table.columns {
            let comment_text = self.get_column_comment_text(col);
            if !comment_text.is_empty() {
                let cs = dialect.column_comment_sql(&table.name, &col.name, &comment_text);
                if !cs.is_empty() {
                    sql.push_str(&cs);
                }
            }
        }
        sql.push('\n');

        for idx in &table.indexes {
            let col_names: Vec<&str> = idx
                .fields
                .iter()
                .map(|f| {
                    table
                        .columns
                        .iter()
                        .find(|c| c.id == f.column_id)
                        .map(|c| c.name.as_str())
                        .unwrap_or("?")
                })
                .collect();
            sql.push_str(&dialect.create_index_sql(
                &idx.name,
                &table.name,
                &col_names,
                &idx.index_type,
            ));
        }
        if !table.indexes.is_empty() {
            sql.push('\n');
        }

        if !table.init_data.is_empty() && !table.columns.is_empty() {
            let col_names: Vec<&str> = table.columns.iter().map(|c| c.name.as_str()).collect();
            sql.push_str(&format!("-- {} 元数据\n", table.name));
            for data_json in &table.init_data {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                    let values: Vec<String> = col_names
                        .iter()
                        .map(|cn| match data.get(*cn) {
                            Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                            Some(serde_json::Value::Number(n)) => n.to_string(),
                            Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                            Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                            Some(other) => dialect.string_literal(&other.to_string()),
                        })
                        .collect();
                    sql.push_str(&dialect.insert_sql(&table.name, &col_names, &values));
                }
            }
            sql.push('\n');
        }

        sql
    }

    fn build_create_table_sql(
        &self,
        table: &SnapshotTable,
        dialect: &dyn crate::dialect::DatabaseDialect,
        length_types: &HashSet<String>,
        scale_types: &HashSet<String>,
    ) -> String {
        let mut sql = String::new();
        sql.push_str(&format!("-- {}\n", table.name));
        sql.push_str(&self.build_create_table_body(table, dialect, length_types, scale_types));
        sql
    }

    fn get_column_comment_text(&self, col: &ColumnDef) -> String {
        col.comment
            .as_deref()
            .filter(|c| !c.is_empty())
            .unwrap_or(&col.display_name)
            .to_string()
    }

    fn get_routine_type_label(&self, routine_type: &str) -> &str {
        match routine_type {
            "function" => "函数",
            "procedure" => "存储过程",
            "trigger" => "触发器",
            _ => "编程对象",
        }
    }
}
