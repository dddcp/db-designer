use std::collections::HashMap;

use crate::db::init_db;
use crate::models::{CreateDatabaseConnectionRequest, DatabaseConnection, UpdateDatabaseConnectionRequest};
use crate::storage::DatabaseConnectionStore;
use crate::storage::LocalSettingsStore;
use crate::storage::sqlite::local_settings_store::JsonLocalSettingsStore;

/// settings.json 中保存数据库连接列表的键（值为 JSON 数组字符串）
const DB_CONNECTIONS_KEY: &str = "database_connections";

/// settings.json 存储实现。
///
/// 数据库连接保存着生产库的明文密码，历史上存于 SQLite 表 t_database_connection，
/// 而 db_designer.db 会被 Git 同步整库推送到远端仓库，导致凭据外发。
/// 现改为保存在不参与 Git 同步的 settings.json 中；首次访问时自动把旧表数据
/// 迁入 settings.json，并清空旧表、VACUUM 抹掉 freelist 页残留，
/// 保证 Git 同步推送的 db_designer.db 不再携带任何连接凭据。
pub struct JsonDatabaseConnectionStore;

/// 当前 UTC 时间，格式与旧 SQLite datetime('now') 一致（YYYY-MM-DD HH:MM:SS）
fn now_string() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Howard Hinnant 的 civil_from_days 算法：Unix 天数 -> 公历年月日
    let z = (secs / 86400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let rem = secs % 86400;
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

impl JsonDatabaseConnectionStore {
    pub fn new() -> Self {
        Self
    }

    fn load_connections() -> Result<Vec<DatabaseConnection>, String> {
        let settings = JsonLocalSettingsStore::new().load_settings()?;
        match settings.get(DB_CONNECTIONS_KEY) {
            Some(raw) if !raw.trim().is_empty() => serde_json::from_str(raw)
                .map_err(|e| format!("Error parsing database connections: {}", e)),
            _ => Ok(Vec::new()),
        }
    }

    fn save_connections(connections: &[DatabaseConnection]) -> Result<(), String> {
        let store = JsonLocalSettingsStore::new();
        let mut settings: HashMap<String, String> = store.load_settings()?;
        let raw = serde_json::to_string(connections)
            .map_err(|e| format!("Error serializing database connections: {}", e))?;
        settings.insert(DB_CONNECTIONS_KEY.to_string(), raw);
        store.save_settings(&settings)
    }

    /// 一次性迁移：把旧版 SQLite t_database_connection 中的连接迁入 settings.json，
    /// 随后清空表数据并 VACUUM（同时抹掉已删行在 freelist 页中的残留），
    /// 保证 Git 同步推送的 db_designer.db 不再携带任何连接凭据。
    fn ensure_migrated() -> Result<(), String> {
        let store = JsonLocalSettingsStore::new();
        let settings = store.load_settings()?;
        if settings.contains_key(DB_CONNECTIONS_KEY) {
            return Ok(());
        }

        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, type, host, port, username, password, database, created_at, updated_at \
                 FROM t_database_connection ORDER BY id",
            )
            .map_err(|e| format!("Error preparing statement: {}", e))?;
        let legacy: Vec<DatabaseConnection> = stmt
            .query_map([], |row| {
                Ok(DatabaseConnection {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    r#type: row.get(2)?,
                    host: row.get(3)?,
                    port: row.get(4)?,
                    username: row.get(5)?,
                    password: row.get(6)?,
                    database: row.get(7)?,
                    ssl: false,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Error querying database connections: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Error reading database connection: {}", e))?;

        let mut settings = settings;
        if legacy.is_empty() {
            // 无旧数据也写入空数组占位，避免每次调用重复检查旧表
            settings.insert(DB_CONNECTIONS_KEY.to_string(), "[]".to_string());
            store.save_settings(&settings)?;
            return Ok(());
        }

        let raw = serde_json::to_string(&legacy)
            .map_err(|e| format!("Error serializing database connections: {}", e))?;
        settings.insert(DB_CONNECTIONS_KEY.to_string(), raw);
        store.save_settings(&settings)?;

        conn.execute("DELETE FROM t_database_connection", [])
            .map_err(|e| format!("Error clearing legacy connections: {}", e))?;
        conn.execute_batch("VACUUM")
            .map_err(|e| format!("Error vacuuming database: {}", e))?;
        Ok(())
    }
}

impl DatabaseConnectionStore for JsonDatabaseConnectionStore {
    fn get_database_connections(&self) -> Result<Vec<DatabaseConnection>, String> {
        Self::ensure_migrated()?;
        let mut connections = Self::load_connections()?;
        connections.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(connections)
    }

    fn create_database_connection(
        &self,
        connection: CreateDatabaseConnectionRequest,
    ) -> Result<DatabaseConnection, String> {
        Self::ensure_migrated()?;
        let mut connections = Self::load_connections()?;
        let id = connections.iter().map(|c| c.id).max().unwrap_or(0) + 1;
        let now = now_string();
        let record = DatabaseConnection {
            id,
            name: connection.name,
            r#type: connection.r#type,
            host: connection.host,
            port: connection.port,
            username: connection.username,
            password: connection.password,
            database: connection.database,
            ssl: connection.ssl,
            created_at: now.clone(),
            updated_at: now,
        };
        connections.push(record.clone());
        Self::save_connections(&connections)?;
        Ok(record)
    }

    fn update_database_connection(
        &self,
        connection: UpdateDatabaseConnectionRequest,
    ) -> Result<DatabaseConnection, String> {
        Self::ensure_migrated()?;
        let mut connections = Self::load_connections()?;
        let record = connections
            .iter_mut()
            .find(|c| c.id == connection.id)
            .ok_or_else(|| "Failed to fetch updated database connection".to_string())?;
        record.name = connection.name;
        record.r#type = connection.r#type;
        record.host = connection.host;
        record.port = connection.port;
        record.username = connection.username;
        record.password = connection.password;
        record.database = connection.database;
        record.ssl = connection.ssl;
        record.updated_at = now_string();
        let updated = record.clone();
        Self::save_connections(&connections)?;
        Ok(updated)
    }

    fn delete_database_connection(&self, id: i32) -> Result<(), String> {
        Self::ensure_migrated()?;
        let mut connections = Self::load_connections()?;
        connections.retain(|c| c.id != id);
        Self::save_connections(&connections)?;
        Ok(())
    }

    fn get_database_connection_by_id(&self, id: i32) -> Result<Option<DatabaseConnection>, String> {
        Self::ensure_migrated()?;
        Ok(Self::load_connections()?.into_iter().find(|c| c.id == id))
    }
}
