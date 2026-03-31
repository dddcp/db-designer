use crate::models::Version;
use crate::services::version_service::VersionService;

// 获取版本列表
#[tauri::command]
pub fn get_versions(project_id: i32) -> Result<Vec<Version>, String> {
    VersionService::new().get_versions(project_id)
}

// 创建版本（快照当前项目的全部表结构 + 元数据）
#[tauri::command]
pub fn create_version(project_id: i32, name: String) -> Result<Version, String> {
    VersionService::new().create_version(project_id, name)
}

// 删除版本
#[tauri::command]
pub fn delete_version(id: i64) -> Result<String, String> {
    VersionService::new().delete_version(id)
}

// 导出某个版本的完整建表 SQL
#[tauri::command]
pub fn export_version_sql(version_id: i64, database_type: String) -> Result<String, String> {
    VersionService::new().export_version_sql(version_id, database_type)
}

// 生成从旧版本到新版本的升级 SQL
#[tauri::command]
pub fn export_upgrade_sql(
    old_version_id: i64,
    new_version_id: i64,
    database_type: String,
) -> Result<String, String> {
    VersionService::new().export_upgrade_sql(old_version_id, new_version_id, database_type)
}

// 导出当前项目的完整 SQL（从实时数据，包含表结构、索引、元数据）
#[tauri::command]
pub fn export_project_sql(project_id: i32, database_type: String) -> Result<String, String> {
    VersionService::new().export_project_sql(project_id, database_type)
}

// 导出单个表的 SQL（从实时数据，包含表结构、索引、元数据）
#[tauri::command]
pub fn export_table_sql(table_id: String, database_type: String) -> Result<String, String> {
    VersionService::new().export_table_sql(table_id, database_type)
}
