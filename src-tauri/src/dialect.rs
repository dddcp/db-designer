use serde::Serialize;
use std::collections::HashMap;

use crate::models::*;

// ─── Trait 1: SQL generation dialect ────────────────────────────────────────

pub trait DatabaseDialect {
    // === Identity ===
    fn name(&self) -> &str;
    fn display_name(&self) -> &str;

    // === Must implement (differ between databases) ===
    fn auto_increment_suffix(&self) -> &str;
    fn supports_inline_comment(&self) -> bool;
    fn table_comment_sql(&self, table: &str, comment: &str) -> String;
    fn column_comment_sql(&self, table: &str, col: &str, comment: &str) -> String;
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String;
    fn drop_index_sql(&self, idx_name: &str, table: &str) -> String;
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String;
    fn bool_literal(&self, value: bool) -> &str;

    // === Default implementations (currently same across databases) ===
    fn create_table_prefix(&self, table: &str) -> String {
        format!("CREATE TABLE {} (\n", table)
    }
    fn drop_table_sql(&self, table: &str) -> String {
        format!("DROP TABLE IF EXISTS {};\n", table)
    }
    fn primary_key_clause(&self, columns: &[&str]) -> String {
        format!("  PRIMARY KEY ({})", columns.join(", "))
    }
    fn add_column_clause(&self, col_def: &str) -> String {
        format!("  ADD COLUMN {}", col_def)
    }
    fn drop_column_clause(&self, col: &str) -> String {
        format!("  DROP COLUMN {}", col)
    }
    fn default_value_clause(&self, value: &str) -> String {
        let v = value.trim();
        if v.eq_ignore_ascii_case("NULL") {
            " DEFAULT NULL".to_string()
        } else if v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2 {
            // Already a SQL literal like '1' — use as-is
            format!(" DEFAULT {}", v)
        } else {
            format!(" DEFAULT '{}'", v.replace('\'', "''"))
        }
    }
    fn not_null_clause(&self) -> &str {
        " NOT NULL"
    }
    fn create_index_sql(
        &self,
        idx_name: &str,
        table: &str,
        columns: &[&str],
        idx_type: &str,
    ) -> String {
        let unique_str = if idx_type == "unique" { "UNIQUE " } else { "" };
        format!(
            "CREATE {}INDEX {} ON {} ({});\n",
            unique_str,
            idx_name,
            table,
            columns.join(", ")
        )
    }
    fn insert_sql(&self, table: &str, columns: &[&str], values: &[String]) -> String {
        format!(
            "INSERT INTO {} ({}) VALUES ({});\n",
            table,
            columns.join(", "),
            values.join(", ")
        )
    }
    fn delete_sql(&self, table: &str, conditions: &[String]) -> String {
        format!(
            "DELETE FROM {} WHERE {};\n",
            table,
            conditions.join(" AND ")
        )
    }
    fn string_literal(&self, value: &str) -> String {
        format!("'{}'", value.replace('\'', "''"))
    }
    fn null_literal(&self) -> &str {
        "NULL"
    }
    fn map_data_type(&self, dt: &str) -> String {
        dt.to_string()
    }
    fn type_mappings(&self) -> HashMap<String, String> {
        HashMap::new()
    }
    /// PostgreSQL 使用 ALTER COLUMN ... TYPE 语法修改列，
    /// MySQL / Oracle 使用 MODIFY (COLUMN) col full_def 语法。
    fn uses_alter_column_syntax(&self) -> bool {
        false
    }
}

// ─── Trait 2: Database connection & remote table fetching ───────────────────

pub trait DatabaseConnector {
    fn test_connection(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<(), String>;
    fn get_remote_tables(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteTable>, String>;
    fn get_remote_routines(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteRoutine>, String>;
}

// ─── MySQL implementation ───────────────────────────────────────────────────

pub struct MysqlDialect;

impl DatabaseDialect for MysqlDialect {
    fn name(&self) -> &str {
        "mysql"
    }
    fn display_name(&self) -> &str {
        "MySQL"
    }

    fn auto_increment_suffix(&self) -> &str {
        " AUTO_INCREMENT"
    }
    fn supports_inline_comment(&self) -> bool {
        true
    }

    fn table_comment_sql(&self, table: &str, comment: &str) -> String {
        format!(
            "ALTER TABLE {} COMMENT = '{}';\n",
            table,
            comment.replace('\'', "''")
        )
    }
    fn column_comment_sql(&self, _table: &str, _col: &str, _comment: &str) -> String {
        String::new() // MySQL uses inline COMMENT in column definition
    }
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String {
        format!("  MODIFY COLUMN {} {}", col, full_type)
    }
    fn drop_index_sql(&self, idx_name: &str, table: &str) -> String {
        format!("DROP INDEX {} ON {};\n", idx_name, table)
    }
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String {
        match routine_type {
            "function" => format!("DROP FUNCTION IF EXISTS {};\n", name),
            "procedure" => format!("DROP PROCEDURE IF EXISTS {};\n", name),
            "trigger" => format!("DROP TRIGGER IF EXISTS {};\n", name),
            _ => format!("DROP {} IF EXISTS {};\n", routine_type, name),
        }
    }
    fn bool_literal(&self, value: bool) -> &str {
        if value {
            "1"
        } else {
            "0"
        }
    }
}

impl DatabaseConnector for MysqlDialect {
    fn test_connection(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<(), String> {
        let opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(host))
            .tcp_port(port as u16)
            .user(Some(user))
            .pass(Some(pass))
            .db_name(Some(db));
        let pool = mysql::Pool::new(opts).map_err(|e| format!("mysql_connection_failed: {}", e))?;
        let _conn = pool
            .get_conn()
            .map_err(|e| format!("mysql_connection_failed: {}", e))?;
        Ok(())
    }

    fn get_remote_tables(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteTable>, String> {
        let opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(host))
            .tcp_port(port as u16)
            .user(Some(user))
            .pass(Some(pass))
            .db_name(Some(db));
        let pool = mysql::Pool::new(opts).map_err(|e| format!("mysql_connection_failed: {}", e))?;
        let mut conn = pool
            .get_conn()
            .map_err(|e| format!("mysql_connection_failed: {}", e))?;

        use mysql::prelude::*;

        let tables: Vec<(String, Option<String>)> = conn.query(
            format!("SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{}' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", db)
        ).map_err(|e| format!("query_tables_failed: {}", e))?;

        let mut result = Vec::new();
        for (table_name, table_comment) in &tables {
            let columns: Vec<(String, String, Option<i64>, String, String, String, Option<String>, Option<String>)> = conn.query(
                format!(
                    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '{}' AND TABLE_NAME = '{}' ORDER BY ORDINAL_POSITION",
                    db, table_name
                )
            ).map_err(|e| format!("query_columns_failed: {}", e))?;

            let remote_cols: Vec<RemoteColumn> = columns
                .into_iter()
                .map(
                    |(
                        name,
                        data_type,
                        length,
                        nullable,
                        column_key,
                        extra,
                        default_value,
                        comment,
                    )| {
                        // TEXT/BLOB 等类型的 CHARACTER_MAXIMUM_LENGTH 是隐式最大值，不应作为长度显示
                        let no_length_types = [
                            "tinytext", "text", "mediumtext", "longtext",
                            "tinyblob", "blob", "mediumblob", "longblob",
                        ];
                        let filtered_length = if no_length_types.contains(&data_type.to_lowercase().as_str()) {
                            None
                        } else {
                            length.map(|l| l as i32)
                        };
                        RemoteColumn {
                            name,
                            data_type,
                            length: filtered_length,
                            nullable: nullable == "YES",
                            column_key,
                            extra,
                            default_value,
                            comment: if comment.as_deref() == Some("") {
                                None
                            } else {
                                comment
                            },
                        }
                    },
                )
                .collect();

            let idx_rows: Vec<(String, i32, String, i64, String)> = conn.query(
                format!(
                    "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX, INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = '{}' AND TABLE_NAME = '{}' AND INDEX_NAME != 'PRIMARY' ORDER BY INDEX_NAME, SEQ_IN_INDEX",
                    db, table_name
                )
            ).map_err(|e| format!("query_indexes_failed: {}", e))?;

            let mut idx_map: HashMap<String, (bool, String, Vec<String>)> = HashMap::new();
            for (idx_name, non_unique, col_name, _seq, idx_type) in idx_rows {
                let entry = idx_map
                    .entry(idx_name)
                    .or_insert_with(|| (non_unique == 0, idx_type, Vec::new()));
                entry.2.push(col_name);
            }

            let remote_indexes: Vec<RemoteIndex> = idx_map
                .into_iter()
                .map(|(name, (is_unique, idx_type, cols))| {
                    let index_type = if is_unique {
                        "unique".to_string()
                    } else if idx_type == "FULLTEXT" {
                        "fulltext".to_string()
                    } else {
                        "normal".to_string()
                    };
                    RemoteIndex {
                        name,
                        index_type,
                        column_names: cols,
                    }
                })
                .collect();

            result.push(RemoteTable {
                name: table_name.clone(),
                comment: if table_comment.as_deref() == Some("") {
                    None
                } else {
                    table_comment.clone()
                },
                columns: remote_cols,
                indexes: remote_indexes,
            });
        }

        Ok(result)
    }

    fn get_remote_routines(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteRoutine>, String> {
        let opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(host))
            .tcp_port(port as u16)
            .user(Some(user))
            .pass(Some(pass))
            .db_name(Some(db));
        let pool = mysql::Pool::new(opts).map_err(|e| format!("mysql_connection_failed: {}", e))?;
        let mut conn = pool
            .get_conn()
            .map_err(|e| format!("mysql_connection_failed: {}", e))?;

        use mysql::prelude::*;

        let mut routines = Vec::new();

        // 获取函数和存储过程
        let routine_rows: Vec<(String, String)> = conn.query(
            format!(
                "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = '{}' ORDER BY ROUTINE_TYPE, ROUTINE_NAME",
                db
            )
        ).map_err(|e| format!("query_routines_failed: {}", e))?;

        for (name, routine_type) in &routine_rows {
            let rtype = if routine_type == "FUNCTION" {
                "function"
            } else {
                "procedure"
            };
            let show_sql = if rtype == "function" {
                format!("SHOW CREATE FUNCTION `{}`", name)
            } else {
                format!("SHOW CREATE PROCEDURE `{}`", name)
            };
            // SHOW CREATE FUNCTION 返回的列: Function, sql_mode, Create Function, ...
            // SHOW CREATE PROCEDURE 返回的列: Procedure, sql_mode, Create Procedure, ...
            let body: Option<String> = conn
                .query_first(show_sql)
                .map_err(|e| format!("get_{}_definition_failed: {}", name, e))?
                .map(|row: (String, String, String, String, String, String)| row.2);

            if let Some(b) = body {
                routines.push(RemoteRoutine {
                    name: name.clone(),
                    r#type: rtype.to_string(),
                    body: normalize_routine_body(&b, "mysql"),
                });
            }
        }

        // 获取触发器
        let trigger_rows: Vec<(String,)> = conn.query(
            format!(
                "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = '{}' ORDER BY TRIGGER_NAME",
                db
            )
        ).map_err(|e| format!("query_triggers_failed: {}", e))?;

        for (name,) in &trigger_rows {
            let body: Option<String> = conn
                .query_first(format!("SHOW CREATE TRIGGER `{}`", name))
                .map_err(|e| format!("get_trigger_{}_definition_failed: {}", name, e))?
                .map(|row: (String, String, String, String, String, String, String)| row.2);

            if let Some(b) = body {
                routines.push(RemoteRoutine {
                    name: name.clone(),
                    r#type: "trigger".to_string(),
                    body: normalize_routine_body(&b, "mysql"),
                });
            }
        }

        Ok(routines)
    }
}

// ─── PostgreSQL implementation ──────────────────────────────────────────────

pub struct PostgresDialect;

impl DatabaseDialect for PostgresDialect {
    fn name(&self) -> &str {
        "postgresql"
    }
    fn display_name(&self) -> &str {
        "PostgreSQL"
    }

    fn auto_increment_suffix(&self) -> &str {
        " GENERATED ALWAYS AS IDENTITY"
    }
    fn supports_inline_comment(&self) -> bool {
        false
    }

    fn table_comment_sql(&self, table: &str, comment: &str) -> String {
        format!(
            "COMMENT ON TABLE {} IS '{}';\n",
            table,
            comment.replace('\'', "''")
        )
    }
    fn column_comment_sql(&self, table: &str, col: &str, comment: &str) -> String {
        format!(
            "COMMENT ON COLUMN {}.{} IS '{}';\n",
            table,
            col,
            comment.replace('\'', "''")
        )
    }
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String {
        format!("  ALTER COLUMN {} TYPE {}", col, full_type)
    }
    fn drop_index_sql(&self, idx_name: &str, _table: &str) -> String {
        format!("DROP INDEX {};\n", idx_name)
    }
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String {
        match routine_type {
            "function" => format!("DROP FUNCTION IF EXISTS {};\n", name),
            "procedure" => format!("DROP PROCEDURE IF EXISTS {};\n", name),
            "trigger" => format!("DROP TRIGGER IF EXISTS {};\n", name),
            _ => format!("DROP {} IF EXISTS {};\n", routine_type, name),
        }
    }
    fn bool_literal(&self, value: bool) -> &str {
        if value {
            "TRUE"
        } else {
            "FALSE"
        }
    }
    fn map_data_type(&self, dt: &str) -> String {
        match dt.to_lowercase().as_str() {
            "tinyint" => "smallint".to_string(),
            "mediumtext" | "longtext" => "text".to_string(),
            "datetime" => "timestamp".to_string(),
            "double" => "double precision".to_string(),
            "blob" => "bytea".to_string(),
            _ => dt.to_string(),
        }
    }
    fn type_mappings(&self) -> HashMap<String, String> {
        [
            ("tinyint", "smallint"),
            ("mediumtext", "text"),
            ("longtext", "text"),
            ("datetime", "timestamp"),
            ("double", "double precision"),
            ("blob", "bytea"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
    }
    fn uses_alter_column_syntax(&self) -> bool {
        true
    }
}

impl DatabaseConnector for PostgresDialect {
    fn test_connection(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<(), String> {
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("tls_error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut client = postgres::Config::new()
            .host(host)
            .port(port as u16)
            .user(user)
            .password(pass)
            .dbname(db)
            .connect(connector)
            .map_err(|e| format!("postgresql_connection_failed: {}", e))?;
        client
            .simple_query("SELECT 1")
            .map_err(|e| format!("postgresql_query_failed: {}", e))?;
        Ok(())
    }

    fn get_remote_tables(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteTable>, String> {
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("tls_error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut client = postgres::Config::new()
            .host(host)
            .port(port as u16)
            .user(user)
            .password(pass)
            .dbname(db)
            .connect(connector)
            .map_err(|e| format!("postgresql_connection_failed: {}", e))?;

        let table_rows = client.query(
            "SELECT c.relname, pg_catalog.obj_description(c.oid) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname",
            &[],
        ).map_err(|e| format!("query_tables_failed: {}", e))?;

        let mut result = Vec::new();
        for row in &table_rows {
            let table_name: String = row.get(0);
            let table_comment: Option<String> = row.get(1);

            let col_rows = client.query(
                "SELECT c.column_name, c.data_type, c.character_maximum_length::int, c.is_nullable, COALESCE((SELECT 'PRI' FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'), '') as column_key, c.column_default, pg_catalog.col_description((SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name), c.ordinal_position) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = $1 ORDER BY c.ordinal_position",
                &[&table_name],
            ).map_err(|e| format!("query_columns_failed: {}", e))?;

            let remote_cols: Vec<RemoteColumn> = col_rows
                .iter()
                .map(|r| {
                    let nullable_str: String = r.get(3);
                    let length: Option<i32> = r.get(2);
                    let default_val: Option<String> = r.get(5);
                    let extra = if default_val
                        .as_deref()
                        .map(|d| d.starts_with("nextval("))
                        .unwrap_or(false)
                    {
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
                })
                .collect();

            let idx_rows = client.query(
                "SELECT i.relname as index_name, ix.indisunique, a.attname as column_name, array_position(ix.indkey, a.attnum) as col_pos FROM pg_class t JOIN pg_index ix ON t.oid = ix.indrelid JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND t.relname = $1 AND NOT ix.indisprimary ORDER BY i.relname, col_pos",
                &[&table_name],
            ).map_err(|e| format!("query_indexes_failed: {}", e))?;

            let mut idx_map: HashMap<String, (bool, Vec<String>)> = HashMap::new();
            for r in &idx_rows {
                let idx_name: String = r.get(0);
                let is_unique: bool = r.get(1);
                let col_name: String = r.get(2);
                let entry = idx_map
                    .entry(idx_name)
                    .or_insert_with(|| (is_unique, Vec::new()));
                entry.1.push(col_name);
            }

            let remote_indexes: Vec<RemoteIndex> = idx_map
                .into_iter()
                .map(|(name, (is_unique, cols))| {
                    let index_type = if is_unique {
                        "unique".to_string()
                    } else {
                        "normal".to_string()
                    };
                    RemoteIndex {
                        name,
                        index_type,
                        column_names: cols,
                    }
                })
                .collect();

            result.push(RemoteTable {
                name: table_name,
                comment: table_comment,
                columns: remote_cols,
                indexes: remote_indexes,
            });
        }

        Ok(result)
    }

    fn get_remote_routines(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteRoutine>, String> {
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("tls_error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut client = postgres::Config::new()
            .host(host)
            .port(port as u16)
            .user(user)
            .password(pass)
            .dbname(db)
            .connect(connector)
            .map_err(|e| format!("postgresql_connection_failed: {}", e))?;

        let mut routines = Vec::new();

        // 获取函数和存储过程
        let func_rows = client
            .query(
                "SELECT p.proname, pg_get_functiondef(p.oid), \
             CASE WHEN p.prokind = 'p' THEN 'procedure' ELSE 'function' END as kind \
             FROM pg_proc p \
             JOIN pg_namespace n ON n.oid = p.pronamespace \
             WHERE n.nspname = 'public' \
             AND p.prokind IN ('f', 'p') \
             ORDER BY kind, p.proname",
                &[],
            )
            .map_err(|e| format!("query_functions_procedures_failed: {}", e))?;

        for row in &func_rows {
            let name: String = row.get(0);
            let body: String = row.get(1);
            let kind: String = row.get(2);
            routines.push(RemoteRoutine {
                name,
                r#type: kind,
                body,
            });
        }

        // 获取触发器
        let trig_rows = client
            .query(
                "SELECT t.tgname, pg_get_triggerdef(t.oid, true) \
             FROM pg_trigger t \
             JOIN pg_class c ON c.oid = t.tgrelid \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname = 'public' \
             AND NOT t.tgisinternal \
             ORDER BY t.tgname",
                &[],
            )
            .map_err(|e| format!("query_triggers_failed: {}", e))?;

        for row in &trig_rows {
            let name: String = row.get(0);
            let body: String = row.get(1);
            routines.push(RemoteRoutine {
                name,
                r#type: "trigger".to_string(),
                body,
            });
        }

        Ok(routines)
    }
}

// ─── Oracle implementation ────────────────────────────────────────────────

pub struct OracleDialect;

impl DatabaseDialect for OracleDialect {
    fn name(&self) -> &str {
        "oracle"
    }
    fn display_name(&self) -> &str {
        "Oracle"
    }

    fn auto_increment_suffix(&self) -> &str {
        " GENERATED ALWAYS AS IDENTITY"
    }
    fn supports_inline_comment(&self) -> bool {
        false
    }

    fn table_comment_sql(&self, table: &str, comment: &str) -> String {
        format!(
            "COMMENT ON TABLE {} IS '{}';\n",
            table,
            comment.replace('\'', "''")
        )
    }
    fn column_comment_sql(&self, table: &str, col: &str, comment: &str) -> String {
        format!(
            "COMMENT ON COLUMN {}.{} IS '{}';\n",
            table,
            col,
            comment.replace('\'', "''")
        )
    }
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String {
        format!("  MODIFY {} {}", col, full_type)
    }
    fn drop_index_sql(&self, idx_name: &str, _table: &str) -> String {
        format!("DROP INDEX {};\n", idx_name)
    }
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String {
        match routine_type {
            "function" => format!("DROP FUNCTION {};\n", name),
            "procedure" => format!("DROP PROCEDURE {};\n", name),
            "trigger" => format!("DROP TRIGGER {};\n", name),
            _ => format!("DROP {} {};\n", routine_type.to_uppercase(), name),
        }
    }
    fn bool_literal(&self, value: bool) -> &str {
        if value {
            "1"
        } else {
            "0"
        }
    }
    fn map_data_type(&self, dt: &str) -> String {
        match dt.to_lowercase().as_str() {
            "tinyint" => "number(3)".to_string(),
            "smallint" => "number(5)".to_string(),
            "int" | "integer" | "mediumint" => "number(10)".to_string(),
            "bigint" => "number(19)".to_string(),
            "float" => "binary_float".to_string(),
            "double" => "binary_double".to_string(),
            "decimal" | "numeric" => "number".to_string(),
            "char" => "char".to_string(),
            "varchar" => "varchar2".to_string(),
            "text" | "mediumtext" | "longtext" => "clob".to_string(),
            "datetime" | "timestamp" => "timestamp".to_string(),
            "date" => "date".to_string(),
            "time" => "interval day to second".to_string(),
            "blob" => "blob".to_string(),
            "boolean" => "number(1)".to_string(),
            _ => dt.to_string(),
        }
    }
    fn type_mappings(&self) -> HashMap<String, String> {
        [
            ("tinyint", "number(3)"),
            ("smallint", "number(5)"),
            ("int", "number(10)"),
            ("integer", "number(10)"),
            ("mediumint", "number(10)"),
            ("bigint", "number(19)"),
            ("float", "binary_float"),
            ("double", "binary_double"),
            ("decimal", "number"),
            ("numeric", "number"),
            ("varchar", "varchar2"),
            ("text", "clob"),
            ("mediumtext", "clob"),
            ("longtext", "clob"),
            ("datetime", "timestamp"),
            ("timestamp", "timestamp"),
            ("blob", "blob"),
            ("boolean", "number(1)"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
    }

    fn drop_table_sql(&self, table: &str) -> String {
        format!("DROP TABLE {};\n", table)
    }

    fn add_column_clause(&self, col_def: &str) -> String {
        format!("  ADD {}", col_def)
    }

    fn drop_column_clause(&self, col: &str) -> String {
        format!("  DROP COLUMN {}", col)
    }
}

impl DatabaseConnector for OracleDialect {
    fn test_connection(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<(), String> {
        let conn_str = format!("//{}:{}/{}", host, port, db);
        let conn = oracle::Connection::connect(user, pass, conn_str)
            .map_err(|e| format!("oracle_connection_failed: {}", e))?;
        conn.execute("SELECT 1 FROM dual", &[])
            .map_err(|e| format!("oracle_query_failed: {}", e))?;
        Ok(())
    }

    fn get_remote_tables(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteTable>, String> {
        let conn_str = format!("//{}:{}/{}", host, port, db);
        let conn = oracle::Connection::connect(user, pass, conn_str)
            .map_err(|e| format!("oracle_connection_failed: {}", e))?;

        // 查询表
        let mut stmt = conn.statement(
            "SELECT table_name, comments FROM user_tab_comments WHERE table_type = 'TABLE' ORDER BY table_name"
        ).build().map_err(|e| format!("query_tables_failed: {}", e))?;

        let rows = stmt.query(&[]).map_err(|e| format!("query_tables_failed: {}", e))?;
        let mut result = Vec::new();

        // 预查询主键信息：table_name -> Vec<column_name>
        let mut pk_stmt = conn
            .statement(
                "SELECT cc.table_name, cc.column_name \
             FROM user_constraints c JOIN user_cons_columns cc \
             ON c.constraint_name = cc.constraint_name \
             WHERE c.constraint_type = 'P' \
             ORDER BY cc.table_name, cc.position",
            )
            .build()
            .map_err(|e| format!("query_primary_keys_failed: {}", e))?;
        let pk_rows = pk_stmt
            .query(&[])
            .map_err(|e| format!("query_primary_keys_failed: {}", e))?;
        let mut pk_map: HashMap<String, Vec<String>> = HashMap::new();
        for row_result in pk_rows {
            let row = row_result.map_err(|e| format!("read_pk_row_failed: {}", e))?;
            let tbl: String = row.get(0).map_err(|e| format!("get_table_name_failed: {}", e))?;
            let col: String = row.get(1).map_err(|e| format!("get_column_name_failed: {}", e))?;
            pk_map.entry(tbl).or_default().push(col);
        }

        // 预查询 Identity 列信息：table_name -> Vec<column_name>
        let mut identity_map: HashMap<String, Vec<String>> = HashMap::new();
        if let Ok(mut id_stmt) = conn
            .statement("SELECT table_name, column_name FROM user_tab_identity_cols")
            .build()
        {
            if let Ok(id_rows) = id_stmt.query(&[]) {
                for row_result in id_rows {
                    if let Ok(row) = row_result {
                        let tbl: String = row.get(0).unwrap_or_default();
                        let col: String = row.get(1).unwrap_or_default();
                        if !tbl.is_empty() {
                            identity_map.entry(tbl).or_default().push(col);
                        }
                    }
                }
            }
        }

        for row_result in rows {
            let row = row_result.map_err(|e| format!("read_table_row_failed: {}", e))?;
            let table_name: String = row.get(0).map_err(|e| format!("get_table_name_failed: {}", e))?;
            let table_comment: Option<String> = row.get(1).ok();

            let pk_cols = pk_map.get(&table_name);
            let id_cols = identity_map.get(&table_name);

            // 查询列（使用正确的精度/长度字段）
            let mut col_stmt = conn.statement(
                "SELECT c.column_name, c.data_type, c.char_length, c.data_precision, c.data_scale, \
                        c.nullable, TRIM(c.data_default), c.column_id, cc.comments \
                 FROM user_tab_columns c \
                 LEFT JOIN user_col_comments cc \
                   ON c.table_name = cc.table_name AND c.column_name = cc.column_name \
                 WHERE c.table_name = :1 ORDER BY c.column_id"
            ).build().map_err(|e| format!("query_columns_failed: {}", e))?;

            let col_rows = col_stmt
                .query(&[&table_name])
                .map_err(|e| format!("query_columns_failed: {}", e))?;
            let mut remote_cols = Vec::new();

            for col_row_result in col_rows {
                let col_row = col_row_result.map_err(|e| format!("read_column_row_failed: {}", e))?;
                let name: String = col_row.get(0).map_err(|e| format!("get_column_name_failed: {}", e))?;
                let data_type: String = col_row
                    .get(1)
                    .map_err(|e| format!("get_data_type_failed: {}", e))?;
                let char_length: Option<u32> = col_row.get(2).ok();
                let data_precision: Option<u32> = col_row.get(3).ok();
                let _data_scale: Option<u32> = col_row.get(4).ok();
                let nullable: String = col_row
                    .get(5)
                    .map_err(|e| format!("get_nullable_failed: {}", e))?;
                let default_value: Option<String> = col_row.get(6).ok();
                let _column_id: u32 = col_row.get(7).map_err(|e| format!("get_column_id_failed: {}", e))?;
                let comment: Option<String> = col_row.get(8).ok();

                // 根据类型选择正确的长度
                let dt_upper = data_type.to_uppercase();
                let length = if dt_upper.contains("CHAR") || dt_upper.contains("VARCHAR") {
                    char_length.map(|l| l as i32)
                } else if dt_upper == "NUMBER" {
                    data_precision.map(|l| l as i32)
                } else {
                    None
                };

                // 检测主键
                let is_pk = pk_cols.map_or(false, |cols| cols.contains(&name));
                let column_key = if is_pk {
                    "PRI".to_string()
                } else {
                    String::new()
                };

                // 检测自增（Identity 列）
                let is_identity = id_cols.map_or(false, |cols| cols.contains(&name));
                let extra = if is_identity {
                    "auto_increment".to_string()
                } else {
                    String::new()
                };

                remote_cols.push(RemoteColumn {
                    name,
                    data_type,
                    length,
                    nullable: nullable == "Y",
                    column_key,
                    extra,
                    default_value,
                    comment,
                });
            }

            // 查询索引（排除主键）
            let mut idx_stmt = conn
                .statement(
                    "SELECT i.index_name, i.uniqueness, ic.column_name, ic.column_position \
                 FROM user_indexes i JOIN user_ind_columns ic \
                 ON i.index_name = ic.index_name \
                 WHERE i.table_name = :1 AND i.index_type != 'LOB' \
                 AND NOT EXISTS ( \
                     SELECT 1 FROM user_constraints c \
                     WHERE c.constraint_name = i.index_name AND c.constraint_type = 'P' \
                 ) \
                 ORDER BY i.index_name, ic.column_position",
                )
                .build()
                .map_err(|e| format!("query_indexes_failed: {}", e))?;

            let idx_rows = idx_stmt
                .query(&[&table_name])
                .map_err(|e| format!("query_indexes_failed: {}", e))?;

            let mut idx_map: HashMap<String, (bool, Vec<String>)> = HashMap::new();
            for idx_row_result in idx_rows {
                let idx_row = idx_row_result.map_err(|e| format!("read_index_row_failed: {}", e))?;
                let idx_name: String = idx_row
                    .get(0)
                    .map_err(|e| format!("get_index_name_failed: {}", e))?;
                let uniqueness: String = idx_row
                    .get(1)
                    .map_err(|e| format!("get_uniqueness_failed: {}", e))?;
                let col_name: String = idx_row
                    .get(2)
                    .map_err(|e| format!("get_index_column_name_failed: {}", e))?;
                let _col_pos: u32 = idx_row
                    .get(3)
                    .map_err(|e| format!("get_column_position_failed: {}", e))?;

                let entry = idx_map
                    .entry(idx_name)
                    .or_insert_with(|| (uniqueness == "UNIQUE", Vec::new()));
                entry.1.push(col_name);
            }

            let remote_indexes: Vec<RemoteIndex> = idx_map
                .into_iter()
                .map(|(name, (is_unique, cols))| {
                    let index_type = if is_unique {
                        "unique".to_string()
                    } else {
                        "normal".to_string()
                    };
                    RemoteIndex {
                        name,
                        index_type,
                        column_names: cols,
                    }
                })
                .collect();

            result.push(RemoteTable {
                name: table_name,
                comment: table_comment,
                columns: remote_cols,
                indexes: remote_indexes,
            });
        }

        Ok(result)
    }

    fn get_remote_routines(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
    ) -> Result<Vec<RemoteRoutine>, String> {
        let conn_str = format!("//{}:{}/{}", host, port, db);
        let conn = oracle::Connection::connect(user, pass, conn_str)
            .map_err(|e| format!("oracle_connection_failed: {}", e))?;

        let mut routines = Vec::new();

        // 获取函数和存储过程
        let mut stmt = conn.statement(
            "SELECT object_name, object_type, dbms_metadata.get_ddl(object_type, object_name) as ddl \
             FROM user_objects \
             WHERE object_type IN ('FUNCTION', 'PROCEDURE') \
             ORDER BY object_type, object_name"
        ).build().map_err(|e| format!("query_functions_procedures_failed: {}", e))?;

        let rows = stmt
            .query(&[])
            .map_err(|e| format!("query_functions_procedures_failed: {}", e))?;

        for row_result in rows {
            let row = row_result.map_err(|e| format!("read_row_failed: {}", e))?;
            let name: String = row.get(0).map_err(|e| format!("get_object_name_failed: {}", e))?;
            let obj_type: String = row.get(1).map_err(|e| format!("get_object_type_failed: {}", e))?;
            let ddl: Option<String> = row.get(2).ok();

            if let Some(body) = ddl {
                let rtype = if obj_type == "FUNCTION" {
                    "function"
                } else {
                    "procedure"
                };
                routines.push(RemoteRoutine {
                    name,
                    r#type: rtype.to_string(),
                    body,
                });
            }
        }

        // 获取触发器
        let mut trig_stmt = conn
            .statement(
                "SELECT trigger_name, dbms_metadata.get_ddl('TRIGGER', trigger_name) as ddl \
             FROM user_triggers \
             ORDER BY trigger_name",
            )
            .build()
            .map_err(|e| format!("query_triggers_failed: {}", e))?;

        let trig_rows = trig_stmt
            .query(&[])
            .map_err(|e| format!("query_triggers_failed: {}", e))?;

        for row_result in trig_rows {
            let row = row_result.map_err(|e| format!("read_trigger_row_failed: {}", e))?;
            let name: String = row.get(0).map_err(|e| format!("get_trigger_name_failed: {}", e))?;
            let ddl: Option<String> = row.get(1).ok();

            if let Some(body) = ddl {
                routines.push(RemoteRoutine {
                    name,
                    r#type: "trigger".to_string(),
                    body,
                });
            }
        }

        Ok(routines)
    }
}

// ─── Routine body 归一化 ─────────────────────────────────────────────────────

/// 剥离 MySQL routine body 中的 DEFINER 子句，其他方言直接返回原值
pub fn normalize_routine_body(body: &str, db_type: &str) -> String {
    if db_type == "mysql" {
        let re = regex::Regex::new(
            r"(?i)CREATE\s+DEFINER\s*=\s*(?:`[^`]*`|[^\s@]+)@(?:`[^`]*`|[^\s]+)\s+"
        ).unwrap();
        re.replace(body, "CREATE ").to_string()
    } else {
        body.to_string()
    }
}

// ─── Factory functions ──────────────────────────────────────────────────────

pub fn get_dialect(db_type: &str) -> Box<dyn DatabaseDialect> {
    match db_type {
        "mysql" => Box::new(MysqlDialect),
        "oracle" => Box::new(OracleDialect),
        _ => Box::new(PostgresDialect),
    }
}

pub fn get_connector(db_type: &str) -> Box<dyn DatabaseConnector> {
    match db_type {
        "mysql" => Box::new(MysqlDialect),
        "oracle" => Box::new(OracleDialect),
        _ => Box::new(PostgresDialect),
    }
}

// ─── Tauri command ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct DatabaseTypeInfo {
    pub value: String,
    pub label: String,
    pub color: String,
}

#[tauri::command]
pub fn get_supported_database_types() -> Vec<DatabaseTypeInfo> {
    vec![
        DatabaseTypeInfo {
            value: "mysql".to_string(),
            label: "MySQL".to_string(),
            color: "green".to_string(),
        },
        DatabaseTypeInfo {
            value: "postgresql".to_string(),
            label: "PostgreSQL".to_string(),
            color: "purple".to_string(),
        },
        DatabaseTypeInfo {
            value: "oracle".to_string(),
            label: "Oracle".to_string(),
            color: "red".to_string(),
        },
    ]
}

#[tauri::command]
pub fn get_type_mappings(database_type: String) -> HashMap<String, String> {
    let dialect = get_dialect(&database_type);
    dialect.type_mappings()
}
