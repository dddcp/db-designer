use std::collections::HashMap;
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

        result.push(RemoteTable {
            name: table_name.clone(),
            comment: if table_comment.as_deref() == Some("") { None } else { table_comment.clone() },
            columns: remote_cols,
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

        result.push(RemoteTable {
            name: table_name,
            comment: table_comment,
            columns: remote_cols,
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

            let has_diff = col_diffs.iter().any(|d| d.status != "same");
            diffs.push(TableDiff {
                table_name: table_name.clone(),
                status: if has_diff { "different".to_string() } else { "same".to_string() },
                local_display_name: Some(display_name.clone()),
                column_diffs: col_diffs,
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
