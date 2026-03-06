use std::collections::HashMap;
use rusqlite::params;

use crate::db::init_db;
use crate::models::*;

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

// 创建版本（快照当前项目的全部表结构 + 初始数据）
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

        // 4. 获取初始数据
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

    let snapshot_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading version: {}", e))?;

    let snapshot: Snapshot = serde_json::from_str(&snapshot_json)
        .map_err(|e| format!("Error parsing snapshot: {}", e))?;

    let mut sql = String::new();
    let is_mysql = database_type == "mysql";

    for table in &snapshot.tables {
        sql.push_str(&format!("-- {} ({})\n", table.display_name, table.name));
        sql.push_str(&format!("CREATE TABLE {} (\n", table.name));

        let mut col_defs: Vec<String> = Vec::new();
        for col in &table.columns {
            let mut def = format!("  {} {}", col.name, col.data_type.to_uppercase());
            if let Some(len) = col.length {
                if col.data_type.to_lowercase() == "decimal" {
                    let s = col.scale.unwrap_or(0);
                    def.push_str(&format!("({},{})", len, s));
                } else if ["varchar", "char"].contains(&col.data_type.to_lowercase().as_str()) {
                    def.push_str(&format!("({})", len));
                }
            }
            if !col.nullable { def.push_str(" NOT NULL"); }
            if col.auto_increment {
                if is_mysql { def.push_str(" AUTO_INCREMENT"); }
                else { def.push_str(" GENERATED ALWAYS AS IDENTITY"); }
            }
            if let Some(dv) = &col.default_value {
                if !dv.is_empty() { def.push_str(&format!(" DEFAULT '{}'", dv)); }
            }
            if is_mysql {
                let comment_text = col.comment.as_deref().filter(|c| !c.is_empty()).unwrap_or(&col.display_name);
                if !comment_text.is_empty() { def.push_str(&format!(" COMMENT '{}'", comment_text)); }
            }
            col_defs.push(def);
        }

        let pks: Vec<&str> = table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
        if !pks.is_empty() {
            col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", ")));
        }

        sql.push_str(&col_defs.join(",\n"));
        sql.push_str("\n);\n\n");

        // 表注释
        if is_mysql {
            sql.push_str(&format!("ALTER TABLE {} COMMENT = '{}';\n\n", table.name, table.display_name));
        } else {
            sql.push_str(&format!("COMMENT ON TABLE {} IS '{}';\n", table.name, table.display_name));
            for col in &table.columns {
                let comment_text = col.comment.as_deref().filter(|c| !c.is_empty()).unwrap_or(&col.display_name);
                if !comment_text.is_empty() {
                    sql.push_str(&format!("COMMENT ON COLUMN {}.{} IS '{}';\n", table.name, col.name, comment_text));
                }
            }
            sql.push('\n');
        }

        // 索引
        for idx in &table.indexes {
            let col_names: Vec<&str> = idx.fields.iter().map(|f| {
                table.columns.iter().find(|c| c.id == f.column_id).map(|c| c.name.as_str()).unwrap_or("?")
            }).collect();
            let unique_str = if idx.index_type == "unique" { "UNIQUE " } else { "" };
            sql.push_str(&format!("CREATE {}INDEX {} ON {} ({});\n", unique_str, idx.name, table.name, col_names.join(", ")));
        }
        if !table.indexes.is_empty() { sql.push('\n'); }

        // 初始数据 INSERT
        if !table.init_data.is_empty() && !table.columns.is_empty() {
            let col_names: Vec<&str> = table.columns.iter().map(|c| c.name.as_str()).collect();
            sql.push_str(&format!("-- {} 初始数据\n", table.display_name));
            for data_json in &table.init_data {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                    let values: Vec<String> = col_names.iter().map(|cn| {
                        match data.get(*cn) {
                            Some(serde_json::Value::String(s)) => format!("'{}'", s.replace('\'', "''")),
                            Some(serde_json::Value::Number(n)) => n.to_string(),
                            Some(serde_json::Value::Bool(b)) => if *b { "1".into() } else { "0".into() },
                            Some(serde_json::Value::Null) | None => "NULL".into(),
                            Some(other) => format!("'{}'", other.to_string().replace('\'', "''")),
                        }
                    }).collect();
                    sql.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", table.name, col_names.join(", "), values.join(", ")));
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

    let old_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![old_version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading old version: {}", e))?;
    let new_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![new_version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading new version: {}", e))?;

    let old_snap: Snapshot = serde_json::from_str(&old_json).map_err(|e| format!("Error parsing old snapshot: {}", e))?;
    let new_snap: Snapshot = serde_json::from_str(&new_json).map_err(|e| format!("Error parsing new snapshot: {}", e))?;

    let is_mysql = database_type == "mysql";
    let mut sql = String::new();
    sql.push_str("-- 升级脚本\n\n");

    let old_map: HashMap<String, &SnapshotTable> = old_snap.tables.iter().map(|t| (t.name.clone(), t)).collect();
    let new_map: HashMap<String, &SnapshotTable> = new_snap.tables.iter().map(|t| (t.name.clone(), t)).collect();

    // 1. 新增的表
    for new_table in &new_snap.tables {
        if !old_map.contains_key(&new_table.name) {
            sql.push_str(&format!("-- 新增表: {}\n", new_table.display_name));
            sql.push_str(&format!("CREATE TABLE {} (\n", new_table.name));
            let mut col_defs: Vec<String> = Vec::new();
            for col in &new_table.columns {
                let mut def = format!("  {} {}", col.name, col.data_type.to_uppercase());
                if let Some(len) = col.length {
                    if col.data_type.to_lowercase() == "decimal" {
                        let s = col.scale.unwrap_or(0);
                        def.push_str(&format!("({},{})", len, s));
                    } else if ["varchar", "char"].contains(&col.data_type.to_lowercase().as_str()) {
                        def.push_str(&format!("({})", len));
                    }
                }
                if !col.nullable { def.push_str(" NOT NULL"); }
                if col.auto_increment {
                    if is_mysql { def.push_str(" AUTO_INCREMENT"); } else { def.push_str(" GENERATED ALWAYS AS IDENTITY"); }
                }
                if let Some(dv) = &col.default_value {
                    if !dv.is_empty() { def.push_str(&format!(" DEFAULT '{}'", dv)); }
                }
                col_defs.push(def);
            }
            let pks: Vec<&str> = new_table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
            if !pks.is_empty() { col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", "))); }
            sql.push_str(&col_defs.join(",\n"));
            sql.push_str("\n);\n\n");
        }
    }

    // 2. 删除的表
    for old_table in &old_snap.tables {
        if !new_map.contains_key(&old_table.name) {
            sql.push_str(&format!("-- 删除表: {}\n", old_table.display_name));
            sql.push_str(&format!("DROP TABLE IF EXISTS {};\n\n", old_table.name));
        }
    }

    // 3. 修改的表：比较列差异
    for new_table in &new_snap.tables {
        if let Some(old_table) = old_map.get(&new_table.name) {
            let old_cols: HashMap<String, &ColumnDef> = old_table.columns.iter().map(|c| (c.name.clone(), c)).collect();
            let new_cols: HashMap<String, &ColumnDef> = new_table.columns.iter().map(|c| (c.name.clone(), c)).collect();

            let mut changes = Vec::new();

            for col in &new_table.columns {
                if !old_cols.contains_key(&col.name) {
                    let mut def = format!("{} {}", col.name, col.data_type.to_uppercase());
                    if let Some(len) = col.length {
                        if col.data_type.to_lowercase() == "decimal" {
                            let s = col.scale.unwrap_or(0);
                            def.push_str(&format!("({},{})", len, s));
                        } else if ["varchar", "char"].contains(&col.data_type.to_lowercase().as_str()) {
                            def.push_str(&format!("({})", len));
                        }
                    }
                    if !col.nullable { def.push_str(" NOT NULL"); }
                    if let Some(dv) = &col.default_value {
                        if !dv.is_empty() { def.push_str(&format!(" DEFAULT '{}'", dv)); }
                    }
                    changes.push(format!("  ADD COLUMN {}", def));
                }
            }

            for col in &old_table.columns {
                if !new_cols.contains_key(&col.name) {
                    changes.push(format!("  DROP COLUMN {}", col.name));
                }
            }

            for col in &new_table.columns {
                if let Some(old_col) = old_cols.get(&col.name) {
                    let type_changed = col.data_type != old_col.data_type || col.length != old_col.length || col.scale != old_col.scale || col.nullable != old_col.nullable;
                    if type_changed {
                        let mut def = format!("{} {}", col.name, col.data_type.to_uppercase());
                        if let Some(len) = col.length {
                            if col.data_type.to_lowercase() == "decimal" {
                                let s = col.scale.unwrap_or(0);
                                def.push_str(&format!("({},{})", len, s));
                            } else if ["varchar", "char"].contains(&col.data_type.to_lowercase().as_str()) {
                                def.push_str(&format!("({})", len));
                            }
                        }
                        if !col.nullable { def.push_str(" NOT NULL"); }
                        if is_mysql {
                            changes.push(format!("  MODIFY COLUMN {}", def));
                        } else {
                            changes.push(format!("  ALTER COLUMN {} TYPE {}", col.name, col.data_type.to_uppercase()));
                        }
                    }
                }
            }

            if !changes.is_empty() {
                sql.push_str(&format!("-- 修改表: {}\n", new_table.display_name));
                sql.push_str(&format!("ALTER TABLE {}\n{};\n\n", new_table.name, changes.join(",\n")));
            }
        }
    }

    if sql.trim() == "-- 升级脚本" {
        sql.push_str("-- 无差异\n");
    }

    Ok(sql)
}

// 导出当前项目的完整 SQL（从实时数据，包含表结构、索引、初始数据）
#[tauri::command]
pub fn export_project_sql(project_id: i32, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let is_mysql = database_type == "mysql";
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
        sql.push_str(&format!("CREATE TABLE {} (\n", table_name));
        let mut col_defs = Vec::new();
        for (name, disp_name, dt, len, scale, nullable, _pk, ai, dv, cmt) in &cols {
            let mut def = format!("  {} {}", name, dt.to_uppercase());
            if let Some(l) = len {
                if dt.to_lowercase() == "decimal" {
                    let s = scale.unwrap_or(0);
                    def.push_str(&format!("({},{})", l, s));
                } else if ["varchar", "char"].contains(&dt.to_lowercase().as_str()) {
                    def.push_str(&format!("({})", l));
                }
            }
            if !nullable { def.push_str(" NOT NULL"); }
            if *ai {
                if is_mysql { def.push_str(" AUTO_INCREMENT"); }
                else { def.push_str(" GENERATED ALWAYS AS IDENTITY"); }
            }
            if let Some(d) = dv { if !d.is_empty() { def.push_str(&format!(" DEFAULT '{}'", d)); } }
            if is_mysql {
                let comment_text = cmt.as_deref().filter(|c| !c.is_empty()).unwrap_or(disp_name.as_str());
                if !comment_text.is_empty() { def.push_str(&format!(" COMMENT '{}'", comment_text)); }
            }
            col_defs.push(def);
        }
        let pks: Vec<&str> = cols.iter().filter(|c| c.6).map(|c| c.0.as_str()).collect();
        if !pks.is_empty() { col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", "))); }
        sql.push_str(&col_defs.join(",\n"));
        sql.push_str("\n);\n\n");

        if is_mysql {
            sql.push_str(&format!("ALTER TABLE {} COMMENT = '{}';\n\n", table_name, display_name));
        } else {
            sql.push_str(&format!("COMMENT ON TABLE {} IS '{}';\n", table_name, display_name));
            for (name, disp_name, _, _, _, _, _, _, _, cmt) in &cols {
                let comment_text = cmt.as_deref().filter(|c| !c.is_empty()).unwrap_or(disp_name.as_str());
                if !comment_text.is_empty() {
                    sql.push_str(&format!("COMMENT ON COLUMN {}.{} IS '{}';\n", table_name, name, comment_text));
                }
            }
            sql.push('\n');
        }

        // 索引
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
            let unique_str = if idx_type == "unique" { "UNIQUE " } else { "" };
            sql.push_str(&format!("CREATE {}INDEX {} ON {} ({});\n", unique_str, idx_name, table_name, resolved_names.join(", ")));
        }
        if !indexes.is_empty() { sql.push('\n'); }

        // 初始数据
        let mut data_stmt = conn.prepare("SELECT data FROM t_init_data WHERE table_id = ?1 ORDER BY id")
            .map_err(|e| format!("Error: {}", e))?;
        let init_data: Vec<String> = data_stmt.query_map(params![table_id], |row| row.get(0))
            .map_err(|e| format!("Error: {}", e))?.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

        if !init_data.is_empty() && !cols.is_empty() {
            let col_names: Vec<&str> = cols.iter().map(|c| c.0.as_str()).collect();
            sql.push_str(&format!("-- {} 初始数据\n", display_name));
            for data_json in &init_data {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                    let values: Vec<String> = col_names.iter().map(|cn| {
                        match data.get(*cn) {
                            Some(serde_json::Value::String(s)) => format!("'{}'", s.replace('\'', "''")),
                            Some(serde_json::Value::Number(n)) => n.to_string(),
                            Some(serde_json::Value::Bool(b)) => if *b { "1".into() } else { "0".into() },
                            Some(serde_json::Value::Null) | None => "NULL".into(),
                            Some(other) => format!("'{}'", other.to_string().replace('\'', "''")),
                        }
                    }).collect();
                    sql.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", table_name, col_names.join(", "), values.join(", ")));
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
