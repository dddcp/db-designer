use std::collections::HashMap;

use crate::models::{ColumnDef, CreateDatabaseConnectionRequest, CreateProjectRequest, DatabaseConnection, IndexDef, InitData, Project, RoutineDef, TableDef, UpdateDatabaseConnectionRequest, Version};

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
    fn get_table_by_id(&self, table_id: &str) -> Result<Option<TableDef>, String>;
    fn save_table_structure(&self, project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<(), String>;
    fn get_table_columns(&self, table_id: &str) -> Result<Vec<ColumnDef>, String>;
    fn save_table_indexes(&self, table_id: &str, indexes: Vec<IndexDef>) -> Result<(), String>;
    fn get_table_indexes(&self, table_id: &str) -> Result<Vec<IndexDef>, String>;
    fn get_init_data(&self, table_id: &str) -> Result<Vec<InitData>, String>;
    fn save_init_data(&self, table_id: &str, rows: Vec<String>) -> Result<(), String>;
    fn delete_init_data(&self, id: i64) -> Result<(), String>;
    fn delete_table(&self, table_id: &str) -> Result<(), String>;
}

pub trait VersionStore {
    fn get_versions(&self, project_id: i32) -> Result<Vec<Version>, String>;
    fn create_version(&self, project_id: i32, name: String, snapshot: String) -> Result<Version, String>;
    fn delete_version(&self, id: i64) -> Result<(), String>;
    fn get_version_by_id(&self, id: i64) -> Result<Option<Version>, String>;
    fn get_version_snapshot(&self, id: i64) -> Result<String, String>;
}

pub trait DatabaseConnectionStore {
    fn get_database_connections(&self) -> Result<Vec<DatabaseConnection>, String>;
    fn create_database_connection(&self, connection: CreateDatabaseConnectionRequest) -> Result<DatabaseConnection, String>;
    fn update_database_connection(&self, connection: UpdateDatabaseConnectionRequest) -> Result<DatabaseConnection, String>;
    fn delete_database_connection(&self, id: i32) -> Result<(), String>;
    fn get_database_connection_by_id(&self, id: i32) -> Result<Option<DatabaseConnection>, String>;
}

pub trait RoutineStore {
    fn get_project_routines(&self, project_id: i32) -> Result<Vec<RoutineDef>, String>;
    fn get_project_routines_by_db_type(&self, project_id: i32, db_type: &str) -> Result<Vec<RoutineDef>, String>;
    fn save_routine(&self, routine: RoutineDef) -> Result<(), String>;
    fn delete_routine(&self, id: &str) -> Result<(), String>;
    fn get_routine_by_signature(&self, project_id: i32, name: &str, routine_type: &str, db_type: &str) -> Result<Option<RoutineDef>, String>;
}
