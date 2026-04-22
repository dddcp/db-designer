use crate::models::{CreateDatabaseConnectionRequest, DatabaseConnection, UpdateDatabaseConnectionRequest};
use crate::storage::sqlite::database_connection_store::SqliteDatabaseConnectionStore;
use crate::storage::DatabaseConnectionStore;

pub struct DatabaseConnectionService {
    store: Box<dyn DatabaseConnectionStore>,
}

impl DatabaseConnectionService {
    pub fn new() -> Self {
        Self {
            store: Box::new(SqliteDatabaseConnectionStore::new()),
        }
    }

    pub fn get_database_connections(&self) -> Result<Vec<DatabaseConnection>, String> {
        self.store.get_database_connections()
    }

    pub fn create_database_connection(&self, connection: CreateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
        self.store.create_database_connection(connection)
    }

    pub fn update_database_connection(&self, connection: UpdateDatabaseConnectionRequest) -> Result<DatabaseConnection, String> {
        self.store.update_database_connection(connection)
    }

    pub fn delete_database_connection(&self, id: i32) -> Result<String, String> {
        self.store.delete_database_connection(id)?;
        Ok("db_connection_delete_success".to_string())
    }

    pub fn get_database_connection_by_id(&self, id: i32) -> Result<Option<DatabaseConnection>, String> {
        self.store.get_database_connection_by_id(id)
    }
}
