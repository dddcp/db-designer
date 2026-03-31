use rusqlite::params;

use crate::db::init_db;
use crate::models::{CreateDatabaseConnectionRequest, DatabaseConnection, UpdateDatabaseConnectionRequest};
use crate::storage::DatabaseConnectionStore;

pub struct SqliteDatabaseConnectionStore;

impl SqliteDatabaseConnectionStore {
    pub fn new() -> Self {
        Self
    }

    fn map_database_connection(row: &rusqlite::Row<'_>) -> rusqlite::Result<DatabaseConnection> {
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
    }
}

impl DatabaseConnectionStore for SqliteDatabaseConnectionStore {
    fn get_database_connections(&self) -> Result<Vec<DatabaseConnection>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT * FROM t_database_connection ORDER BY created_at DESC")
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let connection_iter = stmt
            .query_map([], Self::map_database_connection)
            .map_err(|e| format!("Error querying database connections: {}", e))?;

        let mut connections = Vec::new();
        for connection in connection_iter {
            connections.push(connection.map_err(|e| format!("Error reading database connection: {}", e))?);
        }

        Ok(connections)
    }

    fn create_database_connection(&self, connection: CreateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute(
            "INSERT INTO t_database_connection (name, type, host, port, username, password, database) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![connection.name, connection.r#type, connection.host, connection.port, connection.username, connection.password, connection.database],
        )
        .map_err(|e| format!("Error creating database connection: {}", e))?;

        let id = conn.last_insert_rowid() as i32;
        self.get_database_connection_by_id(id)?
            .ok_or_else(|| "Failed to fetch created database connection".to_string())
    }

    fn update_database_connection(&self, connection: UpdateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute(
            "UPDATE t_database_connection SET name = ?1, type = ?2, host = ?3, port = ?4, username = ?5, password = ?6, database = ?7, updated_at = datetime('now') WHERE id = ?8",
            params![connection.name, connection.r#type, connection.host, connection.port, connection.username, connection.password, connection.database, connection.id],
        )
        .map_err(|e| format!("Error updating database connection: {}", e))?;

        self.get_database_connection_by_id(connection.id)?
            .ok_or_else(|| "Failed to fetch updated database connection".to_string())
    }

    fn delete_database_connection(&self, id: i32) -> Result<(), String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute("DELETE FROM t_database_connection WHERE id = ?1", params![id])
            .map_err(|e| format!("Error deleting database connection: {}", e))?;

        Ok(())
    }

    fn get_database_connection_by_id(&self, id: i32) -> Result<Option<DatabaseConnection>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT * FROM t_database_connection WHERE id = ?1")
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let mut connection_iter = stmt
            .query_map(params![id], Self::map_database_connection)
            .map_err(|e| format!("Error querying database connection: {}", e))?;

        if let Some(connection) = connection_iter.next() {
            Ok(Some(connection.map_err(|e| format!("Error reading database connection: {}", e))?))
        } else {
            Ok(None)
        }
    }
}
