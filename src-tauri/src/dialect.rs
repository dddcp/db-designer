use serde::Serialize;
use std::collections::HashMap;

use crate::models::*;

// ─── 辅助函数：判断默认值是否为 SQL 函数/表达式 ────────────────────────────

/// 判断默认值是否为 SQL 内置函数或表达式（不应加引号）。
/// 包括 current_timestamp / current_date / now() / uuid_generate_v4() 等，
/// 以及以这些函数开头的表达式（如 current_timestamp::text）。
fn is_sql_function(v: &str) -> bool {
    let lower = v.to_lowercase();
    // 匹配常见的 SQL 函数调用（带或不带括号）
    let sql_functions = [
        "current_timestamp",
        "current_date",
        "current_time",
        "now(",
        "uuid_generate_v4(",
        "gen_random_uuid(",
        "nextval(",
        "currval(",
    ];
    for func in &sql_functions {
        if lower.starts_with(func) {
            return true;
        }
    }
    false
}

/// 规范化 SQL 函数默认值：current_timestamp() → CURRENT_TIMESTAMP 等。
/// 某些函数在特定方言中语法不同（如 PostgreSQL 不接受 current_timestamp()）。
fn normalize_default_function(v: &str) -> String {
    let lower = v.to_lowercase();
    if lower == "current_timestamp()" || lower == "current_timestamp" {
        "CURRENT_TIMESTAMP".to_string()
    } else if lower == "current_date()" || lower == "current_date" {
        "CURRENT_DATE".to_string()
    } else if lower == "current_time()" || lower == "current_time" {
        "CURRENT_TIME".to_string()
    } else {
        v.to_string()
    }
}

/// 标识符是否属于无需引用的安全字符集（字母/下划线开头，后续为字母/数字/下划线/$）。
/// 注入载荷必然包含引号、分号、空白或注释符等字符，均落在该字符集之外。
fn is_safe_ident(ident: &str) -> bool {
    let mut chars = ident.chars();
    match chars.next() {
        Some(first) => {
            !first.is_ascii_digit()
                && (first.is_ascii_alphabetic() || first == '_')
                && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '$'))
        }
        None => false,
    }
}

/// 注释行安全渲染：去掉名字中的换行符，防止名字截断 `--` 注释并把尾部变成可执行 SQL。
pub fn comment_safe(name: &str) -> String {
    name.replace(['\n', '\r'], " ")
}

/// 类型安全渲染：类型不是可引用的标识符（合法类型含空格和括号），
/// 因此限定安全字符集——存储的 data_type 若来自远程同步 / Git 拉取 / AI，
/// 不得重构生成的 DDL；超出安全字符集时回退为 VARCHAR。
pub fn type_str_safe(mapped_type: &str) -> String {
    if mapped_type
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | ' ' | '(' | ')' | ',' | '.'))
    {
        mapped_type.to_uppercase()
    } else {
        "VARCHAR".to_string()
    }
}

/// 默认值是否为白名单内的安全函数表达式（可安全不加引号输出）。
/// 仅整串精确匹配；不接受任意前缀——前缀匹配会放行 "nextval('s'), <任意SQL>" 之类的注入。
/// 允许尾部 ::类型 转换（类型名限定安全字符集，如 current_timestamp::text）。
fn is_safe_default_function(v: &str) -> bool {
    let trimmed = v.trim();
    let base = match trimmed.find("::") {
        Some(pos) => {
            let cast = &trimmed[pos + 2..];
            let cast_ok = !cast.is_empty()
                && cast
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | ' ' | '(' | ')' | ','));
            if !cast_ok {
                return false;
            }
            &trimmed[..pos]
        }
        None => trimmed,
    };
    let lower = base.to_lowercase();
    let bare = [
        "current_timestamp",
        "current_date",
        "current_time",
        "now()",
        "uuid_generate_v4()",
        "gen_random_uuid()",
    ];
    if bare.contains(&lower.as_str()) {
        return true;
    }
    // nextval/currval 仅允许单一简单序列名参数；参数内不得出现引号/分号/注释等任意 SQL 文本
    for prefix in ["nextval(", "currval("] {
        if let Some(inner) = lower.strip_prefix(prefix).and_then(|r| r.strip_suffix(')')) {
            let arg = inner.trim();
            let unquoted = arg.trim_matches('\'');
            let quoted_len = if arg.starts_with('\'') && arg.ends_with('\'') && arg.len() >= 2 {
                2
            } else {
                0
            };
            if unquoted.len() + quoted_len == arg.len()
                && !unquoted.is_empty()
                && unquoted
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '$'))
            {
                return true;
            }
        }
    }
    false
}

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
    /// 方言是否需要在 nullable 列上显式输出 DEFAULT NULL。
    /// MySQL 中 DEFAULT NULL 有时需要区分，PostgreSQL 中 DEFAULT NULL 对 nullable 列是多余的。
    fn should_output_default_null(&self) -> bool {
        true
    }

    // === Default implementations (currently same across databases) ===

    /// 标识符安全引用：设计元数据（表/列/索引/函数名）可能来自远程同步、Git 拉取或 AI 生成，
    /// 绝不能原样拼进 SQL（二阶 SQL 注入）。安全字符集内的名字保持原样（与历史导出兼容），
    /// 其余按 ANSI 规则加双引号并转义内嵌引号（MySQL 覆盖为反引号）。
    fn quote_ident(&self, ident: &str) -> String {
        if is_safe_ident(ident) {
            ident.to_string()
        } else {
            format!("\"{}\"", ident.replace('"', "\"\""))
        }
    }

    /// 字符串字面量内容转义。标准 SQL（PostgreSQL / Oracle）只需单引号加倍；
    /// MySQL 默认 sql_mode 下反斜杠也是转义字符，由 MysqlDialect 覆盖。
    fn escape_string_literal(&self, value: &str) -> String {
        value.replace('\'', "''")
    }

    fn create_table_prefix(&self, table: &str) -> String {
        format!("CREATE TABLE {} (\n", self.quote_ident(table))
    }
    fn drop_table_sql(&self, table: &str) -> String {
        format!("DROP TABLE IF EXISTS {};\n", self.quote_ident(table))
    }
    fn primary_key_clause(&self, columns: &[&str]) -> String {
        let cols: Vec<String> = columns.iter().map(|c| self.quote_ident(c)).collect();
        format!("  PRIMARY KEY ({})", cols.join(", "))
    }
    fn add_column_clause(&self, col_def: &str) -> String {
        format!("  ADD COLUMN {}", col_def)
    }
    fn drop_column_clause(&self, col: &str) -> String {
        format!("  DROP COLUMN {}", self.quote_ident(col))
    }
    fn default_value_clause(&self, value: &str) -> String {
        let v = value.trim();
        if v.eq_ignore_ascii_case("NULL") {
            " DEFAULT NULL".to_string()
        } else if v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2 {
            // 已是 SQL 字面量形式 —— 剥掉外层引号后重新转义，
            // 防止首尾引号之间夹带任意 SQL（如 '1'; DROP TABLE x; --'）
            let inner = &v[1..v.len() - 1];
            format!(" DEFAULT '{}'", self.escape_string_literal(inner))
        } else if is_sql_function(v) {
            // 仅白名单内的完整函数表达式不加引号；其余一律按字面量转义
            if is_safe_default_function(v) {
                format!(" DEFAULT {}", normalize_default_function(v))
            } else {
                format!(" DEFAULT '{}'", self.escape_string_literal(v))
            }
        } else {
            format!(" DEFAULT '{}'", self.escape_string_literal(v))
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
        let cols: Vec<String> = columns.iter().map(|c| self.quote_ident(c)).collect();
        format!(
            "CREATE {}INDEX {} ON {} ({});\n",
            unique_str,
            self.quote_ident(idx_name),
            self.quote_ident(table),
            cols.join(", ")
        )
    }
    fn insert_sql(&self, table: &str, columns: &[&str], values: &[String]) -> String {
        let cols: Vec<String> = columns.iter().map(|c| self.quote_ident(c)).collect();
        format!(
            "INSERT INTO {} ({}) VALUES ({});\n",
            self.quote_ident(table),
            cols.join(", "),
            values.join(", ")
        )
    }
    fn delete_sql(&self, table: &str, conditions: &[String]) -> String {
        format!(
            "DELETE FROM {} WHERE {};\n",
            self.quote_ident(table),
            conditions.join(" AND ")
        )
    }
    fn string_literal(&self, value: &str) -> String {
        format!("'{}'", self.escape_string_literal(value))
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
    /// 比较类型时将类型别名统一到规范名称。
    /// 默认实现直接转小写，各方言可覆盖以处理类型别名（如 PostgreSQL 的 int=integer）。
    fn normalize_type_for_compare(&self, dt: &str) -> String {
        dt.to_lowercase()
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
        ssl: bool,
    ) -> Result<(), String>;
    fn get_remote_tables(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
        ssl: bool,
    ) -> Result<Vec<RemoteTable>, String>;
    fn get_remote_routines(
        &self,
        host: &str,
        port: i32,
        user: &str,
        pass: &str,
        db: &str,
        ssl: bool,
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

    // MySQL 默认 sql_mode 下反斜杠是字面量内转义字符，值尾的 `\` 会转义掉拼接的收尾引号，
    // 因此必须先加倍反斜杠再加倍单引号
    fn escape_string_literal(&self, value: &str) -> String {
        value.replace('\\', "\\\\").replace('\'', "''")
    }

    // MySQL 使用反引号引用非常规标识符
    fn quote_ident(&self, ident: &str) -> String {
        if is_safe_ident(ident) {
            ident.to_string()
        } else {
            format!("`{}`", ident.replace('`', "``"))
        }
    }

    fn table_comment_sql(&self, table: &str, comment: &str) -> String {
        format!(
            "ALTER TABLE {} COMMENT = '{}';\n",
            self.quote_ident(table),
            self.escape_string_literal(comment)
        )
    }
    fn column_comment_sql(&self, _table: &str, _col: &str, _comment: &str) -> String {
        String::new() // MySQL uses inline COMMENT in column definition
    }
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String {
        format!("  MODIFY COLUMN {} {}", self.quote_ident(col), full_type)
    }
    fn drop_index_sql(&self, idx_name: &str, table: &str) -> String {
        format!(
            "DROP INDEX {} ON {};\n",
            self.quote_ident(idx_name),
            self.quote_ident(table)
        )
    }
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String {
        match routine_type {
            "function" => format!("DROP FUNCTION IF EXISTS {};\n", self.quote_ident(name)),
            "procedure" => format!("DROP PROCEDURE IF EXISTS {};\n", self.quote_ident(name)),
            "trigger" => format!("DROP TRIGGER IF EXISTS {};\n", self.quote_ident(name)),
            _ => format!("DROP {} IF EXISTS {};\n", routine_type, self.quote_ident(name)),
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
        ssl: bool,
    ) -> Result<(), String> {
        let mut opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(host))
            .tcp_port(port as u16)
            .user(Some(user))
            .pass(Some(pass))
            .db_name(Some(db));
        if ssl {
            // 用户勾选“使用SSL”：强制 TLS 加密传输（跳过证书校验以兼容自签名证书）。
            // 服务端未启用 TLS 时明确报错，不再静默明文传输凭据。
            opts = opts.ssl_opts(Some(
                mysql::SslOpts::default().with_danger_accept_invalid_certs(true),
            ));
        }
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
        ssl: bool,
    ) -> Result<Vec<RemoteTable>, String> {
        let mut opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(host))
            .tcp_port(port as u16)
            .user(Some(user))
            .pass(Some(pass))
            .db_name(Some(db));
        if ssl {
            // 用户勾选“使用SSL”：强制 TLS 加密传输（跳过证书校验以兼容自签名证书）。
            opts = opts.ssl_opts(Some(
                mysql::SslOpts::default().with_danger_accept_invalid_certs(true),
            ));
        }
        let pool = mysql::Pool::new(opts).map_err(|e| format!("mysql_connection_failed: {}", e))?;
        let mut conn = pool
            .get_conn()
            .map_err(|e| format!("mysql_connection_failed: {}", e))?;

        use mysql::prelude::*;

        let tables: Vec<(String, Option<String>)> = conn.exec(
            "SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
            (db,),
        ).map_err(|e| format!("query_tables_failed: {}", e))?;

        let mut result = Vec::new();
        for (table_name, table_comment) in &tables {
            // TABLE_NAME 来自服务端可控元数据（information_schema.TABLES），可能合法地
            // 包含引号/分号/#，绝不能拼进 SQL 文本（二阶注入），必须绑定参数
            let columns: Vec<(String, String, Option<i64>, String, String, String, Option<String>, Option<String>)> = conn.exec(
                "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT, COLUMN_COMMENT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
                (db, table_name.as_str()),
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

            let idx_rows: Vec<(String, i32, String, i64, String)> = conn.exec(
                "SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX, INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME != 'PRIMARY' ORDER BY INDEX_NAME, SEQ_IN_INDEX",
                (db, table_name.as_str()),
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
        ssl: bool,
    ) -> Result<Vec<RemoteRoutine>, String> {
        let mut opts = mysql::OptsBuilder::new()
            .ip_or_hostname(Some(host))
            .tcp_port(port as u16)
            .user(Some(user))
            .pass(Some(pass))
            .db_name(Some(db));
        if ssl {
            // 用户勾选“使用SSL”：强制 TLS 加密传输（跳过证书校验以兼容自签名证书）。
            opts = opts.ssl_opts(Some(
                mysql::SslOpts::default().with_danger_accept_invalid_certs(true),
            ));
        }
        let pool = mysql::Pool::new(opts).map_err(|e| format!("mysql_connection_failed: {}", e))?;
        let mut conn = pool
            .get_conn()
            .map_err(|e| format!("mysql_connection_failed: {}", e))?;

        use mysql::prelude::*;

        let mut routines = Vec::new();

        // 获取函数和存储过程
        let routine_rows: Vec<(String, String)> = conn.exec(
            "SELECT ROUTINE_NAME, ROUTINE_TYPE FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_TYPE, ROUTINE_NAME",
            (db,),
        ).map_err(|e| format!("query_routines_failed: {}", e))?;

        for (name, routine_type) in &routine_rows {
            let rtype = if routine_type == "FUNCTION" {
                "function"
            } else {
                "procedure"
            };
            // ROUTINE_NAME 是服务端可控元数据，可能合法地包含反引号（创建时以双反引号存储），
            // 必须加倍转义，否则会跳出标识符引号注入 SQL（二阶注入）
            let safe_name = name.replace('`', "``");
            let show_sql = if rtype == "function" {
                format!("SHOW CREATE FUNCTION `{}`", safe_name)
            } else {
                format!("SHOW CREATE PROCEDURE `{}`", safe_name)
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
        let trigger_rows: Vec<(String,)> = conn.exec(
            "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME",
            (db,),
        ).map_err(|e| format!("query_triggers_failed: {}", e))?;

        for (name,) in &trigger_rows {
            let body: Option<String> = conn
                .query_first(format!(
                    // 同上：触发器名中的反引号必须加倍
                    "SHOW CREATE TRIGGER `{}`",
                    name.replace('`', "``")
                ))
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
    fn should_output_default_null(&self) -> bool {
        // PostgreSQL 中 nullable 列的 DEFAULT NULL 是多余的，不应输出
        false
    }

    fn table_comment_sql(&self, table: &str, comment: &str) -> String {
        format!(
            "COMMENT ON TABLE {} IS '{}';\n",
            self.quote_ident(table),
            comment.replace('\'', "''")
        )
    }
    fn column_comment_sql(&self, table: &str, col: &str, comment: &str) -> String {
        format!(
            "COMMENT ON COLUMN {}.{} IS '{}';\n",
            self.quote_ident(table),
            self.quote_ident(col),
            comment.replace('\'', "''")
        )
    }
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String {
        format!("  ALTER COLUMN {} TYPE {}", self.quote_ident(col), full_type)
    }
    fn drop_index_sql(&self, idx_name: &str, _table: &str) -> String {
        format!("DROP INDEX {};\n", self.quote_ident(idx_name))
    }
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String {
        match routine_type {
            "function" => format!("DROP FUNCTION IF EXISTS {};\n", self.quote_ident(name)),
            "procedure" => format!("DROP PROCEDURE IF EXISTS {};\n", self.quote_ident(name)),
            "trigger" => format!("DROP TRIGGER IF EXISTS {};\n", self.quote_ident(name)),
            _ => format!("DROP {} IF EXISTS {};\n", routine_type, self.quote_ident(name)),
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
            // 类型别名：映射到 PostgreSQL 标准名称
            "int" => "integer".to_string(),
            "tinyint" => "smallint".to_string(),
            "mediumtext" | "longtext" => "text".to_string(),
            "datetime" => "timestamp".to_string(),
            "double" => "double precision".to_string(),
            "blob" => "bytea".to_string(),
            "bool" | "boolean" => "boolean".to_string(),
            "smallserial" => "smallint".to_string(),
            "serial" => "integer".to_string(),
            "bigserial" => "bigint".to_string(),
            _ => dt.to_string(),
        }
    }
    fn type_mappings(&self) -> HashMap<String, String> {
        [
            ("tinyint", "smallint"),
            ("int", "integer"),
            ("mediumtext", "text"),
            ("longtext", "text"),
            ("datetime", "timestamp"),
            ("double", "double precision"),
            ("blob", "bytea"),
            ("bool", "boolean"),
            ("smallserial", "smallint"),
            ("serial", "integer"),
            ("bigserial", "bigint"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
    }
    fn normalize_type_for_compare(&self, dt: &str) -> String {
        let lower = dt.to_lowercase();
        // 分离基础类型名和长度/精度后缀
        let (base_type, suffix) = if let Some(paren) = lower.find('(') {
            (&lower[..paren], &lower[paren..])
        } else {
            (lower.as_str(), "")
        };
        // 将类型别名统一到 PostgreSQL information_schema 返回的标准名称
        let normalized = match base_type.trim() {
            "int" | "integer" => "integer",
            "smallint" | "smallserial" => "smallint",
            "bigint" | "bigserial" => "bigint",
            "serial" => "integer",
            "bool" | "boolean" => "boolean",
            "varchar" | "character varying" => "character varying",
            "char" | "character" => "character",
            "float" | "real" => "real",
            "double precision" | "float8" => "double precision",
            "numeric" | "decimal" => "numeric",
            "datetime" | "timestamp" | "timestamp without time zone" => "timestamp without time zone",
            "timestamptz" | "timestamp with time zone" => "timestamp with time zone",
            "bytea" | "blob" | "varbinary" => "bytea",
            "text" | "mediumtext" | "longtext" | "tinytext" => "text",
            _ => base_type.trim(),
        };
        format!("{}{}", normalized, suffix)
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
        ssl: bool,
    ) -> Result<(), String> {
        // TLS：接受自签名证书以兼容常见自建库；用户勾选“使用SSL”时强制加密，
        // 服务端拒绝 SSL 时直接报错，防止静默降级为明文传输凭据
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("tls_error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut config = postgres::Config::new();
        config
            .host(host)
            .port(port as u16)
            .user(user)
            .password(pass)
            .dbname(db);
        if ssl {
            config.ssl_mode(postgres::config::SslMode::Require);
        }
        let mut client = config
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
        ssl: bool,
    ) -> Result<Vec<RemoteTable>, String> {
        // 同 test_connection：勾选“使用SSL”时强制加密，防止静默降级为明文
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("tls_error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut config = postgres::Config::new();
        config
            .host(host)
            .port(port as u16)
            .user(user)
            .password(pass)
            .dbname(db);
        if ssl {
            config.ssl_mode(postgres::config::SslMode::Require);
        }
        let mut client = config
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
        ssl: bool,
    ) -> Result<Vec<RemoteRoutine>, String> {
        // 同 test_connection：勾选“使用SSL”时强制加密，防止静默降级为明文
        let tls_connector = native_tls::TlsConnector::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| format!("tls_error: {}", e))?;
        let connector = postgres_native_tls::MakeTlsConnector::new(tls_connector);
        let mut config = postgres::Config::new();
        config
            .host(host)
            .port(port as u16)
            .user(user)
            .password(pass)
            .dbname(db);
        if ssl {
            config.ssl_mode(postgres::config::SslMode::Require);
        }
        let mut client = config
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
            self.quote_ident(table),
            comment.replace('\'', "''")
        )
    }
    fn column_comment_sql(&self, table: &str, col: &str, comment: &str) -> String {
        format!(
            "COMMENT ON COLUMN {}.{} IS '{}';\n",
            self.quote_ident(table),
            self.quote_ident(col),
            comment.replace('\'', "''")
        )
    }
    fn modify_column_clause(&self, col: &str, full_type: &str) -> String {
        format!("  MODIFY {} {}", self.quote_ident(col), full_type)
    }
    fn drop_index_sql(&self, idx_name: &str, _table: &str) -> String {
        format!("DROP INDEX {};\n", self.quote_ident(idx_name))
    }
    fn drop_routine_sql(&self, name: &str, routine_type: &str) -> String {
        match routine_type {
            "function" => format!("DROP FUNCTION {};\n", self.quote_ident(name)),
            "procedure" => format!("DROP PROCEDURE {};\n", self.quote_ident(name)),
            "trigger" => format!("DROP TRIGGER {};\n", self.quote_ident(name)),
            _ => format!("DROP {} {};\n", routine_type.to_uppercase(), self.quote_ident(name)),
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
        format!("DROP TABLE {};\n", self.quote_ident(table))
    }

    fn add_column_clause(&self, col_def: &str) -> String {
        format!("  ADD {}", col_def)
    }

    fn drop_column_clause(&self, col: &str) -> String {
        format!("  DROP COLUMN {}", self.quote_ident(col))
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
        _ssl: bool,
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
        _ssl: bool,
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
        _ssl: bool,
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
