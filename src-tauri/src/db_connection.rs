use rusqlite::params;

use crate::db::init_db;
use crate::models::{DatabaseConnection, CreateDatabaseConnectionRequest, UpdateDatabaseConnectionRequest};

// 获取所有数据库连接配置
#[tauri::command]
pub fn get_database_connections() -> Result<Vec<DatabaseConnection>, String> {
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
pub fn create_database_connection(connection: CreateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "INSERT INTO t_database_connection (name, type, host, port, username, password, database) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![connection.name, connection.r#type, connection.host, connection.port, connection.username, connection.password, connection.database],
    ).map_err(|e| format!("Error creating database connection: {}", e))?;

    let id = conn.last_insert_rowid() as i32;

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
pub fn update_database_connection(connection: UpdateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "UPDATE t_database_connection SET name = ?1, type = ?2, host = ?3, port = ?4, username = ?5, password = ?6, database = ?7, updated_at = datetime('now') WHERE id = ?8",
        params![connection.name, connection.r#type, connection.host, connection.port, connection.username, connection.password, connection.database, connection.id],
    ).map_err(|e| format!("Error updating database connection: {}", e))?;

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
pub fn delete_database_connection(id: i32) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute("DELETE FROM t_database_connection WHERE id = ?1", params![id])
        .map_err(|e| format!("Error deleting database connection: {}", e))?;

    Ok("数据库连接配置删除成功".to_string())
}
