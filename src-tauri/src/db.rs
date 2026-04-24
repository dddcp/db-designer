use rusqlite::{Connection, Result as SqlResult};
use std::env;
use std::path::PathBuf;

/// 获取应用安装目录下的 data 文件夹路径
pub fn get_data_dir() -> PathBuf {
    let exe_path = std::env::current_exe().expect("无法获取可执行文件路径");
    let install_dir = exe_path.parent().expect("无法获取安装目录");
    install_dir.join("data")
}

/// 获取数据库文件路径
/// 优先使用环境变量 DB_DESIGNER_DATA_PATH
/// 默认使用应用安装目录下的 data/db_designer.db
pub fn get_database_path() -> String {
    if let Ok(custom_path) = env::var("DB_DESIGNER_DATA_PATH") {
        let custom_path = PathBuf::from(custom_path);
        if custom_path.is_dir() {
            return custom_path.join("db_designer.db").to_string_lossy().to_string();
        } else {
            return custom_path.to_string_lossy().to_string();
        }
    }

    let data_dir = get_data_dir();
    data_dir.join("db_designer.db").to_string_lossy().to_string()
}

/// 获取数据库连接
pub fn init_db() -> SqlResult<Connection> {
    let db_path = get_database_path();

    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(e))
        })?;
    }

    Connection::open(&db_path)
}

/// 初始化数据库表结构（应用启动时调用一次）
#[tauri::command]
pub fn init_database() -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS t_proj (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS t_setting (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS t_table (
            id TEXT PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            comment TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        );

        CREATE TABLE IF NOT EXISTS t_column (
            id TEXT PRIMARY KEY,
            table_id TEXT NOT NULL,
            name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            data_type TEXT NOT NULL,
            length INTEGER,
            scale INTEGER,
            nullable BOOLEAN NOT NULL DEFAULT 1,
            primary_key BOOLEAN NOT NULL DEFAULT 0,
            auto_increment BOOLEAN NOT NULL DEFAULT 0,
            default_value TEXT,
            comment TEXT,
            sort_order INTEGER NOT NULL,
            FOREIGN KEY (table_id) REFERENCES t_table(id)
        );

        CREATE TABLE IF NOT EXISTS t_index (
            id TEXT PRIMARY KEY,
            table_id TEXT NOT NULL,
            name TEXT NOT NULL,
            index_type TEXT NOT NULL,
            comment TEXT,
            FOREIGN KEY (table_id) REFERENCES t_table(id)
        );

        CREATE TABLE IF NOT EXISTS t_index_field (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            index_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            FOREIGN KEY (index_id) REFERENCES t_index(id),
            FOREIGN KEY (column_id) REFERENCES t_column(id)
        );

        CREATE TABLE IF NOT EXISTS t_database_connection (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            database TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS t_init_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (table_id) REFERENCES t_table(id)
        );

        CREATE TABLE IF NOT EXISTS t_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        );

        CREATE TABLE IF NOT EXISTS t_routine (
            id TEXT PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            body TEXT NOT NULL,
            comment TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        );

        CREATE TABLE IF NOT EXISTS t_ai_review (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        );

        CREATE TABLE IF NOT EXISTS t_ai_sql_conversation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            messages TEXT NOT NULL,
            database_type TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        );
    ").map_err(|e| format!("Error initializing database: {}", e))?;

    // 数据库迁移：为已存在的 t_column 表添加 scale 列
    let _ = conn.execute_batch("ALTER TABLE t_column ADD COLUMN scale INTEGER");

    // 数据库迁移：为已存在的 t_column 表添加 default_null 列
    let _ = conn.execute_batch("ALTER TABLE t_column ADD COLUMN default_null BOOLEAN DEFAULT 0");

    // 数据库迁移：为已存在的 t_routine 表添加 db_type 列
    let _ = conn.execute_batch("ALTER TABLE t_routine ADD COLUMN db_type TEXT");

    Ok("Database initialized successfully".to_string())
}
