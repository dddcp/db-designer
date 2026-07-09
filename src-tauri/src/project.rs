use crate::models::{CreateProjectRequest, Project, UpdateProjectRequest};
use crate::services::project_service::ProjectService;

// 获取所有项目
#[tauri::command]
pub fn get_projects() -> Result<Vec<Project>, String> {
    ProjectService::new().get_projects()
}

// 创建新项目
#[tauri::command]
pub fn create_project(project: CreateProjectRequest) -> Result<Project, String> {
    ProjectService::new().create_project(project)
}

// 更新项目
#[tauri::command]
pub fn update_project(project: UpdateProjectRequest) -> Result<Project, String> {
    ProjectService::new().update_project(project)
}

#[tauri::command]
pub fn delete_project(id: i32) -> Result<String, String> {
    ProjectService::new().delete_project(id)
}
