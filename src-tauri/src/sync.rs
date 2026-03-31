use crate::models::{RemoteTable, TableDiff};
use crate::services::sync_service::SyncService;

// 测试数据库连接
#[tauri::command]
pub fn connect_database(connection_id: i32) -> Result<String, String> {
    SyncService::new().connect_database(connection_id)
}

// 获取远程数据库的表结构
#[tauri::command]
pub fn get_remote_tables(connection_id: i32) -> Result<Vec<RemoteTable>, String> {
    SyncService::new().get_remote_tables(connection_id)
}

// 比较本地表结构和远程表结构
#[tauri::command]
pub fn compare_tables(project_id: i32, remote_tables_json: String) -> Result<Vec<TableDiff>, String> {
    SyncService::new().compare_tables(project_id, remote_tables_json)
}

// 生成同步 SQL（将本地结构同步到远程数据库）
#[tauri::command]
pub fn generate_sync_sql(project_id: i32, remote_tables_json: String, database_type: String) -> Result<String, String> {
    SyncService::new().generate_sync_sql(project_id, remote_tables_json, database_type)
}

// 将远程整张表同步到本地模型
#[tauri::command]
pub fn sync_remote_table_to_local(project_id: i32, remote_table_json: String) -> Result<String, String> {
    SyncService::new().sync_remote_table_to_local(project_id, remote_table_json)
}

// 将远程字段同步到本地模型（处理有差异和仅远程的字段）
#[tauri::command]
pub fn sync_remote_columns_to_local(project_id: i32, table_name: String, remote_columns_json: String, column_names: Vec<String>) -> Result<String, String> {
    SyncService::new().sync_remote_columns_to_local(project_id, table_name, remote_columns_json, column_names)
}

// 将远程索引同步到本地模型
#[tauri::command]
pub fn sync_remote_indexes_to_local(project_id: i32, table_name: String, remote_indexes_json: String, index_names: Vec<String>) -> Result<String, String> {
    SyncService::new().sync_remote_indexes_to_local(project_id, table_name, remote_indexes_json, index_names)
}
