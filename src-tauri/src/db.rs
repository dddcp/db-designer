use rusqlite::{Connection, params, Result as SqlResult};
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
    // 环境变量优先（保留开发模式灵活性）
    if let Ok(custom_path) = env::var("DB_DESIGNER_DATA_PATH") {
        let custom_path = PathBuf::from(custom_path);
        if custom_path.is_dir() {
            return custom_path.join("db_designer.db").to_string_lossy().to_string();
        } else {
            return custom_path.to_string_lossy().to_string();
        }
    }

    // 默认使用安装目录下的 data 文件夹
    let data_dir = get_data_dir();
    data_dir.join("db_designer.db").to_string_lossy().to_string()
}

// 初始化数据库
pub fn init_db() -> SqlResult<Connection> {
    // 获取数据库文件路径
    let db_path = get_database_path();
    println!("数据库文件路径: {}", db_path);

    // 确保目录存在
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(e))
        })?;
    }

    let conn = Connection::open(&db_path)?;

    // 创建表结构相关的表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_table (
            id TEXT PRIMARY KEY,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            comment TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_column (
            id TEXT PRIMARY KEY,
            table_id TEXT NOT NULL,
            name TEXT NOT NULL,
            display_name TEXT NOT NULL,
            data_type TEXT NOT NULL,
            length INTEGER,
            nullable BOOLEAN NOT NULL DEFAULT 1,
            primary_key BOOLEAN NOT NULL DEFAULT 0,
            auto_increment BOOLEAN NOT NULL DEFAULT 0,
            default_value TEXT,
            comment TEXT,
            sort_order INTEGER NOT NULL,
            FOREIGN KEY (table_id) REFERENCES t_table(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_index (
            id TEXT PRIMARY KEY,
            table_id TEXT NOT NULL,
            name TEXT NOT NULL,
            index_type TEXT NOT NULL,
            comment TEXT,
            FOREIGN KEY (table_id) REFERENCES t_table(id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_index_field (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            index_id TEXT NOT NULL,
            column_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            FOREIGN KEY (index_id) REFERENCES t_index(id),
            FOREIGN KEY (column_id) REFERENCES t_column(id)
        )",
        [],
    )?;

    // 创建数据库连接配置表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_database_connection (
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
        )",
        [],
    )?;

    // 创建初始数据表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_init_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            table_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (table_id) REFERENCES t_table(id)
        )",
        [],
    )?;

    // 创建版本表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_version (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES t_proj(id)
        )",
        [],
    )?;

    Ok(conn)
}

// 创建项目表
#[tauri::command]
pub fn init_database() -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_proj (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            database_type TEXT NOT NULL DEFAULT 'mysql',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )",
        [],
    ).map_err(|e| format!("Error creating table: {}", e))?;

    // 创建设置表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS t_setting (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )",
        [],
    ).map_err(|e| format!("Error creating setting table: {}", e))?;

    Ok("Database initialized successfully".to_string())
}
