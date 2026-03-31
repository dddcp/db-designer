use rusqlite::params;

use crate::db::init_db;
use crate::models::RoutineDef;
use crate::storage::RoutineStore;

pub struct SqliteRoutineStore;

impl SqliteRoutineStore {
    pub fn new() -> Self {
        Self
    }

    fn map_routine(row: &rusqlite::Row<'_>) -> rusqlite::Result<RoutineDef> {
        Ok(RoutineDef {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            r#type: row.get(3)?,
            body: row.get(4)?,
            comment: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            db_type: row.get(8)?,
        })
    }
}

impl RoutineStore for SqliteRoutineStore {
    fn get_project_routines(&self, project_id: i32) -> Result<Vec<RoutineDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, project_id, name, type, body, comment, created_at, updated_at, db_type FROM t_routine WHERE project_id = ?1 ORDER BY type, name",
        ).map_err(|e| format!("Error preparing statement: {}", e))?;

        let iter = stmt
            .query_map(params![project_id], Self::map_routine)
            .map_err(|e| format!("Error querying routines: {}", e))?;

        let mut results = Vec::new();
        for item in iter {
            results.push(item.map_err(|e| format!("Error reading routine: {}", e))?);
        }

        Ok(results)
    }

    fn get_project_routines_by_db_type(&self, project_id: i32, db_type: &str) -> Result<Vec<RoutineDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, project_id, name, type, body, comment, created_at, updated_at, db_type FROM t_routine WHERE project_id = ?1 AND (db_type = ?2 OR db_type IS NULL) ORDER BY type, name",
        ).map_err(|e| format!("Error preparing statement: {}", e))?;

        let iter = stmt
            .query_map(params![project_id, db_type], Self::map_routine)
            .map_err(|e| format!("Error querying routines: {}", e))?;

        let mut results = Vec::new();
        for item in iter {
            results.push(item.map_err(|e| format!("Error reading routine: {}", e))?);
        }

        Ok(results)
    }

    fn save_routine(&self, routine: RoutineDef) -> Result<(), String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute(
            "INSERT INTO t_routine (id, project_id, name, type, body, comment, db_type, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now')) \
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, body=excluded.body, comment=excluded.comment, db_type=excluded.db_type, updated_at=datetime('now')",
            params![routine.id, routine.project_id, routine.name, routine.r#type, routine.body, routine.comment, routine.db_type],
        ).map_err(|e| format!("Error saving routine: {}", e))?;

        Ok(())
    }

    fn delete_routine(&self, id: &str) -> Result<(), String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute("DELETE FROM t_routine WHERE id = ?1", params![id])
            .map_err(|e| format!("Error deleting routine: {}", e))?;

        Ok(())
    }

    fn get_routine_by_signature(&self, project_id: i32, name: &str, routine_type: &str, db_type: &str) -> Result<Option<RoutineDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, project_id, name, type, body, comment, created_at, updated_at, db_type FROM t_routine WHERE project_id = ?1 AND name = ?2 AND type = ?3 AND db_type = ?4",
        ).map_err(|e| format!("Error preparing statement: {}", e))?;

        let mut iter = stmt
            .query_map(params![project_id, name, routine_type, db_type], Self::map_routine)
            .map_err(|e| format!("Error querying routine: {}", e))?;

        if let Some(routine) = iter.next() {
            Ok(Some(routine.map_err(|e| format!("Error reading routine: {}", e))?))
        } else {
            Ok(None)
        }
    }
}
