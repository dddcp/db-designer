use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::params;

use crate::db::init_db;
use crate::models::*;
use crate::version::{get_type_length_info, append_type_suffix};

// 测试数据库连接
#[tauri::command]
pub fn connect_database(connection_id: i32) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let mut stmt = conn.prepare("SELECT type, host, port, username, password, database FROM t_database_connection WHERE id = ?1")
        .map_err(|e| format!("Error: {}", e))?;
    let (db_type, host, port, username, password, database): (String, String, i32, String, String, String) =
        stmt.query_row(params![connection_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        }).map_err(|e| format!("连接配置不存在: {}", e))?;

    if db_type == "mysql" {
        let url = format!("mysql://{}:{}@{}:{}/{}", username, password, host, port, database);
        let pool = mysql::Pool::new(url.as_str()).map_err(|e| format!("MySQL 连接失败: {}", e))?;
        let _conn = pool.get_conn().map_err(|e| format!("MySQL 连接失败: {}", e))?;
    } else {
        let conn_str = format!("host={} port={} user={} password={} dbname={}", host, port, username, password, database);
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build().map_err(|e| format!("TLS 错误: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut client = postgres::Client::connect(&conn_str, connector)
            .map_err(|e| format!("PostgreSQL 连接失败: {}", e))?;
        client.simple_query("SELECT 1").map_err(|e| format!("PostgreSQL 查询失败: {}", e))?;
    }

    Ok("连接成功".to_string())
}

// 获取远程数据库的表结构
#[tauri::command]
pub fn get_remote_tables(connection_id: i32) -> Result<Vec<RemoteTable>, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let mut stmt = conn.prepare("SELECT type, host, port, username, password, database FROM t_database_connection WHERE id = ?1")
        .map_err(|e| format!("Error: {}", e))?;
    let (db_type, host, port, username, password, database): (String, String, i32, String, String, String) =
        stmt.query_row(params![connection_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        }).map_err(|e| format!("连接配置不存在: {}", e))?;

    if db_type == "mysql" {
        get_mysql_tables(&host, port, &username, &password, &database)
    } else {
        get_pg_tables(&host, port, &username, &password, &database)
    }
}

fn get_mysql_tables(host: &str, port: i32, username: &str, password: &str, database: &str) -> Result<Vec<RemoteTable>, String> {
    let url = format!("mysql://{}:{}@{}:{}/{}", username, password, host, port, database);
    let pool = mysql::Pool::new(url.as_str()).map_err(|e| format!("MySQL 连接失败: {}", e))?;
    let mut conn = pool.get_conn().map_err(|e| format!("MySQL 连接失败: {}", e))?;

    use mysql::prelude::*;

    let tables: Vec<(String, Option<String>)> = conn.query(
        format!("SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{}' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", database)
    ).map_err(|e| format!("查询表失败: {}", e))?;

    let mut result = Vec::new();
    for (table_name, table_comment) in &tables {
        let columns: Vec<(String, String, Option<i64>, String, String, String, Option<String>, Option<String>)> = conn.query(
            format!(
                "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '{}' AND TABLE_NAME = '{}' ORDER BY ORDINAL_POSITION",
                database, table_name
            )
        ).map_err(|e| format!("查询列失败: {}", e))?;

        let remote_cols: Vec<RemoteColumn> = columns.into_iter().map(|(name, data_type, length, nullable, column_key, extra, default_value, comment)| {
            RemoteColumn {
                name,
                data_type,
                length: length.map(|l| l as i32),
                nullable: nullable == "YES",
                column_key,
                extra,
                default_value,
                comment: if comment.as_deref() == Some("") { None } else { comment },
            }
        }).collect();

        // 查询索引（排除 PRIMARY KEY）
        let idx_rows: Vec<(String, i32, String, i64, String)> = conn.query(
            format!(
                "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX, INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '{}' AND TABLE_NAME = '{}' AND INDEX_NAME != 'PRIMARY' ORDER BY INDEX_NAME, SEQ_IN_INDEX",
                database, table_name
            )
        ).map_err(|e| format!("查询索引失败: {}", e))?;

        let mut idx_map: HashMap<String, (bool, String, Vec<String>)> = HashMap::new();
        for (idx_name, non_unique, col_name, _seq, idx_type) in idx_rows {
            let entry = idx_map.entry(idx_name).or_insert_with(|| (non_unique == 0, idx_type, Vec::new()));
            entry.2.push(col_name);
        }

        let remote_indexes: Vec<RemoteIndex> = idx_map.into_iter().map(|(name, (is_unique, idx_type, cols))| {
            let index_type = if is_unique {
                "unique".to_string()
            } else if idx_type == "FULLTEXT" {
                "fulltext".to_string()
            } else {
                "normal".to_string()
            };
            RemoteIndex { name, index_type, column_names: cols }
        }).collect();

        result.push(RemoteTable {
            name: table_name.clone(),
            comment: if table_comment.as_deref() == Some("") { None } else { table_comment.clone() },
            columns: remote_cols,
            indexes: remote_indexes,
        });
    }

    Ok(result)
}

fn get_pg_tables(host: &str, port: i32, username: &str, password: &str, database: &str) -> Result<Vec<RemoteTable>, String> {
    let conn_str = format!("host={} port={} user={} password={} dbname={}", host, port, username, password, database);
    let tls_connector = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build().map_err(|e| format!("TLS 错误: {}", e))?;
    let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
    let mut client = postgres::Client::connect(&conn_str, connector)
        .map_err(|e| format!("PostgreSQL 连接失败: {}", e))?;

    let table_rows = client.query(
        "SELECT c.relname, pg_catalog.obj_description(c.oid) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname",
        &[],
    ).map_err(|e| format!("查询表失败: {}", e))?;

    let mut result = Vec::new();
    for row in &table_rows {
        let table_name: String = row.get(0);
        let table_comment: Option<String> = row.get(1);

        let col_rows = client.query(
            "SELECT c.column_name, c.data_type, c.character_maximum_length::int, c.is_nullable, COALESCE((SELECT 'PRI' FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'), '') as column_key, c.column_default, pg_catalog.col_description((SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name), c.ordinal_position) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = $1 ORDER BY c.ordinal_position",
            &[&table_name],
        ).map_err(|e| format!("查询列失败: {}", e))?;

        let remote_cols: Vec<RemoteColumn> = col_rows.iter().map(|r| {
            let nullable_str: String = r.get(3);
            let length: Option<i32> = r.get(2);
            let default_val: Option<String> = r.get(5);
            let extra = if default_val.as_deref().map(|d| d.starts_with("nextval(")).unwrap_or(false) {
                "auto_increment".to_string()
            } else {
                String::new()
            };
            RemoteColumn {
                name: r.get(0),
                data_type: r.get(1),
                length,
                nullable: nullable_str == "YES",
                column_key: r.get(4),
                extra,
                default_value: default_val,
                comment: r.get(6),
            }
        }).collect();

        // 查询索引（排除主键）
        let idx_rows = client.query(
            "SELECT i.relname as index_name, ix.indisunique, a.attname as column_name, array_position(ix.indkey, a.attnum) as col_pos FROM pg_class t JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = $1 AND NOT ix.indisprimary ORDER BY i.relname, col_pos",
            &[&table_name],
        ).map_err(|e| format!("查询索引失败: {}", e))?;

        let mut idx_map: HashMap<String, (bool, Vec<String>)> = HashMap::new();
        for r in &idx_rows {
            let idx_name: String = r.get(0);
            let is_unique: bool = r.get(1);
            let col_name: String = r.get(2);
            let entry = idx_map.entry(idx_name).or_insert_with(|| (is_unique, Vec::new()));
            entry.1.push(col_name);
        }

        let remote_indexes: Vec<RemoteIndex> = idx_map.into_iter().map(|(name, (is_unique, cols))| {
            let index_type = if is_unique { "unique".to_string() } else { "normal".to_string() };
            RemoteIndex { name, index_type, column_names: cols }
        }).collect();

        result.push(RemoteTable {
            name: table_name,
            comment: table_comment,
            columns: remote_cols,
            indexes: remote_indexes,
        });
    }

    Ok(result)
}

// 比较本地表结构和远程表结构
#[tauri::command]
pub fn compare_tables(project_id: i32, remote_tables_json: String) -> Result<Vec<TableDiff>, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let remote_tables: Vec<RemoteTable> = serde_json::from_str(&remote_tables_json)
        .map_err(|e| format!("解析远程表数据失败: {}", e))?;

    let mut stmt = conn.prepare("SELECT id, name, display_name FROM t_table WHERE project_id = ?1")
        .map_err(|e| format!("Error: {}", e))?;
    let local_tables: Vec<(String, String, String)> = stmt.query_map(params![project_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| format!("Error: {}", e))?
      .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    let remote_map: HashMap<String, &RemoteTable> = remote_tables.iter().map(|t| (t.name.clone(), t)).collect();
    let local_map: HashMap<String, (String, String)> = local_tables.iter().map(|t| (t.1.clone(), (t.0.clone(), t.2.clone()))).collect();

    let mut diffs = Vec::new();

    // 本地有、远程没有
    for (_table_id, table_name, display_name) in &local_tables {
        if !remote_map.contains_key(table_name) {
            diffs.push(TableDiff {
                table_name: table_name.clone(),
                status: "only_local".to_string(),
                local_display_name: Some(display_name.clone()),
                column_diffs: Vec::new(),
                index_diffs: Vec::new(),
            });
        }
    }

    // 远程有、本地没有
    for rt in &remote_tables {
        if !local_map.contains_key(&rt.name) {
            diffs.push(TableDiff {
                table_name: rt.name.clone(),
                status: "only_remote".to_string(),
                local_display_name: None,
                column_diffs: Vec::new(),
                index_diffs: Vec::new(),
            });
        }
    }

    // 都有的，比较列
    for (table_id, table_name, display_name) in &local_tables {
        if let Some(remote_table) = remote_map.get(table_name) {
            let mut col_stmt = conn.prepare("SELECT name, data_type, length, nullable FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
                .map_err(|e| format!("Error: {}", e))?;
            let local_cols: Vec<(String, String, Option<i32>, bool)> = col_stmt.query_map(params![table_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            }).map_err(|e| format!("Error: {}", e))?
              .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

            let local_col_map: HashMap<String, (String, Option<i32>, bool)> = local_cols.iter().map(|c| (c.0.clone(), (c.1.clone(), c.2, c.3))).collect();
            let remote_col_map: HashMap<String, &RemoteColumn> = remote_table.columns.iter().map(|c| (c.name.clone(), c)).collect();

            let mut col_diffs = Vec::new();

            for (name, (dt, len, nullable)) in &local_col_map {
                if let Some(rc) = remote_col_map.get(name) {
                    let local_type_str = if let Some(l) = len {
                        format!("{}({})", dt, l)
                    } else {
                        dt.clone()
                    };
                    let remote_type_str = if let Some(l) = rc.length {
                        format!("{}({})", rc.data_type, l)
                    } else {
                        rc.data_type.clone()
                    };
                    let type_diff = local_type_str.to_lowercase() != remote_type_str.to_lowercase();
                    let nullable_diff = *nullable != rc.nullable;
                    if type_diff || nullable_diff {
                        let mut details = Vec::new();
                        if type_diff { details.push(format!("类型: {} -> {}", local_type_str, remote_type_str)); }
                        if nullable_diff { details.push(format!("可空: {} -> {}", nullable, rc.nullable)); }
                        col_diffs.push(ColumnDiff {
                            column_name: name.clone(),
                            status: "different".to_string(),
                            local_type: Some(local_type_str),
                            remote_type: Some(remote_type_str),
                            detail: Some(details.join("; ")),
                        });
                    } else {
                        col_diffs.push(ColumnDiff {
                            column_name: name.clone(),
                            status: "same".to_string(),
                            local_type: Some(local_type_str),
                            remote_type: Some(remote_type_str),
                            detail: None,
                        });
                    }
                } else {
                    col_diffs.push(ColumnDiff {
                        column_name: name.clone(),
                        status: "only_local".to_string(),
                        local_type: Some(dt.clone()),
                        remote_type: None,
                        detail: None,
                    });
                }
            }

            for rc in &remote_table.columns {
                if !local_col_map.contains_key(&rc.name) {
                    col_diffs.push(ColumnDiff {
                        column_name: rc.name.clone(),
                        status: "only_remote".to_string(),
                        local_type: None,
                        remote_type: Some(rc.data_type.clone()),
                        detail: None,
                    });
                }
            }

            // --- 索引比较 ---
            // 获取本地索引（join t_index + t_index_field + t_column 得到 column names）
            let mut idx_stmt = conn.prepare(
                "SELECT i.name, i.index_type, c.name FROM t_index i JOIN t_index_field f ON f.index_id = i.id JOIN t_column c ON c.id = f.column_id WHERE i.table_id = ?1 ORDER BY i.name, f.sort_order"
            ).map_err(|e| format!("Error: {}", e))?;
            let idx_rows: Vec<(String, String, String)> = idx_stmt.query_map(params![table_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            }).map_err(|e| format!("Error: {}", e))?
              .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

            // 按索引名分组: name -> (index_type, Vec<column_name>)
            let mut local_idx_map: HashMap<String, (String, Vec<String>)> = HashMap::new();
            for (idx_name, idx_type, col_name) in &idx_rows {
                let entry = local_idx_map.entry(idx_name.clone()).or_insert_with(|| (idx_type.clone(), Vec::new()));
                entry.1.push(col_name.clone());
            }

            let remote_idx_map: HashMap<String, &RemoteIndex> = remote_table.indexes.iter().map(|i| (i.name.clone(), i)).collect();

            let mut index_diffs = Vec::new();

            // 本地有、远程没有
            for (name, (idx_type, cols)) in &local_idx_map {
                if let Some(ri) = remote_idx_map.get(name) {
                    // 都有 → 比较类型和列
                    let local_cols_str = cols.join(", ");
                    let remote_cols_str = ri.column_names.join(", ");
                    let type_diff = idx_type.to_lowercase() != ri.index_type.to_lowercase();
                    let cols_diff = local_cols_str.to_lowercase() != remote_cols_str.to_lowercase();
                    if type_diff || cols_diff {
                        let mut details = Vec::new();
                        if type_diff { details.push(format!("类型: {} -> {}", idx_type, ri.index_type)); }
                        if cols_diff { details.push(format!("列: [{}] -> [{}]", local_cols_str, remote_cols_str)); }
                        index_diffs.push(IndexDiff {
                            index_name: name.clone(),
                            status: "different".to_string(),
                            local_type: Some(idx_type.clone()),
                            remote_type: Some(ri.index_type.clone()),
                            local_columns: Some(local_cols_str),
                            remote_columns: Some(remote_cols_str),
                            detail: Some(details.join("; ")),
                        });
                    } else {
                        index_diffs.push(IndexDiff {
                            index_name: name.clone(),
                            status: "same".to_string(),
                            local_type: Some(idx_type.clone()),
                            remote_type: Some(ri.index_type.clone()),
                            local_columns: Some(local_cols_str),
                            remote_columns: Some(remote_cols_str),
                            detail: None,
                        });
                    }
                } else {
                    index_diffs.push(IndexDiff {
                        index_name: name.clone(),
                        status: "only_local".to_string(),
                        local_type: Some(idx_type.clone()),
                        remote_type: None,
                        local_columns: Some(cols.join(", ")),
                        remote_columns: None,
                        detail: None,
                    });
                }
            }

            // 远程有、本地没有
            for ri in &remote_table.indexes {
                if !local_idx_map.contains_key(&ri.name) {
                    index_diffs.push(IndexDiff {
                        index_name: ri.name.clone(),
                        status: "only_remote".to_string(),
                        local_type: None,
                        remote_type: Some(ri.index_type.clone()),
                        local_columns: None,
                        remote_columns: Some(ri.column_names.join(", ")),
                        detail: None,
                    });
                }
            }

            let has_col_diff = col_diffs.iter().any(|d| d.status != "same");
            let has_idx_diff = index_diffs.iter().any(|d| d.status != "same");
            diffs.push(TableDiff {
                table_name: table_name.clone(),
                status: if has_col_diff || has_idx_diff { "different".to_string() } else { "same".to_string() },
                local_display_name: Some(display_name.clone()),
                column_diffs: col_diffs,
                index_diffs,
            });
        }
    }

    Ok(diffs)
}

// 生成同步 SQL（将本地结构同步到远程数据库）
#[tauri::command]
pub fn generate_sync_sql(project_id: i32, remote_tables_json: String, database_type: String) -> Result<String, String> {
    let diffs = compare_tables(project_id, remote_tables_json)?;
    let is_mysql = database_type == "mysql";
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let (length_types, scale_types) = get_type_length_info(&conn);

    let mut sql = String::new();
    sql.push_str("-- 同步脚本: 将本地设计同步到远程数据库\n\n");

    for diff in &diffs {
        match diff.status.as_str() {
            "only_local" => {
                let mut table_stmt = conn.prepare("SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2")
                    .map_err(|e| format!("Error: {}", e))?;
                let table_id: String = table_stmt.query_row(params![project_id, diff.table_name], |row| row.get(0))
                    .map_err(|e| format!("Error: {}", e))?;

                let mut col_stmt = conn.prepare("SELECT name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, comment FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
                    .map_err(|e| format!("Error: {}", e))?;
                let cols: Vec<(String, String, Option<i32>, Option<i32>, bool, bool, bool, Option<String>, Option<String>)> = col_stmt.query_map(params![table_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?))
                }).map_err(|e| format!("Error: {}", e))?
                  .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

                sql.push_str(&format!("-- 新建表: {} ({})\n", diff.table_name, diff.local_display_name.as_deref().unwrap_or("")));
                sql.push_str(&format!("CREATE TABLE {} (\n", diff.table_name));
                let mut col_defs = Vec::new();
                for (name, dt, len, scale, nullable, _pk, ai, dv, cmt) in &cols {
                    let mut def = format!("  {} {}", name, dt.to_uppercase());
                    append_type_suffix(&mut def, dt, *len, *scale, &length_types, &scale_types);
                    if !nullable { def.push_str(" NOT NULL"); }
                    if *ai {
                        if is_mysql { def.push_str(" AUTO_INCREMENT"); }
                    }
                    if let Some(d) = dv { if !d.is_empty() { def.push_str(&format!(" DEFAULT '{}'", d)); } }
                    if is_mysql { if let Some(c) = cmt { if !c.is_empty() { def.push_str(&format!(" COMMENT '{}'", c)); } } }
                    col_defs.push(def);
                }
                let pks: Vec<&str> = cols.iter().filter(|c| c.5).map(|c| c.0.as_str()).collect();
                if !pks.is_empty() { col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", "))); }
                sql.push_str(&col_defs.join(",\n"));
                sql.push_str("\n);\n\n");
            }
            "only_remote" => {
                sql.push_str(&format!("-- 远程多余表(可选删除): {}\n", diff.table_name));
                sql.push_str(&format!("-- DROP TABLE IF EXISTS {};\n\n", diff.table_name));
            }
            "different" => {
                let mut changes = Vec::new();
                for cd in &diff.column_diffs {
                    match cd.status.as_str() {
                        "only_local" => {
                            let mut table_stmt = conn.prepare("SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2")
                                .map_err(|e| format!("Error: {}", e))?;
                            let table_id: String = table_stmt.query_row(params![project_id, diff.table_name], |row| row.get(0))
                                .map_err(|e| format!("Error: {}", e))?;
                            let mut c_stmt = conn.prepare("SELECT data_type, length, scale, nullable, default_value FROM t_column WHERE table_id = ?1 AND name = ?2")
                                .map_err(|e| format!("Error: {}", e))?;
                            let col_info: (String, Option<i32>, Option<i32>, bool, Option<String>) = c_stmt.query_row(params![table_id, cd.column_name], |row| {
                                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
                            }).map_err(|e| format!("Error: {}", e))?;
                            let mut def = format!("{} {}", cd.column_name, col_info.0.to_uppercase());
                            append_type_suffix(&mut def, &col_info.0, col_info.1, col_info.2, &length_types, &scale_types);
                            if !col_info.3 { def.push_str(" NOT NULL"); }
                            if let Some(d) = &col_info.4 { if !d.is_empty() { def.push_str(&format!(" DEFAULT '{}'", d)); } }
                            changes.push(format!("  ADD COLUMN {}", def));
                        }
                        "only_remote" => {
                            changes.push(format!("  -- DROP COLUMN {} (远程多余列)", cd.column_name));
                        }
                        "different" => {
                            if let Some(lt) = &cd.local_type {
                                if is_mysql {
                                    changes.push(format!("  MODIFY COLUMN {} {}", cd.column_name, lt.to_uppercase()));
                                } else {
                                    changes.push(format!("  ALTER COLUMN {} TYPE {}", cd.column_name, lt.to_uppercase()));
                                }
                            }
                        }
                        _ => {}
                    }
                }
                if !changes.is_empty() {
                    sql.push_str(&format!("-- 修改表: {}\n", diff.table_name));
                    sql.push_str(&format!("ALTER TABLE {}\n{};\n\n", diff.table_name, changes.join(",\n")));
                }
            }
            _ => {}
        }
    }

    if sql.trim() == "-- 同步脚本: 将本地设计同步到远程数据库" {
        sql.push_str("-- 本地设计与远程数据库结构一致，无需同步\n");
    }

    Ok(sql)
}

use std::sync::atomic::{AtomicU32, Ordering};

static ID_COUNTER: AtomicU32 = AtomicU32::new(0);

fn generate_id() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}_{}", ts, seq)
}

// 将远程整张表同步到本地模型
#[tauri::command]
pub fn sync_remote_table_to_local(project_id: i32, remote_table_json: String) -> Result<String, String> {
    let remote_table: RemoteTable = serde_json::from_str(&remote_table_json)
        .map_err(|e| format!("解析远程表数据失败: {}", e))?;

    let mut conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let table_id = generate_id();

    let display_name = remote_table.comment.clone().unwrap_or_else(|| remote_table.name.clone());

    let tx = conn.transaction().map_err(|e| format!("Error: {}", e))?;

    tx.execute(
        "INSERT INTO t_table (id, project_id, name, display_name, comment, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))",
        params![table_id, project_id, remote_table.name, display_name, remote_table.comment],
    ).map_err(|e| format!("创建表失败: {}", e))?;

    // 建立 column_name -> column_id 映射，后面创建索引需要
    let mut col_name_to_id: HashMap<String, String> = HashMap::new();
    for (i, rc) in remote_table.columns.iter().enumerate() {
        let col_id = format!("{}_{}", table_id, i);
        let col_display_name = rc.comment.clone().unwrap_or_else(|| rc.name.clone());
        let primary_key = rc.column_key == "PRI";
        let auto_increment = rc.extra.contains("auto_increment");

        tx.execute(
            "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, comment, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                col_id, table_id, rc.name, col_display_name, rc.data_type,
                rc.length, Option::<i32>::None, rc.nullable, primary_key, auto_increment,
                rc.default_value, rc.comment, i as i32
            ],
        ).map_err(|e| format!("创建列失败: {}", e))?;

        col_name_to_id.insert(rc.name.clone(), col_id);
    }

    // 创建索引
    for (i, ri) in remote_table.indexes.iter().enumerate() {
        let idx_id = format!("{}_idx_{}", table_id, i);
        tx.execute(
            "INSERT INTO t_index (id, table_id, name, index_type, comment) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![idx_id, table_id, ri.name, ri.index_type, Option::<String>::None],
        ).map_err(|e| format!("创建索引失败: {}", e))?;

        for (j, col_name) in ri.column_names.iter().enumerate() {
            if let Some(col_id) = col_name_to_id.get(col_name) {
                tx.execute(
                    "INSERT INTO t_index_field (index_id, column_id, sort_order) VALUES (?1, ?2, ?3)",
                    params![idx_id, col_id, (j + 1) as i32],
                ).map_err(|e| format!("创建索引字段失败: {}", e))?;
            }
        }
    }

    tx.commit().map_err(|e| format!("Error: {}", e))?;

    Ok("同步成功".to_string())
}

// 将远程字段同步到本地模型（处理有差异和仅远程的字段）
#[tauri::command]
pub fn sync_remote_columns_to_local(project_id: i32, table_name: String, remote_columns_json: String, column_names: Vec<String>) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let remote_columns: Vec<RemoteColumn> = serde_json::from_str(&remote_columns_json)
        .map_err(|e| format!("解析远程列数据失败: {}", e))?;

    // 查找本地表 ID
    let table_id: String = conn.query_row(
        "SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2",
        params![project_id, table_name],
        |row| row.get(0),
    ).map_err(|e| format!("未找到本地表 {}: {}", table_name, e))?;

    let remote_col_map: HashMap<String, &RemoteColumn> = remote_columns.iter()
        .map(|c| (c.name.clone(), c))
        .collect();

    for col_name in &column_names {
        let rc = remote_col_map.get(col_name)
            .ok_or_else(|| format!("远程列 {} 不存在", col_name))?;

        let col_display_name = rc.comment.clone().unwrap_or_else(|| rc.name.clone());
        let primary_key = rc.column_key == "PRI";
        let auto_increment = rc.extra.contains("auto_increment");

        // 检查本地是否已有同名字段
        let existing_id: Option<String> = conn.query_row(
            "SELECT id FROM t_column WHERE table_id = ?1 AND name = ?2",
            params![table_id, col_name],
            |row| row.get(0),
        ).ok();

        if let Some(id) = existing_id {
            // UPDATE 已有字段
            conn.execute(
                "UPDATE t_column SET data_type = ?1, length = ?2, nullable = ?3, default_value = ?4, display_name = ?5, primary_key = ?6, auto_increment = ?7, comment = ?8 WHERE id = ?9",
                params![rc.data_type, rc.length, rc.nullable, rc.default_value, col_display_name, primary_key, auto_increment, rc.comment, id],
            ).map_err(|e| format!("更新列失败: {}", e))?;
        } else {
            // INSERT 新字段
            let max_sort: i32 = conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM t_column WHERE table_id = ?1",
                params![table_id],
                |row| row.get(0),
            ).unwrap_or(-1);

            let col_id = generate_id();
            conn.execute(
                "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, comment, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    col_id, table_id, rc.name, col_display_name, rc.data_type,
                    rc.length, Option::<i32>::None, rc.nullable, primary_key, auto_increment,
                    rc.default_value, rc.comment, max_sort + 1
                ],
            ).map_err(|e| format!("插入列失败: {}", e))?;
        }
    }

    Ok("同步成功".to_string())
}

// 将远程索引同步到本地模型
#[tauri::command]
pub fn sync_remote_indexes_to_local(project_id: i32, table_name: String, remote_indexes_json: String, index_names: Vec<String>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let remote_indexes: Vec<RemoteIndex> = serde_json::from_str(&remote_indexes_json)
        .map_err(|e| format!("解析远程索引数据失败: {}", e))?;

    // 查找本地表 ID
    let table_id: String = conn.query_row(
        "SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2",
        params![project_id, table_name],
        |row| row.get(0),
    ).map_err(|e| format!("未找到本地表 {}: {}", table_name, e))?;

    // 建立本地 column_name -> column_id 映射
    let mut col_stmt = conn.prepare("SELECT id, name FROM t_column WHERE table_id = ?1")
        .map_err(|e| format!("Error: {}", e))?;
    let col_rows: Vec<(String, String)> = col_stmt.query_map(params![table_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).map_err(|e| format!("Error: {}", e))?
      .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;
    drop(col_stmt);
    let col_name_to_id: HashMap<String, String> = col_rows.into_iter().map(|(id, name)| (name, id)).collect();

    let remote_idx_map: HashMap<String, &RemoteIndex> = remote_indexes.iter()
        .map(|i| (i.name.clone(), i))
        .collect();

    let tx = conn.transaction().map_err(|e| format!("Error: {}", e))?;

    for idx_name in &index_names {
        let ri = remote_idx_map.get(idx_name)
            .ok_or_else(|| format!("远程索引 {} 不存在", idx_name))?;

        // 检查本地是否已有同名索引
        let existing_id: Option<String> = tx.query_row(
            "SELECT id FROM t_index WHERE table_id = ?1 AND name = ?2",
            params![table_id, idx_name],
            |row| row.get(0),
        ).ok();

        if let Some(old_id) = existing_id {
            tx.execute("DELETE FROM t_index_field WHERE index_id = ?1", params![old_id])
                .map_err(|e| format!("Error: {}", e))?;
            tx.execute("DELETE FROM t_index WHERE id = ?1", params![old_id])
                .map_err(|e| format!("Error: {}", e))?;
        }

        let idx_id = generate_id();
        tx.execute(
            "INSERT INTO t_index (id, table_id, name, index_type, comment) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![idx_id, table_id, ri.name, ri.index_type, Option::<String>::None],
        ).map_err(|e| format!("创建索引失败: {}", e))?;

        for (j, col_name) in ri.column_names.iter().enumerate() {
            if let Some(col_id) = col_name_to_id.get(col_name) {
                tx.execute(
                    "INSERT INTO t_index_field (index_id, column_id, sort_order) VALUES (?1, ?2, ?3)",
                    params![idx_id, col_id, (j + 1) as i32],
                ).map_err(|e| format!("创建索引字段失败: {}", e))?;
            }
        }
    }

    tx.commit().map_err(|e| format!("Error: {}", e))?;

    Ok("同步成功".to_string())
}
