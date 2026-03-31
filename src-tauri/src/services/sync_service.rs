use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::params;

use crate::db::init_db;
use crate::dialect::{get_connector, get_dialect};
use crate::models::{ColumnDiff, IndexDiff, RemoteColumn, RemoteIndex, RemoteTable, TableDiff, TableDef};
use crate::services::database_connection_service::DatabaseConnectionService;
use crate::services::setting_service::SettingsService;
use crate::services::table_service::TableService;

static ID_COUNTER: AtomicU32 = AtomicU32::new(0);

pub struct SyncService {
    database_connection_service: DatabaseConnectionService,
    table_service: TableService,
    settings_service: SettingsService,
}

impl SyncService {
    pub fn new() -> Self {
        Self {
            database_connection_service: DatabaseConnectionService::new(),
            table_service: TableService::new(),
            settings_service: SettingsService::new(),
        }
    }

    pub fn connect_database(&self, connection_id: i32) -> Result<String, String> {
        let connection = self
            .database_connection_service
            .get_database_connection_by_id(connection_id)?
            .ok_or_else(|| "连接配置不存在".to_string())?;

        let connector = get_connector(&connection.r#type);
        connector.test_connection(
            &connection.host,
            connection.port,
            &connection.username,
            &connection.password,
            &connection.database,
        )?;

        Ok("连接成功".to_string())
    }

    pub fn get_remote_tables(&self, connection_id: i32) -> Result<Vec<RemoteTable>, String> {
        let connection = self
            .database_connection_service
            .get_database_connection_by_id(connection_id)?
            .ok_or_else(|| "连接配置不存在".to_string())?;

        let connector = get_connector(&connection.r#type);
        connector.get_remote_tables(
            &connection.host,
            connection.port,
            &connection.username,
            &connection.password,
            &connection.database,
        )
    }

    pub fn compare_tables(
        &self,
        project_id: i32,
        remote_tables_json: String,
    ) -> Result<Vec<TableDiff>, String> {
        let remote_tables: Vec<RemoteTable> = serde_json::from_str(&remote_tables_json)
            .map_err(|e| format!("解析远程表数据失败: {}", e))?;

        let local_tables = self.table_service.get_project_tables(project_id)?;
        let remote_map: HashMap<String, &RemoteTable> =
            remote_tables.iter().map(|t| (t.name.clone(), t)).collect();
        let local_map: HashMap<String, &TableDef> =
            local_tables.iter().map(|t| (t.name.clone(), t)).collect();

        let mut diffs = Vec::new();

        for table in &local_tables {
            if !remote_map.contains_key(&table.name) {
                diffs.push(TableDiff {
                    table_name: table.name.clone(),
                    status: "only_local".to_string(),
                    local_display_name: Some(table.display_name.clone()),
                    column_diffs: Vec::new(),
                    index_diffs: Vec::new(),
                });
            }
        }

        for remote_table in &remote_tables {
            if !local_map.contains_key(&remote_table.name) {
                diffs.push(TableDiff {
                    table_name: remote_table.name.clone(),
                    status: "only_remote".to_string(),
                    local_display_name: None,
                    column_diffs: Vec::new(),
                    index_diffs: Vec::new(),
                });
            }
        }

        for table in &local_tables {
            if let Some(remote_table) = remote_map.get(&table.name) {
                let local_columns = self.table_service.get_table_columns(table.id.clone())?;
                let local_col_map: HashMap<String, &crate::models::ColumnDef> =
                    local_columns.iter().map(|c| (c.name.clone(), c)).collect();
                let remote_col_map: HashMap<String, &RemoteColumn> =
                    remote_table.columns.iter().map(|c| (c.name.clone(), c)).collect();

                let mut col_diffs = Vec::new();

                for (name, local_col) in &local_col_map {
                    if let Some(remote_col) = remote_col_map.get(name) {
                        let local_type_str = self.build_local_column_type(local_col);
                        let remote_type_str = self.build_remote_column_type(remote_col);
                        let type_diff = local_type_str.to_lowercase() != remote_type_str.to_lowercase();
                        let nullable_diff = local_col.nullable != remote_col.nullable;

                        let remote_pk = remote_col.column_key == "PRI";
                        let remote_ai = remote_col.extra.contains("auto_increment");
                        let local_dv = local_col.default_value.as_deref().unwrap_or("");
                        let (remote_dn, remote_dv) =
                            Self::normalize_remote_default(remote_col.default_value.as_deref());
                        let dv_diff = !(local_col.auto_increment || remote_ai) && {
                            let local_has_value = !local_dv.is_empty();
                            let remote_has_value = !remote_dv.is_empty();
                            if !local_has_value && !remote_has_value {
                                if local_col.nullable && remote_col.nullable {
                                    false
                                } else {
                                    local_col.default_null != remote_dn
                                }
                            } else {
                                local_col.default_null != remote_dn || local_dv != remote_dv
                            }
                        };

                        let local_cmt = local_col.comment.as_deref().unwrap_or("");
                        let remote_cmt = remote_col.comment.as_deref().unwrap_or("");
                        let cmt_diff = local_cmt != remote_cmt;
                        let pk_diff = local_col.primary_key != remote_pk;
                        let ai_diff = local_col.auto_increment != remote_ai;

                        if type_diff || nullable_diff || dv_diff || cmt_diff || pk_diff || ai_diff {
                            let mut details = Vec::new();
                            if type_diff {
                                details.push(format!("类型: {} -> {}", local_type_str, remote_type_str));
                            }
                            if nullable_diff {
                                details.push(format!("可空: {} -> {}", local_col.nullable, remote_col.nullable));
                            }
                            if dv_diff {
                                let local_desc = if local_col.default_null {
                                    "NULL".to_string()
                                } else {
                                    local_dv.to_string()
                                };
                                let remote_desc = if remote_dn {
                                    "NULL".to_string()
                                } else {
                                    remote_dv.clone()
                                };
                                details.push(format!("默认值: [{}] -> [{}]", local_desc, remote_desc));
                            }
                            if cmt_diff {
                                details.push(format!("说明: [{}] -> [{}]", local_cmt, remote_cmt));
                            }
                            if pk_diff {
                                details.push(format!("主键: {} -> {}", local_col.primary_key, remote_pk));
                            }
                            if ai_diff {
                                details.push(format!("自增: {} -> {}", local_col.auto_increment, remote_ai));
                            }
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
                            local_type: Some(local_col.data_type.clone()),
                            remote_type: None,
                            detail: None,
                        });
                    }
                }

                for remote_col in &remote_table.columns {
                    if !local_col_map.contains_key(&remote_col.name) {
                        col_diffs.push(ColumnDiff {
                            column_name: remote_col.name.clone(),
                            status: "only_remote".to_string(),
                            local_type: None,
                            remote_type: Some(remote_col.data_type.clone()),
                            detail: None,
                        });
                    }
                }

                let local_indexes = self.table_service.get_table_indexes(table.id.clone())?;
                let local_columns_by_id: HashMap<String, String> = local_columns
                    .iter()
                    .map(|c| (c.id.clone(), c.name.clone()))
                    .collect();
                let mut local_idx_map: HashMap<String, (String, Vec<String>)> = HashMap::new();
                for index in &local_indexes {
                    let column_names = index
                        .fields
                        .iter()
                        .filter_map(|field| local_columns_by_id.get(&field.column_id).cloned())
                        .collect::<Vec<_>>();
                    local_idx_map.insert(index.name.clone(), (index.index_type.clone(), column_names));
                }

                let remote_idx_map: HashMap<String, &RemoteIndex> =
                    remote_table.indexes.iter().map(|i| (i.name.clone(), i)).collect();
                let mut index_diffs = Vec::new();

                for (name, (idx_type, cols)) in &local_idx_map {
                    if let Some(remote_index) = remote_idx_map.get(name) {
                        let local_cols_str = cols.join(", ");
                        let remote_cols_str = remote_index.column_names.join(", ");
                        let type_diff = idx_type.to_lowercase() != remote_index.index_type.to_lowercase();
                        let cols_diff = local_cols_str.to_lowercase() != remote_cols_str.to_lowercase();
                        if type_diff || cols_diff {
                            let mut details = Vec::new();
                            if type_diff {
                                details.push(format!("类型: {} -> {}", idx_type, remote_index.index_type));
                            }
                            if cols_diff {
                                details.push(format!("列: [{}] -> [{}]", local_cols_str, remote_cols_str));
                            }
                            index_diffs.push(IndexDiff {
                                index_name: name.clone(),
                                status: "different".to_string(),
                                local_type: Some(idx_type.clone()),
                                remote_type: Some(remote_index.index_type.clone()),
                                local_columns: Some(local_cols_str),
                                remote_columns: Some(remote_cols_str),
                                detail: Some(details.join("; ")),
                            });
                        } else {
                            index_diffs.push(IndexDiff {
                                index_name: name.clone(),
                                status: "same".to_string(),
                                local_type: Some(idx_type.clone()),
                                remote_type: Some(remote_index.index_type.clone()),
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

                for remote_index in &remote_table.indexes {
                    if !local_idx_map.contains_key(&remote_index.name) {
                        index_diffs.push(IndexDiff {
                            index_name: remote_index.name.clone(),
                            status: "only_remote".to_string(),
                            local_type: None,
                            remote_type: Some(remote_index.index_type.clone()),
                            local_columns: None,
                            remote_columns: Some(remote_index.column_names.join(", ")),
                            detail: None,
                        });
                    }
                }

                let has_col_diff = col_diffs.iter().any(|d| d.status != "same");
                let has_idx_diff = index_diffs.iter().any(|d| d.status != "same");
                diffs.push(TableDiff {
                    table_name: table.name.clone(),
                    status: if has_col_diff || has_idx_diff {
                        "different".to_string()
                    } else {
                        "same".to_string()
                    },
                    local_display_name: Some(table.display_name.clone()),
                    column_diffs: col_diffs,
                    index_diffs,
                });
            }
        }

        Ok(diffs)
    }

    pub fn generate_sync_sql(
        &self,
        project_id: i32,
        remote_tables_json: String,
        database_type: String,
    ) -> Result<String, String> {
        let diffs = self.compare_tables(project_id, remote_tables_json)?;
        let dialect = get_dialect(&database_type);
        let (length_types, scale_types) = self.get_type_length_info()?;

        let local_tables = self.table_service.get_project_tables(project_id)?;
        let table_by_name: HashMap<String, TableDef> =
            local_tables.into_iter().map(|t| (t.name.clone(), t)).collect();

        let mut sql = String::new();
        sql.push_str("-- 同步脚本: 将本地设计同步到远程数据库\n\n");

        for diff in &diffs {
            match diff.status.as_str() {
                "only_local" => {
                    let table = table_by_name
                        .get(&diff.table_name)
                        .ok_or_else(|| format!("未找到本地表: {}", diff.table_name))?;
                    let cols = self.table_service.get_table_columns(table.id.clone())?;

                    sql.push_str(&format!("-- 新建表: {}\n", diff.table_name));
                    sql.push_str(&dialect.create_table_prefix(&diff.table_name));
                    let mut col_defs = Vec::new();
                    for col in &cols {
                        let mapped_type = dialect.map_data_type(&col.data_type);
                        let mut def = format!("  {} {}", col.name, mapped_type.to_uppercase());
                        Self::append_type_suffix(
                            &mut def,
                            &col.data_type,
                            col.length,
                            col.scale,
                            &length_types,
                            &scale_types,
                        );
                        if !col.nullable {
                            def.push_str(dialect.not_null_clause());
                        }
                        if col.auto_increment {
                            def.push_str(dialect.auto_increment_suffix());
                        }
                        if col.default_null {
                            def.push_str(" DEFAULT NULL");
                        } else if let Some(default_value) = &col.default_value {
                            if !default_value.is_empty() {
                                def.push_str(&dialect.default_value_clause(default_value));
                            }
                        }
                        if dialect.supports_inline_comment() {
                            if let Some(comment) = &col.comment {
                                if !comment.is_empty() {
                                    def.push_str(&format!(" COMMENT '{}'", comment.replace('\'', "''")));
                                }
                            }
                        }
                        col_defs.push(def);
                    }
                    let pks: Vec<&str> = cols
                        .iter()
                        .filter(|c| c.primary_key)
                        .map(|c| c.name.as_str())
                        .collect();
                    if !pks.is_empty() {
                        col_defs.push(dialect.primary_key_clause(&pks));
                    }
                    sql.push_str(&col_defs.join(",\n"));
                    sql.push_str("\n);\n\n");
                }
                "only_remote" => {
                    sql.push_str(&format!("-- 远程多余表(可选删除): {}\n", diff.table_name));
                    sql.push_str(&format!("-- DROP TABLE IF EXISTS {};\n\n", diff.table_name));
                }
                "different" => {
                    let table = table_by_name
                        .get(&diff.table_name)
                        .ok_or_else(|| format!("未找到本地表: {}", diff.table_name))?;
                    let columns = self.table_service.get_table_columns(table.id.clone())?;
                    let column_by_name: HashMap<String, crate::models::ColumnDef> =
                        columns.into_iter().map(|c| (c.name.clone(), c)).collect();

                    let mut changes = Vec::new();
                    let mut extra_sql = String::new();
                    for col_diff in &diff.column_diffs {
                        match col_diff.status.as_str() {
                            "only_local" => {
                                let col = column_by_name.get(&col_diff.column_name).ok_or_else(|| {
                                    format!("未找到本地列: {}.{}", diff.table_name, col_diff.column_name)
                                })?;
                                let mut def = format!(
                                    "{} {}",
                                    col_diff.column_name,
                                    dialect.map_data_type(&col.data_type).to_uppercase()
                                );
                                Self::append_type_suffix(
                                    &mut def,
                                    &col.data_type,
                                    col.length,
                                    col.scale,
                                    &length_types,
                                    &scale_types,
                                );
                                if !col.nullable {
                                    def.push_str(dialect.not_null_clause());
                                }
                                if col.auto_increment {
                                    def.push_str(dialect.auto_increment_suffix());
                                }
                                if col.default_null {
                                    def.push_str(" DEFAULT NULL");
                                } else if let Some(default_value) = &col.default_value {
                                    if !default_value.is_empty() {
                                        def.push_str(&dialect.default_value_clause(default_value));
                                    }
                                }
                                if dialect.supports_inline_comment() {
                                    if let Some(comment) = &col.comment {
                                        if !comment.is_empty() {
                                            def.push_str(&format!(" COMMENT '{}'", comment.replace('\'', "''")));
                                        }
                                    }
                                }
                                changes.push(dialect.add_column_clause(&def));
                                if !dialect.supports_inline_comment() {
                                    if let Some(comment) = &col.comment {
                                        if !comment.is_empty() {
                                            extra_sql.push_str(&dialect.column_comment_sql(
                                                &diff.table_name,
                                                &col_diff.column_name,
                                                comment,
                                            ));
                                        }
                                    }
                                }
                            }
                            "only_remote" => {
                                changes.push(format!("  -- DROP COLUMN {} (远程多余列)", col_diff.column_name));
                            }
                            "different" => {
                                let col = column_by_name.get(&col_diff.column_name).ok_or_else(|| {
                                    format!("未找到本地列: {}.{}", diff.table_name, col_diff.column_name)
                                })?;
                                let mapped_type = dialect.map_data_type(&col.data_type);
                                let mut type_str = mapped_type.to_uppercase();
                                Self::append_type_suffix(
                                    &mut type_str,
                                    &col.data_type,
                                    col.length,
                                    col.scale,
                                    &length_types,
                                    &scale_types,
                                );

                                if dialect.uses_alter_column_syntax() {
                                    changes.push(format!(
                                        "  ALTER COLUMN {} TYPE {}",
                                        col_diff.column_name, type_str
                                    ));
                                    if !col.nullable {
                                        changes.push(format!(
                                            "  ALTER COLUMN {} SET NOT NULL",
                                            col_diff.column_name
                                        ));
                                    } else {
                                        changes.push(format!(
                                            "  ALTER COLUMN {} DROP NOT NULL",
                                            col_diff.column_name
                                        ));
                                    }
                                    if col.default_null {
                                        changes.push(format!(
                                            "  ALTER COLUMN {} SET DEFAULT NULL",
                                            col_diff.column_name
                                        ));
                                    } else if let Some(default_value) = &col.default_value {
                                        if !default_value.is_empty() {
                                            changes.push(format!(
                                                "  ALTER COLUMN {} SET{}",
                                                col_diff.column_name,
                                                dialect.default_value_clause(default_value)
                                            ));
                                        } else {
                                            changes.push(format!(
                                                "  ALTER COLUMN {} DROP DEFAULT",
                                                col_diff.column_name
                                            ));
                                        }
                                    } else {
                                        changes.push(format!(
                                            "  ALTER COLUMN {} DROP DEFAULT",
                                            col_diff.column_name
                                        ));
                                    }
                                    if let Some(comment) = &col.comment {
                                        if !comment.is_empty() {
                                            extra_sql.push_str(&dialect.column_comment_sql(
                                                &diff.table_name,
                                                &col_diff.column_name,
                                                comment,
                                            ));
                                        }
                                    }
                                } else {
                                    let mut full_def = type_str;
                                    if !col.nullable {
                                        full_def.push_str(dialect.not_null_clause());
                                    }
                                    if col.auto_increment {
                                        full_def.push_str(dialect.auto_increment_suffix());
                                    }
                                    if col.default_null {
                                        full_def.push_str(" DEFAULT NULL");
                                    } else if let Some(default_value) = &col.default_value {
                                        if !default_value.is_empty() {
                                            full_def.push_str(&dialect.default_value_clause(default_value));
                                        }
                                    }
                                    if dialect.supports_inline_comment() {
                                        if let Some(comment) = &col.comment {
                                            if !comment.is_empty() {
                                                full_def.push_str(&format!(
                                                    " COMMENT '{}'",
                                                    comment.replace('\'', "''")
                                                ));
                                            }
                                        }
                                    }
                                    changes.push(dialect.modify_column_clause(
                                        &col_diff.column_name,
                                        &full_def,
                                    ));
                                    if !dialect.supports_inline_comment() {
                                        if let Some(comment) = &col.comment {
                                            if !comment.is_empty() {
                                                extra_sql.push_str(&dialect.column_comment_sql(
                                                    &diff.table_name,
                                                    &col_diff.column_name,
                                                    comment,
                                                ));
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    if !changes.is_empty() || !extra_sql.is_empty() {
                        sql.push_str(&format!("-- 修改表: {}\n", diff.table_name));
                        if !changes.is_empty() {
                            sql.push_str(&format!(
                                "ALTER TABLE {}\n{};\n",
                                diff.table_name,
                                changes.join(",\n")
                            ));
                        }
                        sql.push_str(&extra_sql);
                        sql.push('\n');
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

    pub fn sync_remote_table_to_local(
        &self,
        project_id: i32,
        remote_table_json: String,
    ) -> Result<String, String> {
        let remote_table: RemoteTable = serde_json::from_str(&remote_table_json)
            .map_err(|e| format!("解析远程表数据失败: {}", e))?;

        let mut conn = init_db().map_err(|e| format!("Error: {}", e))?;
        let table_id = Self::generate_id();
        let display_name = remote_table
            .comment
            .clone()
            .unwrap_or_else(|| remote_table.name.clone());

        let tx = conn
            .transaction()
            .map_err(|e| format!("Error: {}", e))?;

        tx.execute(
            "INSERT INTO t_table (id, project_id, name, display_name, comment, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))",
            params![table_id, project_id, remote_table.name, display_name, remote_table.comment],
        )
        .map_err(|e| format!("创建表失败: {}", e))?;

        let mut col_name_to_id: HashMap<String, String> = HashMap::new();
        for (i, remote_col) in remote_table.columns.iter().enumerate() {
            let col_id = format!("{}_{}", table_id, i);
            let col_display_name = remote_col
                .comment
                .clone()
                .unwrap_or_else(|| remote_col.name.clone());
            let primary_key = remote_col.column_key == "PRI";
            let auto_increment = remote_col.extra.contains("auto_increment");
            let (default_null, default_value_str) =
                Self::normalize_remote_default(remote_col.default_value.as_deref());
            let default_value = Some(default_value_str);

            tx.execute(
                "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, default_null, comment, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    col_id,
                    table_id,
                    remote_col.name,
                    col_display_name,
                    remote_col.data_type,
                    remote_col.length,
                    Option::<i32>::None,
                    remote_col.nullable,
                    primary_key,
                    auto_increment,
                    default_value,
                    default_null,
                    remote_col.comment,
                    i as i32,
                ],
            )
            .map_err(|e| format!("创建列失败: {}", e))?;

            col_name_to_id.insert(remote_col.name.clone(), col_id);
        }

        for (i, remote_index) in remote_table.indexes.iter().enumerate() {
            let idx_id = format!("{}_idx_{}", table_id, i);
            tx.execute(
                "INSERT INTO t_index (id, table_id, name, index_type, comment) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![idx_id, table_id, remote_index.name, remote_index.index_type, Option::<String>::None],
            )
            .map_err(|e| format!("创建索引失败: {}", e))?;

            for (j, col_name) in remote_index.column_names.iter().enumerate() {
                if let Some(col_id) = col_name_to_id.get(col_name) {
                    tx.execute(
                        "INSERT INTO t_index_field (index_id, column_id, sort_order) VALUES (?1, ?2, ?3)",
                        params![idx_id, col_id, (j + 1) as i32],
                    )
                    .map_err(|e| format!("创建索引字段失败: {}", e))?;
                }
            }
        }

        tx.commit().map_err(|e| format!("Error: {}", e))?;

        Ok("同步成功".to_string())
    }

    pub fn sync_remote_columns_to_local(
        &self,
        project_id: i32,
        table_name: String,
        remote_columns_json: String,
        column_names: Vec<String>,
    ) -> Result<String, String> {
        let conn = init_db().map_err(|e| format!("Error: {}", e))?;
        let remote_columns: Vec<RemoteColumn> = serde_json::from_str(&remote_columns_json)
            .map_err(|e| format!("解析远程列数据失败: {}", e))?;

        let table_id: String = conn
            .query_row(
                "SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2",
                params![project_id, table_name],
                |row| row.get(0),
            )
            .map_err(|e| format!("未找到本地表 {}: {}", table_name, e))?;

        let remote_col_map: HashMap<String, &RemoteColumn> =
            remote_columns.iter().map(|c| (c.name.clone(), c)).collect();

        for col_name in &column_names {
            let remote_col = remote_col_map
                .get(col_name)
                .ok_or_else(|| format!("远程列 {} 不存在", col_name))?;

            let col_display_name = remote_col
                .comment
                .clone()
                .unwrap_or_else(|| remote_col.name.clone());
            let primary_key = remote_col.column_key == "PRI";
            let auto_increment = remote_col.extra.contains("auto_increment");
            let existing_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM t_column WHERE table_id = ?1 AND name = ?2",
                    params![table_id, col_name],
                    |row| row.get(0),
                )
                .ok();

            let (default_null_val, default_value_str) =
                Self::normalize_remote_default(remote_col.default_value.as_deref());
            let default_value = Some(default_value_str);

            if let Some(id) = existing_id {
                conn.execute(
                    "UPDATE t_column SET data_type = ?1, length = ?2, nullable = ?3, default_value = ?4, default_null = ?5, display_name = ?6, primary_key = ?7, auto_increment = ?8, comment = ?9 WHERE id = ?10",
                    params![
                        remote_col.data_type,
                        remote_col.length,
                        remote_col.nullable,
                        default_value,
                        default_null_val,
                        col_display_name,
                        primary_key,
                        auto_increment,
                        remote_col.comment,
                        id
                    ],
                )
                .map_err(|e| format!("更新列失败: {}", e))?;
            } else {
                let max_sort: i32 = conn
                    .query_row(
                        "SELECT COALESCE(MAX(sort_order), -1) FROM t_column WHERE table_id = ?1",
                        params![table_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(-1);

                let col_id = Self::generate_id();
                conn.execute(
                    "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, default_null, comment, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                    params![
                        col_id,
                        table_id,
                        remote_col.name,
                        col_display_name,
                        remote_col.data_type,
                        remote_col.length,
                        Option::<i32>::None,
                        remote_col.nullable,
                        primary_key,
                        auto_increment,
                        default_value,
                        default_null_val,
                        remote_col.comment,
                        max_sort + 1,
                    ],
                )
                .map_err(|e| format!("插入列失败: {}", e))?;
            }
        }

        Ok("同步成功".to_string())
    }

    pub fn sync_remote_indexes_to_local(
        &self,
        project_id: i32,
        table_name: String,
        remote_indexes_json: String,
        index_names: Vec<String>,
    ) -> Result<String, String> {
        let mut conn = init_db().map_err(|e| format!("Error: {}", e))?;
        let remote_indexes: Vec<RemoteIndex> = serde_json::from_str(&remote_indexes_json)
            .map_err(|e| format!("解析远程索引数据失败: {}", e))?;

        let table_id: String = conn
            .query_row(
                "SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2",
                params![project_id, table_name],
                |row| row.get(0),
            )
            .map_err(|e| format!("未找到本地表 {}: {}", table_name, e))?;

        let local_columns = self.table_service.get_table_columns(table_id.clone())?;
        let col_name_to_id: HashMap<String, String> = local_columns
            .into_iter()
            .map(|col| (col.name, col.id))
            .collect();
        let remote_idx_map: HashMap<String, &RemoteIndex> =
            remote_indexes.iter().map(|idx| (idx.name.clone(), idx)).collect();

        let tx = conn.transaction().map_err(|e| format!("Error: {}", e))?;

        for idx_name in &index_names {
            let remote_index = remote_idx_map
                .get(idx_name)
                .ok_or_else(|| format!("远程索引 {} 不存在", idx_name))?;

            let existing_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM t_index WHERE table_id = ?1 AND name = ?2",
                    params![table_id, idx_name],
                    |row| row.get(0),
                )
                .ok();

            if let Some(old_id) = existing_id {
                tx.execute("DELETE FROM t_index_field WHERE index_id = ?1", params![old_id])
                    .map_err(|e| format!("Error: {}", e))?;
                tx.execute("DELETE FROM t_index WHERE id = ?1", params![old_id])
                    .map_err(|e| format!("Error: {}", e))?;
            }

            let idx_id = Self::generate_id();
            tx.execute(
                "INSERT INTO t_index (id, table_id, name, index_type, comment) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![idx_id, table_id, remote_index.name, remote_index.index_type, Option::<String>::None],
            )
            .map_err(|e| format!("创建索引失败: {}", e))?;

            for (j, col_name) in remote_index.column_names.iter().enumerate() {
                if let Some(col_id) = col_name_to_id.get(col_name) {
                    tx.execute(
                        "INSERT INTO t_index_field (index_id, column_id, sort_order) VALUES (?1, ?2, ?3)",
                        params![idx_id, col_id, (j + 1) as i32],
                    )
                    .map_err(|e| format!("创建索引字段失败: {}", e))?;
                }
            }
        }

        tx.commit().map_err(|e| format!("Error: {}", e))?;

        Ok("同步成功".to_string())
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

    fn normalize_remote_default(raw: Option<&str>) -> (bool, String) {
        match raw {
            None => (false, String::new()),
            Some(v) => {
                let stripped = if let Some(pos) = v.find("::") {
                    &v[..pos]
                } else {
                    v
                };
                if stripped.eq_ignore_ascii_case("NULL") {
                    return (true, String::new());
                }
                let unquoted = if stripped.starts_with('\'')
                    && stripped.ends_with('\'')
                    && stripped.len() >= 2
                {
                    &stripped[1..stripped.len() - 1]
                } else {
                    stripped
                };
                (false, unquoted.to_string())
            }
        }
    }

    fn build_local_column_type(&self, column: &crate::models::ColumnDef) -> String {
        if let Some(length) = column.length {
            if let Some(scale) = column.scale {
                format!("{}({},{})", column.data_type, length, scale)
            } else {
                format!("{}({})", column.data_type, length)
            }
        } else {
            column.data_type.clone()
        }
    }

    fn build_remote_column_type(&self, column: &RemoteColumn) -> String {
        if let Some(length) = column.length {
            format!("{}({})", column.data_type, length)
        } else {
            column.data_type.clone()
        }
    }

    fn generate_id() -> String {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let seq = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("{}_{}", ts, seq)
    }
}
