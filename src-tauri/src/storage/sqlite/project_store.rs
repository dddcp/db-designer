use rusqlite::params;

use crate::db::init_db;
use crate::models::{CreateProjectRequest, Project, UpdateProjectRequest};
use crate::storage::ProjectStore;

pub struct SqliteProjectStore;

impl SqliteProjectStore {
    pub fn new() -> Self {
        Self
    }

    fn map_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            table_count: row.get(5)?,
        })
    }

    fn fetch_project_by_id(&self, id: i32) -> Result<Project, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.name, p.description, p.created_at, p.updated_at, \
                        COALESCE(t.cnt, 0) AS table_count \
                 FROM t_proj p \
                 LEFT JOIN (SELECT project_id, COUNT(*) AS cnt FROM t_table GROUP BY project_id) t \
                   ON t.project_id = p.id \
                 WHERE p.id = ?1",
            )
            .map_err(|e| format!("Error preparing statement: {}", e))?;
        let mut iter = stmt
            .query_map(params![id], Self::map_project)
            .map_err(|e| format!("Error querying project: {}", e))?;
        match iter.next() {
            Some(p) => p.map_err(|e| format!("Error reading project: {}", e)),
            None => Err(format!("Project not found: {}", id)),
        }
    }
}

impl ProjectStore for SqliteProjectStore {
    fn get_projects(&self) -> Result<Vec<Project>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        // 通过 LEFT JOIN 一次性统计每个项目下的表数量，避免 N+1 查询
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.name, p.description, p.created_at, p.updated_at, \
                        COALESCE(t.cnt, 0) AS table_count \
                 FROM t_proj p \
                 LEFT JOIN (SELECT project_id, COUNT(*) AS cnt FROM t_table GROUP BY project_id) t \
                   ON t.project_id = p.id \
                 ORDER BY p.created_at",
            )
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let project_iter = stmt.query_map([], Self::map_project)
            .map_err(|e| format!("Error querying projects: {}", e))?;

        let mut projects = Vec::new();
        for project in project_iter {
            projects.push(project.map_err(|e| format!("Error reading project: {}", e))?);
        }

        Ok(projects)
    }

    fn create_project(&self, project: CreateProjectRequest) -> Result<Project, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute(
            "INSERT INTO t_proj (name, description) VALUES (?1, ?2)",
            params![project.name, project.description],
        ).map_err(|e| format!("Error creating project: {}", e))?;

        let id = conn.last_insert_rowid() as i32;
        self.fetch_project_by_id(id)
    }

    fn update_project(&self, project: UpdateProjectRequest) -> Result<Project, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let affected = conn.execute(
            "UPDATE t_proj SET name = ?1, description = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![project.name, project.description, project.id],
        )
        .map_err(|e| format!("Error updating project: {}", e))?;

        if affected == 0 {
            return Err(format!("Project not found: {}", project.id));
        }

        self.fetch_project_by_id(project.id)
    }

    fn delete_project(&self, id: i32) -> Result<(), String> {
        let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
        let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

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

        for table_id in &table_ids {
            tx.execute("DELETE FROM t_init_data WHERE table_id = ?1", params![table_id])
                .map_err(|e| format!("Error deleting init data: {}", e))?;
            tx.execute("DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)", params![table_id])
                .map_err(|e| format!("Error deleting index fields: {}", e))?;
            tx.execute("DELETE FROM t_index WHERE table_id = ?1", params![table_id])
                .map_err(|e| format!("Error deleting indexes: {}", e))?;
            tx.execute("DELETE FROM t_column WHERE table_id = ?1", params![table_id])
                .map_err(|e| format!("Error deleting columns: {}", e))?;
        }

        tx.execute("DELETE FROM t_table WHERE project_id = ?1", params![id])
            .map_err(|e| format!("Error deleting tables: {}", e))?;
        tx.execute("DELETE FROM t_version WHERE project_id = ?1", params![id])
            .map_err(|e| format!("Error deleting versions: {}", e))?;
        tx.execute("DELETE FROM t_proj WHERE id = ?1", params![id])
            .map_err(|e| format!("Error deleting project: {}", e))?;

        tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

        Ok(())
    }
}
