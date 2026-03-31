use crate::models::{CreateDatabaseConnectionRequest, DatabaseConnection, UpdateDatabaseConnectionRequest};
use crate::services::database_connection_service::DatabaseConnectionService;

// 获取所有数据库连接配置
#[tauri::command]
pub fn get_database_connections() -> Result<Vec<DatabaseConnection>, String> {
    DatabaseConnectionService::new().get_database_connections()
}

// 创建数据库连接配置
#[tauri::command]
pub fn create_database_connection(connection: CreateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
    DatabaseConnectionService::new().create_database_connection(connection)
}

// 更新数据库连接配置
#[tauri::command]
pub fn update_database_connection(connection: UpdateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
    DatabaseConnectionService::new().update_database_connection(connection)
}

// 删除数据库连接配置
#[tauri::command]
pub fn delete_database_connection(id: i32) -> Result<String, String> {
    DatabaseConnectionService::new().delete_database_connection(id)
}
