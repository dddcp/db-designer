use std::collections::{HashMap, HashSet};
use rusqlite::params;

use crate::db::init_db;
use crate::dialect::get_dialect;
use crate::models::*;

/// 从内置默认 + t_setting 中 custom_data_types 读取动态类型配置。
/// 返回 (length_types, scale_types) 两个集合。
pub fn get_type_length_info(conn: &rusqlite::Connection) -> (HashSet<String>, HashSet<String>) {
    // 内置：仅长度
    let mut length_types: HashSet<String> = ["varchar", "char"].iter().map(|s| s.to_string()).collect();
    // 内置：精度+小数位（hasScale 隐含 hasLength）
    let mut scale_types: HashSet<String> = ["decimal"].iter().map(|s| s.to_string()).collect();

    // 从 t_setting 读取 custom_data_types
    if let Ok(json) = conn.query_row(
        "SELECT value FROM t_setting WHERE key = 'custom_data_types'",
        [],
        |row| row.get::<_, String>(0),
    ) {
        if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&json) {
            for item in &arr {
                if let Some(value) = item.get("value").and_then(|v| v.as_str()) {
                    let val = value.to_lowercase();
                    let has_scale = item.get("hasScale").and_then(|v| v.as_bool()).unwrap_or(false);
                    let has_length = item.get("hasLength").and_then(|v| v.as_bool()).unwrap_or(false);
                    if has_scale {
                        scale_types.insert(val);
                    } else if has_length {
                        length_types.insert(val);
                    }
                }
            }
        }
    }

    (length_types, scale_types)
}

/// 根据 length_types/scale_types 集合，拼接类型后缀 (len) 或 (len,scale)
pub fn append_type_suffix(def: &mut String, data_type: &str, length: Option<i32>, scale: Option<i32>, length_types: &HashSet<String>, scale_types: &HashSet<String>) {
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

// 获取版本列表
#[tauri::command]
pub fn get_versions(project_id: i32) -> Result<Vec<Version>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT id, project_id, name, snapshot, created_at FROM t_version WHERE project_id = ?1 ORDER BY id DESC")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let iter = stmt.query_map(params![project_id], |row| {
        Ok(Version {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            snapshot: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| format!("Error querying versions: {}", e))?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| format!("Error reading version: {}", e))?);
    }
    Ok(results)
}

// 创建版本（快照当前项目的全部表结构 + 元数据）
#[tauri::command]
pub fn create_version(project_id: i32, name: String) -> Result<Version, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    // 1. 获取所有表
    let mut table_stmt = conn.prepare("SELECT id, name, display_name, comment FROM t_table WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| format!("Error preparing table stmt: {}", e))?;
    let tables: Vec<(String, String, String, Option<String>)> = table_stmt.query_map(params![project_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    }).map_err(|e| format!("Error querying tables: {}", e))?
      .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading tables: {}", e))?;

    let mut snapshot_tables = Vec::new();

    for (table_id, table_name, display_name, comment) in &tables {
        // 2. 获取列
        let mut col_stmt = conn.prepare("SELECT id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, comment, sort_order FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
            .map_err(|e| format!("Error preparing column stmt: {}", e))?;
        let columns: Vec<ColumnDef> = col_stmt.query_map(params![table_id], |row| {
            Ok(ColumnDef {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                display_name: row.get(3)?,
                data_type: row.get(4)?,
                length: row.get(5)?,
                scale: row.get(6)?,
                nullable: row.get(7)?,
                primary_key: row.get(8)?,
                auto_increment: row.get(9)?,
                default_value: row.get(10)?,
                comment: row.get(11)?,
                sort_order: row.get(12)?,
            })
        }).map_err(|e| format!("Error querying columns: {}", e))?
          .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading columns: {}", e))?;

        // 3. 获取索引
        let mut idx_stmt = conn.prepare("SELECT id, table_id, name, index_type, comment FROM t_index WHERE table_id = ?1")
            .map_err(|e| format!("Error preparing index stmt: {}", e))?;
        let mut indexes: Vec<IndexDef> = idx_stmt.query_map(params![table_id], |row| {
            Ok(IndexDef {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                index_type: row.get(3)?,
                comment: row.get(4)?,
                fields: Vec::new(),
            })
        }).map_err(|e| format!("Error querying indexes: {}", e))?
          .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading indexes: {}", e))?;

        for idx in &mut indexes {
            let mut field_stmt = conn.prepare("SELECT column_id, sort_order FROM t_index_field WHERE index_id = ?1 ORDER BY sort_order")
                .map_err(|e| format!("Error preparing field stmt: {}", e))?;
            idx.fields = field_stmt.query_map(params![idx.id], |row| {
                Ok(IndexField {
                    column_id: row.get(0)?,
                    sort_order: row.get(1)?,
                })
            }).map_err(|e| format!("Error querying index fields: {}", e))?
              .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading index fields: {}", e))?;
        }

        // 4. 获取元数据
        let mut data_stmt = conn.prepare("SELECT data FROM t_init_data WHERE table_id = ?1 ORDER BY id")
            .map_err(|e| format!("Error preparing init data stmt: {}", e))?;
        let init_data: Vec<String> = data_stmt.query_map(params![table_id], |row| {
            row.get(0)
        }).map_err(|e| format!("Error querying init data: {}", e))?
          .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading init data: {}", e))?;

        snapshot_tables.push(SnapshotTable {
            id: table_id.clone(),
            name: table_name.clone(),
            display_name: display_name.clone(),
            comment: comment.clone(),
            columns,
            indexes,
            init_data,
        });
    }

    let snapshot = Snapshot { tables: snapshot_tables };
    let snapshot_json = serde_json::to_string(&snapshot).map_err(|e| format!("Error serializing snapshot: {}", e))?;

    // 5. 插入版本
    conn.execute(
        "INSERT INTO t_version (project_id, name, snapshot) VALUES (?1, ?2, ?3)",
        params![project_id, name, snapshot_json],
    ).map_err(|e| format!("Error creating version: {}", e))?;

    let version_id = conn.last_insert_rowid();
    let mut stmt = conn.prepare("SELECT id, project_id, name, snapshot, created_at FROM t_version WHERE id = ?1")
        .map_err(|e| format!("Error preparing stmt: {}", e))?;
    let version = stmt.query_row(params![version_id], |row| {
        Ok(Version {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            snapshot: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| format!("Error reading created version: {}", e))?;

    Ok(version)
}

// 删除版本
#[tauri::command]
pub fn delete_version(id: i64) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    conn.execute("DELETE FROM t_version WHERE id = ?1", params![id])
        .map_err(|e| format!("Error deleting version: {}", e))?;
    Ok("版本删除成功".to_string())
}

// 导出某个版本的完整建表 SQL
#[tauri::command]
pub fn export_version_sql(version_id: i64, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let (length_types, scale_types) = get_type_length_info(&conn);

    let snapshot_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading version: {}", e))?;

    let snapshot: Snapshot = serde_json::from_str(&snapshot_json)
        .map_err(|e| format!("Error parsing snapshot: {}", e))?;

    let mut sql = String::new();
    let dialect = get_dialect(&database_type);

    for table in &snapshot.tables {
        sql.push_str(&format!("-- {} ({})\n", table.display_name, table.name));
        sql.push_str(&dialect.create_table_prefix(&table.name));

        let mut col_defs: Vec<String> = Vec::new();
        for col in &table.columns {
            let mapped_type = dialect.map_data_type(&col.data_type);
            let mut def = format!("  {} {}", col.name, mapped_type.to_uppercase());
            append_type_suffix(&mut def, &col.data_type, col.length, col.scale, &length_types, &scale_types);
            if !col.nullable { def.push_str(dialect.not_null_clause()); }
            if col.auto_increment {
                def.push_str(dialect.auto_increment_suffix());
            }
            if let Some(dv) = &col.default_value {
                if !dv.is_empty() { def.push_str(&dialect.default_value_clause(dv)); }
            }
            if dialect.supports_inline_comment() {
                let comment_text = col.comment.as_deref().filter(|c| !c.is_empty()).unwrap_or(&col.display_name);
                if !comment_text.is_empty() { def.push_str(&format!(" COMMENT '{}'", comment_text.replace('\'', "''"))); }
            }
            col_defs.push(def);
        }

        let pks: Vec<&str> = table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
        if !pks.is_empty() {
            col_defs.push(dialect.primary_key_clause(&pks));
        }

        sql.push_str(&col_defs.join(",\n"));
        sql.push_str("\n);\n\n");

        // Table comment
        sql.push_str(&dialect.table_comment_sql(&table.name, &table.display_name));
        // Column comments (non-empty only for PG)
        for col in &table.columns {
            let comment_text = col.comment.as_deref().filter(|c| !c.is_empty()).unwrap_or(&col.display_name);
            if !comment_text.is_empty() {
                let cs = dialect.column_comment_sql(&table.name, &col.name, comment_text);
                if !cs.is_empty() { sql.push_str(&cs); }
            }
        }
        sql.push('\n');

        // Indexes
        for idx in &table.indexes {
            let col_names: Vec<&str> = idx.fields.iter().map(|f| {
                table.columns.iter().find(|c| c.id == f.column_id).map(|c| c.name.as_str()).unwrap_or("?")
            }).collect();
            sql.push_str(&dialect.create_index_sql(&idx.name, &table.name, &col_names, &idx.index_type));
        }
        if !table.indexes.is_empty() { sql.push('\n'); }

        // Init data INSERT
        if !table.init_data.is_empty() && !table.columns.is_empty() {
            let col_names: Vec<&str> = table.columns.iter().map(|c| c.name.as_str()).collect();
            sql.push_str(&format!("-- {} 元数据\n", table.display_name));
            for data_json in &table.init_data {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                    let values: Vec<String> = col_names.iter().map(|cn| {
                        match data.get(*cn) {
                            Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                            Some(serde_json::Value::Number(n)) => n.to_string(),
                            Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                            Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                            Some(other) => dialect.string_literal(&other.to_string()),
                        }
                    }).collect();
                    sql.push_str(&dialect.insert_sql(&table.name, &col_names, &values));
                }
            }
            sql.push('\n');
        }
    }

    Ok(sql)
}

// 生成从旧版本到新版本的升级 SQL
#[tauri::command]
pub fn export_upgrade_sql(old_version_id: i64, new_version_id: i64, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let (length_types, scale_types) = get_type_length_info(&conn);

    let old_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![old_version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading old version: {}", e))?;
    let new_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![new_version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading new version: {}", e))?;

    let old_snap: Snapshot = serde_json::from_str(&old_json).map_err(|e| format!("Error parsing old snapshot: {}", e))?;
    let new_snap: Snapshot = serde_json::from_str(&new_json).map_err(|e| format!("Error parsing new snapshot: {}", e))?;

    let dialect = get_dialect(&database_type);
    let mut sql = String::new();
    sql.push_str("-- 升级脚本\n\n");

    let old_map: HashMap<String, &SnapshotTable> = old_snap.tables.iter().map(|t| (t.name.clone(), t)).collect();
    let new_map: HashMap<String, &SnapshotTable> = new_snap.tables.iter().map(|t| (t.name.clone(), t)).collect();

    // 1. New tables (with indexes and init data)
    for new_table in &new_snap.tables {
        if !old_map.contains_key(&new_table.name) {
            sql.push_str(&format!("-- 新增表: {}\n", new_table.display_name));
            sql.push_str(&dialect.create_table_prefix(&new_table.name));
            let mut col_defs: Vec<String> = Vec::new();
            for col in &new_table.columns {
                let mut def = format!("  {} {}", col.name, col.data_type.to_uppercase());
                append_type_suffix(&mut def, &col.data_type, col.length, col.scale, &length_types, &scale_types);
                if !col.nullable { def.push_str(dialect.not_null_clause()); }
                if col.auto_increment {
                    def.push_str(dialect.auto_increment_suffix());
                }
                if let Some(dv) = &col.default_value {
                    if !dv.is_empty() { def.push_str(&dialect.default_value_clause(dv)); }
                }
                col_defs.push(def);
            }
            let pks: Vec<&str> = new_table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
            if !pks.is_empty() { col_defs.push(dialect.primary_key_clause(&pks)); }
            sql.push_str(&col_defs.join(",\n"));
            sql.push_str("\n);\n\n");

            // New table indexes
            for idx in &new_table.indexes {
                let col_names: Vec<&str> = idx.fields.iter().map(|f| {
                    new_table.columns.iter().find(|c| c.id == f.column_id).map(|c| c.name.as_str()).unwrap_or("?")
                }).collect();
                sql.push_str(&dialect.create_index_sql(&idx.name, &new_table.name, &col_names, &idx.index_type));
            }
            if !new_table.indexes.is_empty() { sql.push('\n'); }

            // New table init data
            if !new_table.init_data.is_empty() && !new_table.columns.is_empty() {
                let col_names: Vec<&str> = new_table.columns.iter().map(|c| c.name.as_str()).collect();
                sql.push_str(&format!("-- {} 元数据\n", new_table.display_name));
                for data_json in &new_table.init_data {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                        let values: Vec<String> = col_names.iter().map(|cn| {
                            match data.get(*cn) {
                                Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                                Some(serde_json::Value::Number(n)) => n.to_string(),
                                Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                                Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                                Some(other) => dialect.string_literal(&other.to_string()),
                            }
                        }).collect();
                        sql.push_str(&dialect.insert_sql(&new_table.name, &col_names, &values));
                    }
                }
                sql.push('\n');
            }
        }
    }

    // 2. Dropped tables
    for old_table in &old_snap.tables {
        if !new_map.contains_key(&old_table.name) {
            sql.push_str(&format!("-- 删除表: {}\n", old_table.display_name));
            sql.push_str(&dialect.drop_table_sql(&old_table.name));
            sql.push('\n');
        }
    }

    // 3. Modified tables: column diff
    for new_table in &new_snap.tables {
        if let Some(old_table) = old_map.get(&new_table.name) {
            let old_cols: HashMap<String, &ColumnDef> = old_table.columns.iter().map(|c| (c.name.clone(), c)).collect();
            let new_cols: HashMap<String, &ColumnDef> = new_table.columns.iter().map(|c| (c.name.clone(), c)).collect();

            let mut changes = Vec::new();

            for col in &new_table.columns {
                if !old_cols.contains_key(&col.name) {
                    let mapped_type = dialect.map_data_type(&col.data_type);
                    let mut def = format!("{} {}", col.name, mapped_type.to_uppercase());
                    append_type_suffix(&mut def, &col.data_type, col.length, col.scale, &length_types, &scale_types);
                    if !col.nullable { def.push_str(dialect.not_null_clause()); }
                    if let Some(dv) = &col.default_value {
                        if !dv.is_empty() { def.push_str(&dialect.default_value_clause(dv)); }
                    }
                    changes.push(dialect.add_column_clause(&def));
                }
            }

            for col in &old_table.columns {
                if !new_cols.contains_key(&col.name) {
                    changes.push(dialect.drop_column_clause(&col.name));
                }
            }

            for col in &new_table.columns {
                if let Some(old_col) = old_cols.get(&col.name) {
                    let type_changed = col.data_type != old_col.data_type || col.length != old_col.length || col.scale != old_col.scale || col.nullable != old_col.nullable;
                    if type_changed {
                        let mapped_type = dialect.map_data_type(&col.data_type);
                        let full_type = mapped_type.to_uppercase();
                        let mut type_with_suffix = full_type.clone();
                        append_type_suffix(&mut type_with_suffix, &col.data_type, col.length, col.scale, &length_types, &scale_types);
                        if !col.nullable { type_with_suffix.push_str(dialect.not_null_clause()); }
                        changes.push(dialect.modify_column_clause(&col.name, &type_with_suffix));
                    }
                }
            }

            if !changes.is_empty() {
                sql.push_str(&format!("-- 修改表: {}\n", new_table.display_name));
                sql.push_str(&format!("ALTER TABLE {}\n{};\n\n", new_table.name, changes.join(",\n")));
            }

            // Index diff
            let old_idx_map: HashMap<String, &IndexDef> = old_table.indexes.iter().map(|i| (i.name.clone(), i)).collect();
            let new_idx_map: HashMap<String, &IndexDef> = new_table.indexes.iter().map(|i| (i.name.clone(), i)).collect();

            let resolve_idx_cols = |idx: &IndexDef, table: &SnapshotTable| -> Vec<String> {
                idx.fields.iter().map(|f| {
                    table.columns.iter().find(|c| c.id == f.column_id)
                        .map(|c| c.name.clone()).unwrap_or_else(|| "?".to_string())
                }).collect()
            };

            let mut idx_changes = Vec::new();

            // Dropped indexes
            for (idx_name, _old_idx) in &old_idx_map {
                if !new_idx_map.contains_key(idx_name) {
                    idx_changes.push(dialect.drop_index_sql(idx_name, &new_table.name));
                }
            }

            // New indexes
            for (idx_name, new_idx) in &new_idx_map {
                if !old_idx_map.contains_key(idx_name) {
                    let col_names = resolve_idx_cols(new_idx, new_table);
                    let col_refs: Vec<&str> = col_names.iter().map(|s| s.as_str()).collect();
                    idx_changes.push(dialect.create_index_sql(idx_name, &new_table.name, &col_refs, &new_idx.index_type));
                }
            }

            // Modified indexes (type or columns changed -> drop + recreate)
            for (idx_name, new_idx) in &new_idx_map {
                if let Some(old_idx) = old_idx_map.get(idx_name) {
                    let old_col_names = resolve_idx_cols(old_idx, old_table);
                    let new_col_names = resolve_idx_cols(new_idx, new_table);
                    if old_idx.index_type != new_idx.index_type || old_col_names != new_col_names {
                        idx_changes.push(dialect.drop_index_sql(idx_name, &new_table.name));
                        let col_refs: Vec<&str> = new_col_names.iter().map(|s| s.as_str()).collect();
                        idx_changes.push(dialect.create_index_sql(idx_name, &new_table.name, &col_refs, &new_idx.index_type));
                    }
                }
            }

            if !idx_changes.is_empty() {
                sql.push_str(&format!("-- 索引变更: {}\n", new_table.display_name));
                for change in &idx_changes {
                    sql.push_str(change);
                }
                sql.push('\n');
            }

            // Init data diff
            let old_data_set: HashSet<&String> = old_table.init_data.iter().collect();
            let new_data_set: HashSet<&String> = new_table.init_data.iter().collect();

            let added_data: Vec<&&String> = new_data_set.difference(&old_data_set).collect();
            let removed_data: Vec<&&String> = old_data_set.difference(&new_data_set).collect();

            if !added_data.is_empty() && !new_table.columns.is_empty() {
                let col_names: Vec<&str> = new_table.columns.iter().map(|c| c.name.as_str()).collect();
                sql.push_str(&format!("-- {} 新增元数据\n", new_table.display_name));
                for data_json in added_data {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                        let values: Vec<String> = col_names.iter().map(|cn| {
                            match data.get(*cn) {
                                Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                                Some(serde_json::Value::Number(n)) => n.to_string(),
                                Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                                Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                                Some(other) => dialect.string_literal(&other.to_string()),
                            }
                        }).collect();
                        sql.push_str(&dialect.insert_sql(&new_table.name, &col_names, &values));
                    }
                }
                sql.push('\n');
            }

            if !removed_data.is_empty() && !old_table.columns.is_empty() {
                sql.push_str(&format!("-- {} 删除的元数据（请根据实际情况调整 WHERE 条件）\n", new_table.display_name));
                let pk_cols: Vec<&str> = old_table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
                for data_json in removed_data {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                        if !pk_cols.is_empty() {
                            let conditions: Vec<String> = pk_cols.iter().map(|pk| {
                                match data.get(*pk) {
                                    Some(serde_json::Value::String(s)) => format!("{} = {}", pk, dialect.string_literal(s)),
                                    Some(serde_json::Value::Number(n)) => format!("{} = {}", pk, n),
                                    _ => format!("{} = NULL", pk),
                                }
                            }).collect();
                            sql.push_str(&dialect.delete_sql(&new_table.name, &conditions));
                        }
                    }
                }
                sql.push('\n');
            }
        }
    }

    if sql.trim() == "-- 升级脚本" {
        sql.push_str("-- 无差异\n");
    }

    Ok(sql)
}

// 导出当前项目的完整 SQL（从实时数据，包含表结构、索引、元数据）
#[tauri::command]
pub fn export_project_sql(project_id: i32, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let dialect = get_dialect(&database_type);
    let (length_types, scale_types) = get_type_length_info(&conn);
    let mut sql = String::new();

    let mut table_stmt = conn.prepare("SELECT id, name, display_name FROM t_table WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| format!("Error: {}", e))?;
    let tables: Vec<(String, String, String)> = table_stmt.query_map(params![project_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    for (table_id, table_name, display_name) in &tables {
        let mut col_stmt = conn.prepare(
            "SELECT name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, comment FROM t_column WHERE table_id = ?1 ORDER BY sort_order"
        ).map_err(|e| format!("Error: {}", e))?;
        let cols: Vec<(String, String, String, Option<i32>, Option<i32>, bool, bool, bool, Option<String>, Option<String>)> = col_stmt.query_map(params![table_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?))
        }).map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

        sql.push_str(&format!("-- {} ({})\n", display_name, table_name));
        sql.push_str(&dialect.create_table_prefix(table_name));
        let mut col_defs = Vec::new();
        for (name, disp_name, dt, len, scale, nullable, _pk, ai, dv, cmt) in &cols {
            let mapped_type = dialect.map_data_type(dt);
            let mut def = format!("  {} {}", name, mapped_type.to_uppercase());
            append_type_suffix(&mut def, dt, *len, *scale, &length_types, &scale_types);
            if !nullable { def.push_str(dialect.not_null_clause()); }
            if *ai {
                def.push_str(dialect.auto_increment_suffix());
            }
            if let Some(d) = dv { if !d.is_empty() { def.push_str(&dialect.default_value_clause(d)); } }
            if dialect.supports_inline_comment() {
                let comment_text = cmt.as_deref().filter(|c| !c.is_empty()).unwrap_or(disp_name.as_str());
                if !comment_text.is_empty() { def.push_str(&format!(" COMMENT '{}'", comment_text.replace('\'', "''"))); }
            }
            col_defs.push(def);
        }
        let pks: Vec<&str> = cols.iter().filter(|c| c.6).map(|c| c.0.as_str()).collect();
        if !pks.is_empty() { col_defs.push(dialect.primary_key_clause(&pks)); }
        sql.push_str(&col_defs.join(",\n"));
        sql.push_str("\n);\n\n");

        // Table comment
        sql.push_str(&dialect.table_comment_sql(table_name, display_name));
        // Column comments (non-empty only for PG)
        for (name, disp_name, _, _, _, _, _, _, _, cmt) in &cols {
            let comment_text = cmt.as_deref().filter(|c| !c.is_empty()).unwrap_or(disp_name.as_str());
            if !comment_text.is_empty() {
                let cs = dialect.column_comment_sql(table_name, name, comment_text);
                if !cs.is_empty() { sql.push_str(&cs); }
            }
        }
        sql.push('\n');

        // Indexes
        let mut idx_stmt = conn.prepare("SELECT id, name, index_type FROM t_index WHERE table_id = ?1")
            .map_err(|e| format!("Error: {}", e))?;
        let indexes: Vec<(String, String, String)> = idx_stmt.query_map(params![table_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        }).map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

        for (idx_id, idx_name, idx_type) in &indexes {
            let mut field_stmt = conn.prepare("SELECT column_id FROM t_index_field WHERE index_id = ?1 ORDER BY sort_order")
                .map_err(|e| format!("Error: {}", e))?;
            let col_ids: Vec<String> = field_stmt.query_map(params![idx_id], |row| row.get(0))
                .map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;
            let mut name_stmt = conn.prepare("SELECT name FROM t_column WHERE id = ?1")
                .map_err(|e| format!("Error: {}", e))?;
            let resolved_names: Vec<String> = col_ids.iter().map(|cid| {
                name_stmt.query_row(params![cid], |row| row.get(0)).unwrap_or_else(|_| "?".to_string())
            }).collect();
            let col_refs: Vec<&str> = resolved_names.iter().map(|s| s.as_str()).collect();
            sql.push_str(&dialect.create_index_sql(idx_name, table_name, &col_refs, idx_type));
        }
        if !indexes.is_empty() { sql.push('\n'); }

        // Init data
        let mut data_stmt = conn.prepare("SELECT data FROM t_init_data WHERE table_id = ?1 ORDER BY id")
            .map_err(|e| format!("Error: {}", e))?;
        let init_data: Vec<String> = data_stmt.query_map(params![table_id], |row| row.get(0))
            .map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

        if !init_data.is_empty() && !cols.is_empty() {
            let col_names: Vec<&str> = cols.iter().map(|c| c.0.as_str()).collect();
            sql.push_str(&format!("-- {} 元数据\n", display_name));
            for data_json in &init_data {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                    let values: Vec<String> = col_names.iter().map(|cn| {
                        match data.get(*cn) {
                            Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                            Some(serde_json::Value::Number(n)) => n.to_string(),
                            Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                            Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                            Some(other) => dialect.string_literal(&other.to_string()),
                        }
                    }).collect();
                    sql.push_str(&dialect.insert_sql(table_name, &col_names, &values));
                }
            }
            sql.push('\n');
        }
    }

    if sql.is_empty() {
        sql.push_str("-- 项目中暂无表结构\n");
    }

    Ok(sql)
}

// 导出单个表的 SQL（从实时数据，包含表结构、索引、元数据）
#[tauri::command]
pub fn export_table_sql(table_id: String, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let dialect = get_dialect(&database_type);
    let (length_types, scale_types) = get_type_length_info(&conn);
    let mut sql = String::new();

    let (table_name, display_name): (String, String) = conn.query_row(
        "SELECT name, display_name FROM t_table WHERE id = ?1", params![table_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        }
    ).map_err(|e| format!("Error: {}", e))?;

    let mut col_stmt = conn.prepare(
        "SELECT name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, comment FROM t_column WHERE table_id = ?1 ORDER BY sort_order"
    ).map_err(|e| format!("Error: {}", e))?;
    let cols: Vec<(String, String, String, Option<i32>, Option<i32>, bool, bool, bool, Option<String>, Option<String>)> = col_stmt.query_map(params![table_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?))
    }).map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    sql.push_str(&format!("-- {} ({})\n", display_name, table_name));
    sql.push_str(&dialect.create_table_prefix(&table_name));
    let mut col_defs = Vec::new();
    for (name, disp_name, dt, len, scale, nullable, _pk, ai, dv, cmt) in &cols {
        let mapped_type = dialect.map_data_type(dt);
        let mut def = format!("  {} {}", name, mapped_type.to_uppercase());
        append_type_suffix(&mut def, dt, *len, *scale, &length_types, &scale_types);
        if !nullable { def.push_str(dialect.not_null_clause()); }
        if *ai { def.push_str(dialect.auto_increment_suffix()); }
        if let Some(d) = dv { if !d.is_empty() { def.push_str(&dialect.default_value_clause(d)); } }
        if dialect.supports_inline_comment() {
            let comment_text = cmt.as_deref().filter(|c| !c.is_empty()).unwrap_or(disp_name.as_str());
            if !comment_text.is_empty() { def.push_str(&format!(" COMMENT '{}'", comment_text.replace('\'', "''"))); }
        }
        col_defs.push(def);
    }
    let pks: Vec<&str> = cols.iter().filter(|c| c.6).map(|c| c.0.as_str()).collect();
    if !pks.is_empty() { col_defs.push(dialect.primary_key_clause(&pks)); }
    sql.push_str(&col_defs.join(",\n"));
    sql.push_str("\n);\n\n");

    // Table comment
    sql.push_str(&dialect.table_comment_sql(&table_name, &display_name));
    // Column comments
    for (name, disp_name, _, _, _, _, _, _, _, cmt) in &cols {
        let comment_text = cmt.as_deref().filter(|c| !c.is_empty()).unwrap_or(disp_name.as_str());
        if !comment_text.is_empty() {
            let cs = dialect.column_comment_sql(&table_name, name, comment_text);
            if !cs.is_empty() { sql.push_str(&cs); }
        }
    }
    sql.push('\n');

    // Indexes
    let mut idx_stmt = conn.prepare("SELECT id, name, index_type FROM t_index WHERE table_id = ?1")
        .map_err(|e| format!("Error: {}", e))?;
    let indexes: Vec<(String, String, String)> = idx_stmt.query_map(params![table_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    for (idx_id, idx_name, idx_type) in &indexes {
        let mut field_stmt = conn.prepare("SELECT column_id FROM t_index_field WHERE index_id = ?1 ORDER BY sort_order")
            .map_err(|e| format!("Error: {}", e))?;
        let col_ids: Vec<String> = field_stmt.query_map(params![idx_id], |row| row.get(0))
            .map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;
        let mut name_stmt = conn.prepare("SELECT name FROM t_column WHERE id = ?1")
            .map_err(|e| format!("Error: {}", e))?;
        let resolved_names: Vec<String> = col_ids.iter().map(|cid| {
            name_stmt.query_row(params![cid], |row| row.get(0)).unwrap_or_else(|_| "?".to_string())
        }).collect();
        let col_refs: Vec<&str> = resolved_names.iter().map(|s| s.as_str()).collect();
        sql.push_str(&dialect.create_index_sql(idx_name, &table_name, &col_refs, idx_type));
    }
    if !indexes.is_empty() { sql.push('\n'); }

    // Init data
    let mut data_stmt = conn.prepare("SELECT data FROM t_init_data WHERE table_id = ?1 ORDER BY id")
        .map_err(|e| format!("Error: {}", e))?;
    let init_data: Vec<String> = data_stmt.query_map(params![table_id], |row| row.get(0))
        .map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    if !init_data.is_empty() && !cols.is_empty() {
        let col_names: Vec<&str> = cols.iter().map(|c| c.0.as_str()).collect();
        sql.push_str(&format!("-- {} 元数据\n", display_name));
        for data_json in &init_data {
            if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                let values: Vec<String> = col_names.iter().map(|cn| {
                    match data.get(*cn) {
                        Some(serde_json::Value::String(s)) => dialect.string_literal(s),
                        Some(serde_json::Value::Number(n)) => n.to_string(),
                        Some(serde_json::Value::Bool(b)) => dialect.bool_literal(*b).into(),
                        Some(serde_json::Value::Null) | None => dialect.null_literal().into(),
                        Some(other) => dialect.string_literal(&other.to_string()),
                    }
                }).collect();
                sql.push_str(&dialect.insert_sql(&table_name, &col_names, &values));
            }
        }
        sql.push('\n');
    }

    Ok(sql)
}
