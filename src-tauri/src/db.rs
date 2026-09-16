use rusqlite::{Connection, Result as SqlResult};
use std::env;
use std::path::PathBuf;

/// 获取应用数据目录
/// 默认使用系统用户数据目录（Windows: %APPDATA%\db-designer），
/// 保证普通用户无需管理员权限即可读写（安装目录 Program Files 普通用户不可写）。
pub fn get_data_dir() -> PathBuf {
    let data_dir = dirs::data_dir()
        .expect("无法获取用户数据目录")
        .join("db-designer");

    // 一次性迁移：旧版本数据存放在安装目录 data 下，若新目录不存在且旧目录存在则整体复制
    if !data_dir.exists() {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(install_dir) = exe_path.parent() {
                let old_dir = install_dir.join("data");
                if old_dir.is_dir() {
                    // 尽力而为：旧目录可能无权限（Program Files），失败不阻断启动
                    let _ = copy_dir_recursive(&old_dir, &data_dir);
                }
            }
        }
    }

    data_dir
}

/// 递归复制目录（用于旧数据目录迁移）
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let dest_path = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path)?;
        }
    }
    Ok(())
}

/// 获取数据库文件路径
/// 优先使用环境变量 DB_DESIGNER_DATA_PATH
/// 默认使用用户数据目录下的 db_designer.db（见 get_data_dir）
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
        // 安全：数据目录存放含明文凭据的数据库，拒绝同机其他用户的访问。
        // 尽力而为，异常文件系统（如 FAT）不支持权限时不能阻断启动。
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
        }
    }

    let conn = Connection::open(&db_path)?;
    // 数据库文件同样仅限属主读写（Unix）
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&db_path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(conn)
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
