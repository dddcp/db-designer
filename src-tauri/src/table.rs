use crate::models::{ColumnDef, IndexDef, InitData, TableDef};
use crate::services::table_service::TableService;

// 获取项目下的所有表
#[tauri::command]
pub fn get_project_tables(project_id: i32) -> Result<Vec<TableDef>, String> {
    TableService::new().get_project_tables(project_id)
}

// 保存表结构
#[tauri::command]
pub fn save_table_structure(project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<String, String> {
    TableService::new().save_table_structure(project_id, table, columns)
}

// 获取表的列定义
#[tauri::command]
pub fn get_table_columns(table_id: String) -> Result<Vec<ColumnDef>, String> {
    TableService::new().get_table_columns(table_id)
}

// 保存索引
#[tauri::command]
pub fn save_table_indexes(table_id: String, indexes: Vec<IndexDef>) -> Result<String, String> {
    TableService::new().save_table_indexes(table_id, indexes)
}

// 获取表的索引
#[tauri::command]
pub fn get_table_indexes(table_id: String) -> Result<Vec<IndexDef>, String> {
    TableService::new().get_table_indexes(table_id)
}

// 获取表的元数据
#[tauri::command]
pub fn get_init_data(table_id: String) -> Result<Vec<InitData>, String> {
    TableService::new().get_init_data(table_id)
}

// 保存元数据（全量覆盖）
#[tauri::command]
pub fn save_init_data(table_id: String, rows: Vec<String>) -> Result<String, String> {
    TableService::new().save_init_data(table_id, rows)
}

// 删除元数据
#[tauri::command]
pub fn delete_init_data(id: i64) -> Result<String, String> {
    TableService::new().delete_init_data(id)
}

// 删除表
#[tauri::command]
pub fn delete_table(table_id: String) -> Result<String, String> {
    TableService::new().delete_table(table_id)
}
