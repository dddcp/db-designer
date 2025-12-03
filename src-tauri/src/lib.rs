use rusqlite::{Connection, params, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;

/// 获取数据库文件路径
/// 优先使用环境变量 DB_DESIGNER_DATA_PATH
/// 如果未设置环境变量，则使用用户主目录下的 db_designer_data_path 文件夹
fn get_database_path() -> String {
    // 检查环境变量
    if let Ok(custom_path) = env::var("DB_DESIGNER_DATA_PATH") {
        let custom_path = PathBuf::from(custom_path);
        if custom_path.is_dir() {
            // 如果环境变量指向的是目录，则在目录中创建数据库文件
            return custom_path.join("db_designer.db").to_string_lossy().to_string();
        } else {
            // 如果环境变量指向的是文件路径，直接使用
            return custom_path.to_string_lossy().to_string();
        }
    }
    
    // 默认路径：用户主目录下的 db_designer_data_path 文件夹
    let home_dir = match env::var("HOME") {
        Ok(path) => PathBuf::from(path),
        Err(_) => match env::var("USERPROFILE") {
            Ok(path) => PathBuf::from(path),
            Err(_) => {
                // 如果无法获取用户主目录，使用当前目录
                println!("警告：无法获取用户主目录，使用当前目录");
                PathBuf::from(".")
            }
        }
    };
    
    let default_path = home_dir.join("db_designer_data_path").join("db_designer.db");
    default_path.to_string_lossy().to_string()
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 项目数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub database_type: String,
    pub created_at: String,
    pub updated_at: String,
}

// 创建项目的请求结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub database_type: String,
}

// 初始化数据库
fn init_db() -> SqlResult<Connection> {
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
    
    Ok(conn)
}

// 创建项目表
#[tauri::command]
fn init_database() -> Result<String, String> {
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

// 获取所有项目
#[tauri::command]
fn get_projects() -> Result<Vec<Project>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT * FROM t_proj ORDER BY updated_at DESC")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let project_iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            database_type: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }).map_err(|e| format!("Error querying projects: {}", e))?;
    
    let mut projects = Vec::new();
    for project in project_iter {
        projects.push(project.map_err(|e| format!("Error reading project: {}", e))?);
    }
    
    Ok(projects)
}

// 创建新项目
#[tauri::command]
fn create_project(project: CreateProjectRequest) -> Result<Project, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    // 插入新项目
    conn.execute(
        "INSERT INTO t_proj (name, description, database_type) VALUES (?1, ?2, ?3)",
        params![project.name, project.description, project.database_type],
    ).map_err(|e| format!("Error creating project: {}", e))?;
    
    // 获取最后插入的ID
    let id = conn.last_insert_rowid() as i32;
    
    // 获取刚创建的项目
    let mut stmt = conn.prepare("SELECT * FROM t_proj WHERE id = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let mut project_iter = stmt.query_map(params![id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            database_type: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }).map_err(|e| format!("Error fetching created project: {}", e))?;
    
    if let Some(project) = project_iter.next() {
        project.map_err(|e| format!("Error reading project: {}", e))
    } else {
        Err("Failed to fetch created project".to_string())
    }
}

// 获取Git分支信息
#[tauri::command]
fn get_git_info() -> Result<HashMap<String, String>, String> {
    let mut info = HashMap::new();
    
    // 获取当前分支
    let output = std::process::Command::new("git")
        .args(["branch", "--show-current"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;
    
    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    info.insert("branch".to_string(), branch);
    
    // 获取最新提交信息
    let commit_output = std::process::Command::new("git")
        .args(["log", "-1", "--pretty=format:%h %s"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;
    
    let commit = String::from_utf8_lossy(&commit_output.stdout).trim().to_string();
    info.insert("latest_commit".to_string(), commit);
    
    Ok(info)
}

// Git同步操作
#[tauri::command]
fn sync_git_repository() -> Result<String, String> {
    // 添加所有更改
    let add_output = std::process::Command::new("git")
        .args(["add", "."])
        .output()
        .map_err(|e| format!("Failed to add changes: {}", e))?;
    
    if !add_output.status.success() {
        return Err("Failed to add changes to git".to_string());
    }
    
    // 提交更改
    let commit_output = std::process::Command::new("git")
        .args(["commit", "-m", "Auto sync: database changes"])
        .output()
        .map_err(|e| format!("Failed to commit changes: {}", e))?;
    
    if !commit_output.status.success() {
        return Err("Failed to commit changes".to_string());
    }
    
    // 推送到远程仓库
    let push_output = std::process::Command::new("git")
        .args(["push", "origin", "main"])
        .output()
        .map_err(|e| format!("Failed to push changes: {}", e))?;
    
    if !push_output.status.success() {
        return Err("Failed to push changes to remote".to_string());
    }
    
    Ok("Git同步成功".to_string())
}

// 表结构数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDef {
    pub id: String,
    pub project_id: i32,
    pub name: String,
    pub display_name: String,
    pub comment: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// 列定义数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDef {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub display_name: String,
    pub data_type: String,
    pub length: Option<i32>,
    pub nullable: bool,
    pub primary_key: bool,
    pub auto_increment: bool,
    pub default_value: Option<String>,
    pub comment: Option<String>,
    pub sort_order: i32,
}

// 索引数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexDef {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub index_type: String,
    pub comment: Option<String>,
    pub fields: Vec<IndexField>,
}

// 索引字段数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexField {
    pub column_id: String,
    pub sort_order: i32,
}

// 设置数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

// 获取项目下的所有表
#[tauri::command]
fn get_project_tables(project_id: i32) -> Result<Vec<TableDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT * FROM t_table WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let table_iter = stmt.query_map(params![project_id], |row| {
        Ok(TableDef {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            display_name: row.get(3)?,
            comment: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).map_err(|e| format!("Error querying tables: {}", e))?;
    
    let mut tables = Vec::new();
    for table in table_iter {
        tables.push(table.map_err(|e| format!("Error reading table: {}", e))?);
    }
    
    Ok(tables)
}

// 保存表结构
#[tauri::command]
fn save_table_structure(project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    // 开始事务
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;
    
    // 保存表信息
    tx.execute(
        "INSERT OR REPLACE INTO t_table (id, project_id, name, display_name, comment, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        params![table.id, project_id, table.name, table.display_name, table.comment],
    ).map_err(|e| format!("Error saving table: {}", e))?;
    
    // 删除旧的列定义
    tx.execute(
        "DELETE FROM t_column WHERE table_id = ?1",
        params![table.id],
    ).map_err(|e| format!("Error deleting old columns: {}", e))?;
    
    // 保存新的列定义
    for column in columns {
        tx.execute(
            "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, nullable, primary_key, auto_increment, default_value, comment, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                column.id, table.id, column.name, column.display_name, column.data_type,
                column.length, column.nullable, column.primary_key, column.auto_increment,
                column.default_value, column.comment, column.sort_order
            ],
        ).map_err(|e| format!("Error saving column: {}", e))?;
    }
    
    // 提交事务
    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;
    
    Ok("表结构保存成功".to_string())
}

// 获取表的列定义
#[tauri::command]
fn get_table_columns(table_id: String) -> Result<Vec<ColumnDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT * FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let column_iter = stmt.query_map(params![table_id], |row| {
        Ok(ColumnDef {
            id: row.get(0)?,
            table_id: row.get(1)?,
            name: row.get(2)?,
            display_name: row.get(3)?,
            data_type: row.get(4)?,
            length: row.get(5)?,
            nullable: row.get(6)?,
            primary_key: row.get(7)?,
            auto_increment: row.get(8)?,
            default_value: row.get(9)?,
            comment: row.get(10)?,
            sort_order: row.get(11)?,
        })
    }).map_err(|e| format!("Error querying columns: {}", e))?;
    
    let mut columns = Vec::new();
    for column in column_iter {
        columns.push(column.map_err(|e| format!("Error reading column: {}", e))?);
    }
    
    Ok(columns)
}

// 保存索引
#[tauri::command]
fn save_table_indexes(table_id: String, indexes: Vec<IndexDef>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    // 开始事务
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;
    
    // 删除旧的索引和索引字段
    tx.execute(
        "DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)",
        params![table_id],
    ).map_err(|e| format!("Error deleting old index fields: {}", e))?;
    
    tx.execute(
        "DELETE FROM t_index WHERE table_id = ?1",
        params![table_id],
    ).map_err(|e| format!("Error deleting old indexes: {}", e))?;
    
    // 保存新的索引
    for index in indexes {
        tx.execute(
            "INSERT INTO t_index (id, table_id, name, index_type, comment) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![index.id, table_id, index.name, index.index_type, index.comment],
        ).map_err(|e| format!("Error saving index: {}", e))?;
        
        // 保存索引字段
        for field in index.fields {
            tx.execute(
                "INSERT INTO t_index_field (index_id, column_id, sort_order) VALUES (?1, ?2, ?3)",
                params![index.id, field.column_id, field.sort_order],
            ).map_err(|e| format!("Error saving index field: {}", e))?;
        }
    }
    
    // 提交事务
    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;
    
    Ok("索引保存成功".to_string())
}

// 获取表的索引
#[tauri::command]
fn get_table_indexes(table_id: String) -> Result<Vec<IndexDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT * FROM t_index WHERE table_id = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let index_iter = stmt.query_map(params![table_id], |row| {
        Ok(IndexDef {
            id: row.get(0)?,
            table_id: row.get(1)?,
            name: row.get(2)?,
            index_type: row.get(3)?,
            comment: row.get(4)?,
            fields: Vec::new(), // 稍后填充字段
        })
    }).map_err(|e| format!("Error querying indexes: {}", e))?;
    
    let mut indexes = Vec::new();
    for index in index_iter {
        let mut index = index.map_err(|e| format!("Error reading index: {}", e))?;
        
        // 获取索引字段
        let mut field_stmt = conn.prepare("SELECT column_id, sort_order FROM t_index_field WHERE index_id = ?1 ORDER BY sort_order")
            .map_err(|e| format!("Error preparing field statement: {}", e))?;
        
        let field_iter = field_stmt.query_map(params![index.id], |row| {
            Ok(IndexField {
                column_id: row.get(0)?,
                sort_order: row.get(1)?,
            })
        }).map_err(|e| format!("Error querying index fields: {}", e))?;
        
        let mut fields = Vec::new();
        for field in field_iter {
            fields.push(field.map_err(|e| format!("Error reading index field: {}", e))?);
        }
        
        index.fields = fields;
        indexes.push(index);
    }
    
    Ok(indexes)
}

// 获取设置
#[tauri::command]
fn get_setting(key: String) -> Result<Option<String>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT value FROM t_setting WHERE key = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let mut result = stmt.query_map(params![key], |row| {
        Ok(row.get(0)?)
    }).map_err(|e| format!("Error querying setting: {}", e))?;
    
    if let Some(value) = result.next() {
        value.map_err(|e| format!("Error reading setting: {}", e))
    } else {
        Ok(None)
    }
}

// 保存设置
#[tauri::command]
fn save_setting(key: String, value: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    // 使用 INSERT OR REPLACE 来更新或插入设置
    conn.execute(
        "INSERT OR REPLACE INTO t_setting (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        params![key, value],
    ).map_err(|e| format!("Error saving setting: {}", e))?;
    
    Ok("设置保存成功".to_string())
}

// 获取所有设置
#[tauri::command]
fn get_all_settings() -> Result<HashMap<String, String>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT key, value FROM t_setting")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let setting_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?
        ))
    }).map_err(|e| format!("Error querying settings: {}", e))?;
    
    let mut settings = HashMap::new();
    for setting in setting_iter {
        let (key, value) = setting.map_err(|e| format!("Error reading setting: {}", e))?;
        settings.insert(key, value);
    }
    
    Ok(settings)
}

// 数据库连接配置数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseConnection {
    pub id: i32,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: String,
    pub database: String,
    pub created_at: String,
    pub updated_at: String,
}

// 创建数据库连接配置的请求结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDatabaseConnectionRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: String,
    pub database: String,
}

// 更新数据库连接配置的请求结构
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateDatabaseConnectionRequest {
    pub id: i32,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: String,
    pub database: String,
}

// 获取所有数据库连接配置
#[tauri::command]
fn get_database_connections() -> Result<Vec<DatabaseConnection>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    let mut stmt = conn.prepare("SELECT * FROM t_database_connection ORDER BY created_at DESC")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let connection_iter = stmt.query_map([], |row| {
        Ok(DatabaseConnection {
            id: row.get(0)?,
            name: row.get(1)?,
            r#type: row.get(2)?,
            host: row.get(3)?,
            port: row.get(4)?,
            username: row.get(5)?,
            password: row.get(6)?,
            database: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| format!("Error querying database connections: {}", e))?;
    
    let mut connections = Vec::new();
    for connection in connection_iter {
        connections.push(connection.map_err(|e| format!("Error reading database connection: {}", e))?);
    }
    
    Ok(connections)
}

// 创建数据库连接配置
#[tauri::command]
fn create_database_connection(connection: CreateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    // 插入新连接
    conn.execute(
        "INSERT INTO t_database_connection (name, type, host, port, username, password, database) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![connection.name, connection.r#type, connection.host, connection.port, connection.username, connection.password, connection.database],
    ).map_err(|e| format!("Error creating database connection: {}", e))?;
    
    // 获取最后插入的ID
    let id = conn.last_insert_rowid() as i32;
    
    // 获取刚创建的连接
    let mut stmt = conn.prepare("SELECT * FROM t_database_connection WHERE id = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let mut connection_iter = stmt.query_map(params![id], |row| {
        Ok(DatabaseConnection {
            id: row.get(0)?,
            name: row.get(1)?,
            r#type: row.get(2)?,
            host: row.get(3)?,
            port: row.get(4)?,
            username: row.get(5)?,
            password: row.get(6)?,
            database: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| format!("Error fetching created database connection: {}", e))?;
    
    if let Some(connection) = connection_iter.next() {
        connection.map_err(|e| format!("Error reading database connection: {}", e))
    } else {
        Err("Failed to fetch created database connection".to_string())
    }
}

// 更新数据库连接配置
#[tauri::command]
fn update_database_connection(connection: UpdateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    // 更新连接
    conn.execute(
        "UPDATE t_database_connection SET name = ?1, type = ?2, host = ?3, port = ?4, username = ?5, password = ?6, database = ?7, updated_at = datetime('now') WHERE id = ?8",
        params![connection.name, connection.r#type, connection.host, connection.port, connection.username, connection.password, connection.database, connection.id],
    ).map_err(|e| format!("Error updating database connection: {}", e))?;
    
    // 获取更新后的连接
    let mut stmt = conn.prepare("SELECT * FROM t_database_connection WHERE id = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;
    
    let mut connection_iter = stmt.query_map(params![connection.id], |row| {
        Ok(DatabaseConnection {
            id: row.get(0)?,
            name: row.get(1)?,
            r#type: row.get(2)?,
            host: row.get(3)?,
            port: row.get(4)?,
            username: row.get(5)?,
            password: row.get(6)?,
            database: row.get(7)?,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| format!("Error fetching updated database connection: {}", e))?;
    
    if let Some(connection) = connection_iter.next() {
        connection.map_err(|e| format!("Error reading database connection: {}", e))
    } else {
        Err("Failed to fetch updated database connection".to_string())
    }
}

// 删除数据库连接配置
#[tauri::command]
fn delete_database_connection(id: i32) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    
    conn.execute(
        "DELETE FROM t_database_connection WHERE id = ?1",
        params![id],
    ).map_err(|e| format!("Error deleting database connection: {}", e))?;
    
    Ok("数据库连接配置删除成功".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            init_database,
            get_projects,
            create_project,
            get_git_info,
            sync_git_repository,
            get_project_tables,
            save_table_structure,
            get_table_columns,
            save_table_indexes,
            get_table_indexes,
            get_setting,
            save_setting,
            get_all_settings,
            get_database_connections,
            create_database_connection,
            update_database_connection,
            delete_database_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
