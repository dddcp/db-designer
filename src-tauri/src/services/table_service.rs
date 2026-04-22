use crate::models::{ColumnDef, IndexDef, InitData, TableDef};
use crate::storage::TableStore;
use crate::storage::sqlite::table_store::SqliteTableStore;

pub struct TableService {
    store: Box<dyn TableStore>,
}

impl TableService {
    pub fn new() -> Self {
        Self {
            store: Box::new(SqliteTableStore::new()),
        }
    }

    pub fn get_project_tables(&self, project_id: i32) -> Result<Vec<TableDef>, String> {
        self.store.get_project_tables(project_id)
    }

    pub fn get_table_by_id(&self, table_id: String) -> Result<Option<TableDef>, String> {
        self.store.get_table_by_id(&table_id)
    }

    pub fn save_table_structure(&self, project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<String, String> {
        self.store.save_table_structure(project_id, table, columns)?;
        Ok("table_structure_save_success".to_string())
    }

    pub fn get_table_columns(&self, table_id: String) -> Result<Vec<ColumnDef>, String> {
        self.store.get_table_columns(&table_id)
    }

    pub fn save_table_indexes(&self, table_id: String, indexes: Vec<IndexDef>) -> Result<String, String> {
        self.store.save_table_indexes(&table_id, indexes)?;
        Ok("index_save_success".to_string())
    }

    pub fn get_table_indexes(&self, table_id: String) -> Result<Vec<IndexDef>, String> {
        self.store.get_table_indexes(&table_id)
    }

    pub fn get_init_data(&self, table_id: String) -> Result<Vec<InitData>, String> {
        self.store.get_init_data(&table_id)
    }

    pub fn save_init_data(&self, table_id: String, rows: Vec<String>) -> Result<String, String> {
        self.store.save_init_data(&table_id, rows)?;
        Ok("init_data_save_success".to_string())
    }

    pub fn delete_init_data(&self, id: i64) -> Result<String, String> {
        self.store.delete_init_data(id)?;
        Ok("init_data_delete_success".to_string())
    }

    pub fn delete_table(&self, table_id: String) -> Result<String, String> {
        self.store.delete_table(&table_id)?;
        Ok("table_delete_success".to_string())
    }
}
