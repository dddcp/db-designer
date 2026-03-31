use rusqlite::params;

use crate::db::init_db;
use crate::models::Version;
use crate::storage::VersionStore;

pub struct SqliteVersionStore;

impl SqliteVersionStore {
    pub fn new() -> Self {
        Self
    }

    fn map_version(row: &rusqlite::Row<'_>) -> rusqlite::Result<Version> {
        Ok(Version {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            snapshot: row.get(3)?,
            created_at: row.get(4)?,
        })
    }
}

impl VersionStore for SqliteVersionStore {
    fn get_versions(&self, project_id: i32) -> Result<Vec<Version>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, project_id, name, snapshot, created_at FROM t_version WHERE project_id = ?1 ORDER BY id DESC")
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let iter = stmt
            .query_map(params![project_id], Self::map_version)
            .map_err(|e| format!("Error querying versions: {}", e))?;

        let mut results = Vec::new();
        for item in iter {
            results.push(item.map_err(|e| format!("Error reading version: {}", e))?);
        }

        Ok(results)
    }

    fn create_version(&self, project_id: i32, name: String, snapshot: String) -> Result<Version, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute(
            "INSERT INTO t_version (project_id, name, snapshot) VALUES (?1, ?2, ?3)",
            params![project_id, name, snapshot],
        )
        .map_err(|e| format!("Error creating version: {}", e))?;

        let version_id = conn.last_insert_rowid();
        self.get_version_by_id(version_id)?
            .ok_or_else(|| "Failed to fetch created version".to_string())
    }

    fn delete_version(&self, id: i64) -> Result<(), String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
        conn.execute("DELETE FROM t_version WHERE id = ?1", params![id])
            .map_err(|e| format!("Error deleting version: {}", e))?;
        Ok(())
    }

    fn get_version_by_id(&self, id: i64) -> Result<Option<Version>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT id, project_id, name, snapshot, created_at FROM t_version WHERE id = ?1")
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let mut iter = stmt
            .query_map(params![id], Self::map_version)
            .map_err(|e| format!("Error querying version: {}", e))?;

        if let Some(version) = iter.next() {
            Ok(Some(version.map_err(|e| format!("Error reading version: {}", e))?))
        } else {
            Ok(None)
        }
    }

    fn get_version_snapshot(&self, id: i64) -> Result<String, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.query_row(
            "SELECT snapshot FROM t_version WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Error reading version: {}", e))
    }
}
