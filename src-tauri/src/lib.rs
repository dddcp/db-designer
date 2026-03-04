use rusqlite::{Connection, params, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::path::PathBuf;

/// 获取应用安装目录下的 data 文件夹路径
fn get_data_dir() -> PathBuf {
    let exe_path = std::env::current_exe().expect("无法获取可执行文件路径");
    let install_dir = exe_path.parent().expect("无法获取安装目录");
    install_dir.join("data")
}

/// 获取数据库文件路径
/// 优先使用环境变量 DB_DESIGNER_DATA_PATH
/// 默认使用应用安装目录下的 data/db_designer.db
fn get_database_path() -> String {
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
    
    let mut stmt = conn.prepare("SELECT * FROM t_proj ORDER BY created_at")
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
    let data_dir = get_data_dir();
    let mut info = HashMap::new();

    // 获取当前分支
    let output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["branch", "--show-current"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    info.insert("branch".to_string(), branch);

    // 获取最新提交信息
    let commit_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["log", "-1", "--pretty=format:%h %s"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    let commit = String::from_utf8_lossy(&commit_output.stdout).trim().to_string();
    info.insert("latest_commit".to_string(), commit);

    Ok(info)
}

// 初始化Git仓库
#[tauri::command]
fn init_git_repository() -> Result<String, String> {
    let data_dir = get_data_dir();

    // 确保 data 目录存在
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("无法创建 data 目录: {}", e))?;

    // 1. git init
    let init_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["init"])
        .output()
        .map_err(|e| format!("执行 git init 失败: {}", e))?;

    if !init_output.status.success() {
        let stderr = String::from_utf8_lossy(&init_output.stderr);
        return Err(format!("git init 失败: {}", stderr));
    }

    // 2. 从 settings 读取 git 配置
    let db_path = get_database_path();
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("无法打开数据库: {}", e))?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM t_setting WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).ok()
    };

    let platform = get_setting("git_platform").unwrap_or_default();
    let token = get_setting("git_token").unwrap_or_default();
    let repo = get_setting("git_repository").unwrap_or_default();

    if token.is_empty() || repo.is_empty() {
        return Err("请先在设置中配置 Git Token 和仓库名称".to_string());
    }

    // 3. 构造 remote URL
    let remote_url = match platform.as_str() {
        "gitlab" => format!("https://oauth2:{}@gitlab.com/{}.git", token, repo),
        "gitee" => format!("https://{}@gitee.com/{}.git", token, repo),
        _ => format!("https://{}@github.com/{}.git", token, repo), // 默认 GitHub
    };

    // 移除已有的 origin（忽略错误，可能不存在）
    let _ = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["remote", "remove", "origin"])
        .output();

    // 4. 添加 remote origin
    let remote_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["remote", "add", "origin", &remote_url])
        .output()
        .map_err(|e| format!("添加 remote 失败: {}", e))?;

    if !remote_output.status.success() {
        let stderr = String::from_utf8_lossy(&remote_output.stderr);
        return Err(format!("添加 remote origin 失败: {}", stderr));
    }

    Ok("Git 仓库初始化成功".to_string())
}

// Git同步操作
#[tauri::command]
fn sync_git_repository(commit_message: String) -> Result<String, String> {
    let data_dir = get_data_dir();

    // 1. git add db_designer.db
    let add_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["add", "db_designer.db"])
        .output()
        .map_err(|e| format!("执行 git add 失败: {}", e))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("git add 失败: {}", stderr));
    }

    // 2. git commit
    let msg = if commit_message.trim().is_empty() {
        "Auto sync: database changes".to_string()
    } else {
        commit_message
    };

    let commit_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["commit", "-m", &msg])
        .output()
        .map_err(|e| format!("执行 git commit 失败: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        // "nothing to commit" 不算错误
        if stdout.contains("nothing to commit") || stderr.contains("nothing to commit") {
            return Ok("没有需要提交的更改".to_string());
        }
        return Err(format!("git commit 失败: {}", stderr));
    }

    // 3. git push origin（推送到当前分支）
    let push_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["push", "origin", "HEAD"])
        .output()
        .map_err(|e| format!("执行 git push 失败: {}", e))?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(format!("git push 失败: {}", stderr));
    }

    Ok("同步成功".to_string())
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

// 初始数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InitData {
    pub id: i64,
    pub table_id: String,
    pub data: String, // JSON string
    pub created_at: String,
}

// 获取表的初始数据
#[tauri::command]
fn get_init_data(table_id: String) -> Result<Vec<InitData>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT id, table_id, data, created_at FROM t_init_data WHERE table_id = ?1 ORDER BY id")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let iter = stmt.query_map(params![table_id], |row| {
        Ok(InitData {
            id: row.get(0)?,
            table_id: row.get(1)?,
            data: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| format!("Error querying init data: {}", e))?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| format!("Error reading init data: {}", e))?);
    }

    Ok(results)
}

// 保存初始数据（全量覆盖）
#[tauri::command]
fn save_init_data(table_id: String, rows: Vec<String>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    // 删除旧数据
    tx.execute(
        "DELETE FROM t_init_data WHERE table_id = ?1",
        params![table_id],
    ).map_err(|e| format!("Error deleting old init data: {}", e))?;

    // 插入新数据
    for row_json in rows {
        tx.execute(
            "INSERT INTO t_init_data (table_id, data) VALUES (?1, ?2)",
            params![table_id, row_json],
        ).map_err(|e| format!("Error saving init data row: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    Ok("初始数据保存成功".to_string())
}

// 删除初始数据
#[tauri::command]
fn delete_init_data(id: i64) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "DELETE FROM t_init_data WHERE id = ?1",
        params![id],
    ).map_err(|e| format!("Error deleting init data: {}", e))?;

    Ok("初始数据删除成功".to_string())
}

// 版本数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Version {
    pub id: i64,
    pub project_id: i32,
    pub name: String,
    pub snapshot: String, // JSON string
    pub created_at: String,
}

// 快照内部结构（用于序列化/反序列化）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Snapshot {
    pub tables: Vec<SnapshotTable>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotTable {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub comment: Option<String>,
    pub columns: Vec<ColumnDef>,
    pub indexes: Vec<IndexDef>,
    pub init_data: Vec<String>, // JSON strings
}

// 获取版本列表
#[tauri::command]
fn get_versions(project_id: i32) -> Result<Vec<Version>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT id, project_id, name, snapshot, created_at FROM t_version WHERE project_id = ?1 ORDER BY id DESC")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let iter = stmt.query_map(params![project_id], |row| {
        Ok(Version {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            snapshot: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| format!("Error querying versions: {}", e))?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| format!("Error reading version: {}", e))?);
    }
    Ok(results)
}

// 创建版本（快照当前项目的全部表结构 + 初始数据）
#[tauri::command]
fn create_version(project_id: i32, name: String) -> Result<Version, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    // 1. 获取所有表
    let mut table_stmt = conn.prepare("SELECT id, name, display_name, comment FROM t_table WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| format!("Error preparing table stmt: {}", e))?;
    let tables: Vec<(String, String, String, Option<String>)> = table_stmt.query_map(params![project_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    }).map_err(|e| format!("Error querying tables: {}", e))?
      .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading tables: {}", e))?;

    let mut snapshot_tables = Vec::new();

    for (table_id, table_name, display_name, comment) in &tables {
        // 2. 获取列
        let mut col_stmt = conn.prepare("SELECT id, table_id, name, display_name, data_type, length, nullable, primary_key, auto_increment, default_value, comment, sort_order FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
            .map_err(|e| format!("Error preparing column stmt: {}", e))?;
        let columns: Vec<ColumnDef> = col_stmt.query_map(params![table_id], |row| {
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
        }).map_err(|e| format!("Error querying columns: {}", e))?
          .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading columns: {}", e))?;

        // 3. 获取索引
        let mut idx_stmt = conn.prepare("SELECT id, table_id, name, index_type, comment FROM t_index WHERE table_id = ?1")
            .map_err(|e| format!("Error preparing index stmt: {}", e))?;
        let mut indexes: Vec<IndexDef> = idx_stmt.query_map(params![table_id], |row| {
            Ok(IndexDef {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                index_type: row.get(3)?,
                comment: row.get(4)?,
                fields: Vec::new(),
            })
        }).map_err(|e| format!("Error querying indexes: {}", e))?
          .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading indexes: {}", e))?;

        for idx in &mut indexes {
            let mut field_stmt = conn.prepare("SELECT column_id, sort_order FROM t_index_field WHERE index_id = ?1 ORDER BY sort_order")
                .map_err(|e| format!("Error preparing field stmt: {}", e))?;
            idx.fields = field_stmt.query_map(params![idx.id], |row| {
                Ok(IndexField {
                    column_id: row.get(0)?,
                    sort_order: row.get(1)?,
                })
            }).map_err(|e| format!("Error querying index fields: {}", e))?
              .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading index fields: {}", e))?;
        }

        // 4. 获取初始数据
        let mut data_stmt = conn.prepare("SELECT data FROM t_init_data WHERE table_id = ?1 ORDER BY id")
            .map_err(|e| format!("Error preparing init data stmt: {}", e))?;
        let init_data: Vec<String> = data_stmt.query_map(params![table_id], |row| {
            row.get(0)
        }).map_err(|e| format!("Error querying init data: {}", e))?
          .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error reading init data: {}", e))?;

        snapshot_tables.push(SnapshotTable {
            id: table_id.clone(),
            name: table_name.clone(),
            display_name: display_name.clone(),
            comment: comment.clone(),
            columns,
            indexes,
            init_data,
        });
    }

    let snapshot = Snapshot { tables: snapshot_tables };
    let snapshot_json = serde_json::to_string(&snapshot).map_err(|e| format!("Error serializing snapshot: {}", e))?;

    // 5. 插入版本
    conn.execute(
        "INSERT INTO t_version (project_id, name, snapshot) VALUES (?1, ?2, ?3)",
        params![project_id, name, snapshot_json],
    ).map_err(|e| format!("Error creating version: {}", e))?;

    let version_id = conn.last_insert_rowid();
    let mut stmt = conn.prepare("SELECT id, project_id, name, snapshot, created_at FROM t_version WHERE id = ?1")
        .map_err(|e| format!("Error preparing stmt: {}", e))?;
    let version = stmt.query_row(params![version_id], |row| {
        Ok(Version {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            snapshot: row.get(3)?,
            created_at: row.get(4)?,
        })
    }).map_err(|e| format!("Error reading created version: {}", e))?;

    Ok(version)
}

// 删除版本
#[tauri::command]
fn delete_version(id: i64) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    conn.execute("DELETE FROM t_version WHERE id = ?1", params![id])
        .map_err(|e| format!("Error deleting version: {}", e))?;
    Ok("版本删除成功".to_string())
}

// 导出某个版本的完整建表 SQL
#[tauri::command]
fn export_version_sql(version_id: i64, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let snapshot_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading version: {}", e))?;

    let snapshot: Snapshot = serde_json::from_str(&snapshot_json)
        .map_err(|e| format!("Error parsing snapshot: {}", e))?;

    let mut sql = String::new();
    let is_mysql = database_type == "mysql";

    for table in &snapshot.tables {
        sql.push_str(&format!("-- {} ({})\n", table.display_name, table.name));
        sql.push_str(&format!("CREATE TABLE {} (\n", table.name));

        let mut col_defs: Vec<String> = Vec::new();
        for col in &table.columns {
            let mut def = format!("  {} {}", col.name, col.data_type.to_uppercase());
            if let Some(len) = col.length {
                if ["varchar", "char", "decimal"].contains(&col.data_type.to_lowercase().as_str()) {
                    def.push_str(&format!("({})", len));
                }
            }
            if !col.nullable { def.push_str(" NOT NULL"); }
            if col.auto_increment {
                if is_mysql { def.push_str(" AUTO_INCREMENT"); }
                else { def.push_str(" GENERATED ALWAYS AS IDENTITY"); }
            }
            if let Some(dv) = &col.default_value {
                if !dv.is_empty() { def.push_str(&format!(" DEFAULT '{}'", dv)); }
            }
            if is_mysql {
                if let Some(c) = &col.comment {
                    if !c.is_empty() { def.push_str(&format!(" COMMENT '{}'", c)); }
                }
            }
            col_defs.push(def);
        }

        let pks: Vec<&str> = table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
        if !pks.is_empty() {
            col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", ")));
        }

        sql.push_str(&col_defs.join(",\n"));
        sql.push_str("\n);\n\n");

        // 表注释
        if is_mysql {
            sql.push_str(&format!("ALTER TABLE {} COMMENT = '{}';\n\n", table.name, table.display_name));
        } else {
            sql.push_str(&format!("COMMENT ON TABLE {} IS '{}';\n", table.name, table.display_name));
            for col in &table.columns {
                if let Some(c) = &col.comment {
                    if !c.is_empty() {
                        sql.push_str(&format!("COMMENT ON COLUMN {}.{} IS '{}';\n", table.name, col.name, c));
                    }
                }
            }
            sql.push('\n');
        }

        // 索引
        for idx in &table.indexes {
            let col_names: Vec<&str> = idx.fields.iter().map(|f| {
                table.columns.iter().find(|c| c.id == f.column_id).map(|c| c.name.as_str()).unwrap_or("?")
            }).collect();
            let unique_str = if idx.index_type == "unique" { "UNIQUE " } else { "" };
            sql.push_str(&format!("CREATE {}INDEX {} ON {} ({});\n", unique_str, idx.name, table.name, col_names.join(", ")));
        }
        if !table.indexes.is_empty() { sql.push('\n'); }

        // 初始数据 INSERT
        if !table.init_data.is_empty() && !table.columns.is_empty() {
            let col_names: Vec<&str> = table.columns.iter().map(|c| c.name.as_str()).collect();
            sql.push_str(&format!("-- {} 初始数据\n", table.display_name));
            for data_json in &table.init_data {
                if let Ok(data) = serde_json::from_str::<serde_json::Value>(data_json) {
                    let values: Vec<String> = col_names.iter().map(|cn| {
                        match data.get(*cn) {
                            Some(serde_json::Value::String(s)) => format!("'{}'", s.replace('\'', "''")),
                            Some(serde_json::Value::Number(n)) => n.to_string(),
                            Some(serde_json::Value::Bool(b)) => if *b { "1".into() } else { "0".into() },
                            Some(serde_json::Value::Null) | None => "NULL".into(),
                            Some(other) => format!("'{}'", other.to_string().replace('\'', "''")),
                        }
                    }).collect();
                    sql.push_str(&format!("INSERT INTO {} ({}) VALUES ({});\n", table.name, col_names.join(", "), values.join(", ")));
                }
            }
            sql.push('\n');
        }
    }

    Ok(sql)
}

// 生成从旧版本到新版本的升级 SQL
#[tauri::command]
fn export_upgrade_sql(old_version_id: i64, new_version_id: i64, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let old_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![old_version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading old version: {}", e))?;
    let new_json: String = conn.query_row(
        "SELECT snapshot FROM t_version WHERE id = ?1", params![new_version_id], |row| row.get(0)
    ).map_err(|e| format!("Error reading new version: {}", e))?;

    let old_snap: Snapshot = serde_json::from_str(&old_json).map_err(|e| format!("Error parsing old snapshot: {}", e))?;
    let new_snap: Snapshot = serde_json::from_str(&new_json).map_err(|e| format!("Error parsing new snapshot: {}", e))?;

    let is_mysql = database_type == "mysql";
    let mut sql = String::new();
    sql.push_str("-- 升级脚本\n\n");

    // 构建旧表 map: name -> SnapshotTable
    let old_map: HashMap<String, &SnapshotTable> = old_snap.tables.iter().map(|t| (t.name.clone(), t)).collect();
    let new_map: HashMap<String, &SnapshotTable> = new_snap.tables.iter().map(|t| (t.name.clone(), t)).collect();

    // 1. 新增的表
    for new_table in &new_snap.tables {
        if !old_map.contains_key(&new_table.name) {
            sql.push_str(&format!("-- 新增表: {}\n", new_table.display_name));
            sql.push_str(&format!("CREATE TABLE {} (\n", new_table.name));
            let mut col_defs: Vec<String> = Vec::new();
            for col in &new_table.columns {
                let mut def = format!("  {} {}", col.name, col.data_type.to_uppercase());
                if let Some(len) = col.length {
                    if ["varchar", "char", "decimal"].contains(&col.data_type.to_lowercase().as_str()) {
                        def.push_str(&format!("({})", len));
                    }
                }
                if !col.nullable { def.push_str(" NOT NULL"); }
                if col.auto_increment {
                    if is_mysql { def.push_str(" AUTO_INCREMENT"); } else { def.push_str(" GENERATED ALWAYS AS IDENTITY"); }
                }
                if let Some(dv) = &col.default_value {
                    if !dv.is_empty() { def.push_str(&format!(" DEFAULT '{}'", dv)); }
                }
                col_defs.push(def);
            }
            let pks: Vec<&str> = new_table.columns.iter().filter(|c| c.primary_key).map(|c| c.name.as_str()).collect();
            if !pks.is_empty() { col_defs.push(format!("  PRIMARY KEY ({})", pks.join(", "))); }
            sql.push_str(&col_defs.join(",\n"));
            sql.push_str("\n);\n\n");
        }
    }

    // 2. 删除的表
    for old_table in &old_snap.tables {
        if !new_map.contains_key(&old_table.name) {
            sql.push_str(&format!("-- 删除表: {}\n", old_table.display_name));
            sql.push_str(&format!("DROP TABLE IF EXISTS {};\n\n", old_table.name));
        }
    }

    // 3. 修改的表：比较列差异
    for new_table in &new_snap.tables {
        if let Some(old_table) = old_map.get(&new_table.name) {
            let old_cols: HashMap<String, &ColumnDef> = old_table.columns.iter().map(|c| (c.name.clone(), c)).collect();
            let new_cols: HashMap<String, &ColumnDef> = new_table.columns.iter().map(|c| (c.name.clone(), c)).collect();

            let mut changes = Vec::new();

            // 新增列
            for col in &new_table.columns {
                if !old_cols.contains_key(&col.name) {
                    let mut def = format!("{} {}", col.name, col.data_type.to_uppercase());
                    if let Some(len) = col.length {
                        if ["varchar", "char", "decimal"].contains(&col.data_type.to_lowercase().as_str()) {
                            def.push_str(&format!("({})", len));
                        }
                    }
                    if !col.nullable { def.push_str(" NOT NULL"); }
                    if let Some(dv) = &col.default_value {
                        if !dv.is_empty() { def.push_str(&format!(" DEFAULT '{}'", dv)); }
                    }
                    changes.push(format!("  ADD COLUMN {}", def));
                }
            }

            // 删除列
            for col in &old_table.columns {
                if !new_cols.contains_key(&col.name) {
                    changes.push(format!("  DROP COLUMN {}", col.name));
                }
            }

            // 修改列（类型或长度变化）
            for col in &new_table.columns {
                if let Some(old_col) = old_cols.get(&col.name) {
                    let type_changed = col.data_type != old_col.data_type || col.length != old_col.length || col.nullable != old_col.nullable;
                    if type_changed {
                        let mut def = format!("{} {}", col.name, col.data_type.to_uppercase());
                        if let Some(len) = col.length {
                            if ["varchar", "char", "decimal"].contains(&col.data_type.to_lowercase().as_str()) {
                                def.push_str(&format!("({})", len));
                            }
                        }
                        if !col.nullable { def.push_str(" NOT NULL"); }
                        if is_mysql {
                            changes.push(format!("  MODIFY COLUMN {}", def));
                        } else {
                            changes.push(format!("  ALTER COLUMN {} TYPE {}", col.name, col.data_type.to_uppercase()));
                        }
                    }
                }
            }

            if !changes.is_empty() {
                sql.push_str(&format!("-- 修改表: {}\n", new_table.display_name));
                sql.push_str(&format!("ALTER TABLE {}\n{};\n\n", new_table.name, changes.join(",\n")));
            }
        }
    }

    if sql.trim() == "-- 升级脚本" {
        sql.push_str("-- 无差异\n");
    }

    Ok(sql)
}

// 删除项目
#[tauri::command]
fn delete_project(id: i32) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    // 查找该项目下的所有表
    let table_ids: Vec<String> = {
        let mut stmt = tx.prepare("SELECT id FROM t_table WHERE project_id = ?1")
            .map_err(|e| format!("Error preparing statement: {}", e))?;
        let rows = stmt.query_map(params![id], |row| row.get(0))
            .map_err(|e| format!("Error querying tables: {}", e))?;
        let mut ids = Vec::new();
        for row in rows {
            ids.push(row.map_err(|e| format!("Error reading table id: {}", e))?);
        }
        ids
    };

    // 删除每个表关联的初始数据、索引字段、索引、列
    for table_id in &table_ids {
        tx.execute(
            "DELETE FROM t_init_data WHERE table_id = ?1",
            params![table_id],
        ).map_err(|e| format!("Error deleting init data: {}", e))?;

        tx.execute(
            "DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)",
            params![table_id],
        ).map_err(|e| format!("Error deleting index fields: {}", e))?;

        tx.execute(
            "DELETE FROM t_index WHERE table_id = ?1",
            params![table_id],
        ).map_err(|e| format!("Error deleting indexes: {}", e))?;

        tx.execute(
            "DELETE FROM t_column WHERE table_id = ?1",
            params![table_id],
        ).map_err(|e| format!("Error deleting columns: {}", e))?;
    }

    // 删除所有表
    tx.execute(
        "DELETE FROM t_table WHERE project_id = ?1",
        params![id],
    ).map_err(|e| format!("Error deleting tables: {}", e))?;

    // 删除版本
    tx.execute(
        "DELETE FROM t_version WHERE project_id = ?1",
        params![id],
    ).map_err(|e| format!("Error deleting versions: {}", e))?;

    // 删除项目
    tx.execute(
        "DELETE FROM t_proj WHERE id = ?1",
        params![id],
    ).map_err(|e| format!("Error deleting project: {}", e))?;

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    Ok("项目删除成功".to_string())
}

// 删除表
#[tauri::command]
fn delete_table(table_id: String) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    // 删除初始数据
    tx.execute(
        "DELETE FROM t_init_data WHERE table_id = ?1",
        params![table_id],
    ).map_err(|e| format!("Error deleting init data: {}", e))?;

    // 删除索引字段
    tx.execute(
        "DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)",
        params![table_id],
    ).map_err(|e| format!("Error deleting index fields: {}", e))?;

    // 删除索引
    tx.execute(
        "DELETE FROM t_index WHERE table_id = ?1",
        params![table_id],
    ).map_err(|e| format!("Error deleting indexes: {}", e))?;

    // 删除列
    tx.execute(
        "DELETE FROM t_column WHERE table_id = ?1",
        params![table_id],
    ).map_err(|e| format!("Error deleting columns: {}", e))?;

    // 删除表
    tx.execute(
        "DELETE FROM t_table WHERE id = ?1",
        params![table_id],
    ).map_err(|e| format!("Error deleting table: {}", e))?;

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    Ok("表删除成功".to_string())
}

// ========== 数据库比对与同步 ==========

// 远程表列信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteColumn {
    pub name: String,
    pub data_type: String,
    pub length: Option<i32>,
    pub nullable: bool,
    pub column_key: String,   // "PRI" / "" 等
    pub extra: String,        // "auto_increment" 等
    pub default_value: Option<String>,
    pub comment: Option<String>,
}

// 远程表信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteTable {
    pub name: String,
    pub comment: Option<String>,
    pub columns: Vec<RemoteColumn>,
}

// 表差异
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDiff {
    pub table_name: String,
    pub status: String,            // "only_local" | "only_remote" | "different" | "same"
    pub local_display_name: Option<String>,
    pub column_diffs: Vec<ColumnDiff>,
}

// 列差异
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDiff {
    pub column_name: String,
    pub status: String, // "only_local" | "only_remote" | "different" | "same"
    pub local_type: Option<String>,
    pub remote_type: Option<String>,
    pub detail: Option<String>,
}

// 测试数据库连接
#[tauri::command]
fn connect_database(connection_id: i32) -> Result<String, String> {
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
fn get_remote_tables(connection_id: i32) -> Result<Vec<RemoteTable>, String> {
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

    // 获取所有表
    let tables: Vec<(String, Option<String>)> = conn.query(
        format!("SELECT TABLE_NAME, TABLE_COMMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = '{}' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME", database)
    ).map_err(|e| format!("查询表失败: {}", e))?;

    let mut result = Vec::new();
    for (table_name, table_comment) in &tables {
        // 获取列信息
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

    // 获取所有表
    let table_rows = client.query(
        "SELECT c.relname, pg_catalog.obj_description(c.oid) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname",
        &[],
    ).map_err(|e| format!("查询表失败: {}", e))?;

    let mut result = Vec::new();
    for row in &table_rows {
        let table_name: String = row.get(0);
        let table_comment: Option<String> = row.get(1);

        // 获取列信息
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
fn compare_tables(project_id: i32, remote_tables_json: String) -> Result<Vec<TableDiff>, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let remote_tables: Vec<RemoteTable> = serde_json::from_str(&remote_tables_json)
        .map_err(|e| format!("解析远程表数据失败: {}", e))?;

    // 获取本地表
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
    for (table_id, table_name, display_name) in &local_tables {
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
            // 获取本地列
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
                    // 比较类型
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
fn generate_sync_sql(project_id: i32, remote_tables_json: String, database_type: String) -> Result<String, String> {
    let diffs = compare_tables(project_id, remote_tables_json)?;
    let is_mysql = database_type == "mysql";
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let mut sql = String::new();
    sql.push_str("-- 同步脚本: 将本地设计同步到远程数据库\n\n");

    for diff in &diffs {
        match diff.status.as_str() {
            "only_local" => {
                // 需要在远程创建表
                let mut table_stmt = conn.prepare("SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2")
                    .map_err(|e| format!("Error: {}", e))?;
                let table_id: String = table_stmt.query_row(params![project_id, diff.table_name], |row| row.get(0))
                    .map_err(|e| format!("Error: {}", e))?;

                let mut col_stmt = conn.prepare("SELECT name, data_type, length, nullable, primary_key, auto_increment, default_value, comment FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
                    .map_err(|e| format!("Error: {}", e))?;
                let cols: Vec<(String, String, Option<i32>, bool, bool, bool, Option<String>, Option<String>)> = col_stmt.query_map(params![table_id], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?))
                }).map_err(|e| format!("Error: {}", e))?
                  .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

                sql.push_str(&format!("-- 新建表: {} ({})\n", diff.table_name, diff.local_display_name.as_deref().unwrap_or("")));
                sql.push_str(&format!("CREATE TABLE {} (\n", diff.table_name));
                let mut col_defs = Vec::new();
                for (name, dt, len, nullable, pk, ai, dv, cmt) in &cols {
                    let mut def = format!("  {} {}", name, dt.to_uppercase());
                    if let Some(l) = len {
                        if ["varchar", "char", "decimal"].contains(&dt.to_lowercase().as_str()) {
                            def.push_str(&format!("({})", l));
                        }
                    }
                    if !nullable { def.push_str(" NOT NULL"); }
                    if *ai {
                        if is_mysql { def.push_str(" AUTO_INCREMENT"); }
                    }
                    if let Some(d) = dv { if !d.is_empty() { def.push_str(&format!(" DEFAULT '{}'", d)); } }
                    if is_mysql { if let Some(c) = cmt { if !c.is_empty() { def.push_str(&format!(" COMMENT '{}'", c)); } } }
                    col_defs.push(def);
                }
                let pks: Vec<&str> = cols.iter().filter(|c| c.4).map(|c| c.0.as_str()).collect();
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
                            // 远程缺少列，需 ADD
                            let mut table_stmt = conn.prepare("SELECT id FROM t_table WHERE project_id = ?1 AND name = ?2")
                                .map_err(|e| format!("Error: {}", e))?;
                            let table_id: String = table_stmt.query_row(params![project_id, diff.table_name], |row| row.get(0))
                                .map_err(|e| format!("Error: {}", e))?;
                            let mut c_stmt = conn.prepare("SELECT data_type, length, nullable, default_value FROM t_column WHERE table_id = ?1 AND name = ?2")
                                .map_err(|e| format!("Error: {}", e))?;
                            let col_info: (String, Option<i32>, bool, Option<String>) = c_stmt.query_row(params![table_id, cd.column_name], |row| {
                                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                            }).map_err(|e| format!("Error: {}", e))?;
                            let mut def = format!("{} {}", cd.column_name, col_info.0.to_uppercase());
                            if let Some(l) = col_info.1 { if ["varchar", "char", "decimal"].contains(&col_info.0.to_lowercase().as_str()) { def.push_str(&format!("({})", l)); } }
                            if !col_info.2 { def.push_str(" NOT NULL"); }
                            if let Some(d) = &col_info.3 { if !d.is_empty() { def.push_str(&format!(" DEFAULT '{}'", d)); } }
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
            _ => {} // "same" - no action
        }
    }

    if sql.trim() == "-- 同步脚本: 将本地设计同步到远程数据库" {
        sql.push_str("-- 本地设计与远程数据库结构一致，无需同步\n");
    }

    Ok(sql)
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
            init_git_repository,
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
            delete_database_connection,
            get_init_data,
            save_init_data,
            delete_init_data,
            get_versions,
            create_version,
            delete_version,
            export_version_sql,
            export_upgrade_sql,
            delete_project,
            delete_table,
            connect_database,
            get_remote_tables,
            compare_tables,
            generate_sync_sql
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
