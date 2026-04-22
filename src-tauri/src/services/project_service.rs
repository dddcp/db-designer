use crate::models::{CreateProjectRequest, Project};
use crate::storage::ProjectStore;
use crate::storage::sqlite::project_store::SqliteProjectStore;

pub struct ProjectService {
    store: Box<dyn ProjectStore>,
}

impl ProjectService {
    pub fn new() -> Self {
        Self {
            store: Box::new(SqliteProjectStore::new()),
        }
    }

    pub fn get_projects(&self) -> Result<Vec<Project>, String> {
        self.store.get_projects()
    }

    pub fn create_project(&self, project: CreateProjectRequest) -> Result<Project, String> {
        self.store.create_project(project)
    }

    pub fn delete_project(&self, id: i32) -> Result<String, String> {
        self.store.delete_project(id)?;
        Ok("project_delete_success".to_string())
    }
}
