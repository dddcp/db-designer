use std::collections::HashMap;

use crate::models::{ColumnDef, IndexDef, InitData, Project, TableDef, CreateProjectRequest};

pub mod sqlite;

pub trait SettingStore {
    fn get_setting(&self, key: &str) -> Result<Option<String>, String>;
    fn save_setting(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete_setting(&self, key: &str) -> Result<(), String>;
    fn get_all_settings(&self) -> Result<HashMap<String, String>, String>;
}

pub trait LocalSettingsStore {
    fn load_settings(&self) -> Result<HashMap<String, String>, String>;
    fn save_settings(&self, settings: &HashMap<String, String>) -> Result<(), String>;
}

pub trait ProjectStore {
    fn get_projects(&self) -> Result<Vec<Project>, String>;
    fn create_project(&self, project: CreateProjectRequest) -> Result<Project, String>;
    fn delete_project(&self, id: i32) -> Result<(), String>;
}

pub trait TableStore {
    fn get_project_tables(&self, project_id: i32) -> Result<Vec<TableDef>, String>;
    fn save_table_structure(&self, project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<(), String>;
    fn get_table_columns(&self, table_id: &str) -> Result<Vec<ColumnDef>, String>;
    fn save_table_indexes(&self, table_id: &str, indexes: Vec<IndexDef>) -> Result<(), String>;
    fn get_table_indexes(&self, table_id: &str) -> Result<Vec<IndexDef>, String>;
    fn get_init_data(&self, table_id: &str) -> Result<Vec<InitData>, String>;
    fn save_init_data(&self, table_id: &str, rows: Vec<String>) -> Result<(), String>;
    fn delete_init_data(&self, id: i64) -> Result<(), String>;
    fn delete_table(&self, table_id: &str) -> Result<(), String>;
}
