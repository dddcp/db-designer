use rusqlite::params;

use crate::db::init_db;
use crate::models::{Project, CreateProjectRequest};

// 获取所有项目
#[tauri::command]
pub fn get_projects() -> Result<Vec<Project>, String> {
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
pub fn create_project(project: CreateProjectRequest) -> Result<Project, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "INSERT INTO t_proj (name, description, database_type) VALUES (?1, ?2, ?3)",
        params![project.name, project.description, project.database_type],
    ).map_err(|e| format!("Error creating project: {}", e))?;

    let id = conn.last_insert_rowid() as i32;

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

#[tauri::command]
pub fn delete_project(id: i32) -> Result<String, String> {
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

    Ok("项目删除成功".to_string())
}
