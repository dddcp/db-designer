use crate::models::{RemoteRoutine, RoutineDef, RoutineDiff};
use crate::services::routine_service::RoutineService;

// 获取项目下的所有编程对象
#[tauri::command]
pub fn get_project_routines(project_id: i32) -> Result<Vec<RoutineDef>, String> {
    RoutineService::new().get_project_routines(project_id)
}

// 保存编程对象（UPSERT）
#[tauri::command]
pub fn save_routine(routine: RoutineDef) -> Result<String, String> {
    RoutineService::new().save_routine(routine)
}

// 删除编程对象
#[tauri::command]
pub fn delete_routine(id: String) -> Result<String, String> {
    RoutineService::new().delete_routine(id)
}

// 获取远程数据库的编程对象
#[tauri::command]
pub fn get_remote_routines_cmd(connection_id: i32) -> Result<Vec<RemoteRoutine>, String> {
    RoutineService::new().get_remote_routines(connection_id)
}

// 比较本地和远程编程对象
#[tauri::command]
pub fn compare_routines(project_id: i32, remote_routines_json: String, db_type: String) -> Result<Vec<RoutineDiff>, String> {
    RoutineService::new().compare_routines(project_id, remote_routines_json, db_type)
}

// 将远程编程对象同步到本地
#[tauri::command]
pub fn sync_remote_routine_to_local(project_id: i32, remote_routine_json: String, db_type: String) -> Result<String, String> {
    RoutineService::new().sync_remote_routine_to_local(project_id, remote_routine_json, db_type)
}

// 导出项目所有编程对象的 SQL
#[tauri::command]
pub fn export_routines_sql(project_id: i32, database_type: String) -> Result<String, String> {
    RoutineService::new().export_routines_sql(project_id, database_type)
}
