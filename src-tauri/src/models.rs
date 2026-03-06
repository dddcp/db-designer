use serde::{Deserialize, Serialize};

// 项目数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i32,
    pub name: String,
    pub description: Option<String>,
    pub database_type: String,
    pub created_at: String,
    pub updated_at: String,
}

// 创建项目的请求结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub database_type: String,
}

// 表结构数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDef {
    pub id: String,
    pub project_id: i32,
    pub name: String,
    pub display_name: String,
    pub comment: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// 列定义数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDef {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub display_name: String,
    pub data_type: String,
    pub length: Option<i32>,
    pub scale: Option<i32>,
    pub nullable: bool,
    pub primary_key: bool,
    pub auto_increment: bool,
    pub default_value: Option<String>,
    pub comment: Option<String>,
    pub sort_order: i32,
}

// 索引数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexDef {
    pub id: String,
    pub table_id: String,
    pub name: String,
    pub index_type: String,
    pub comment: Option<String>,
    pub fields: Vec<IndexField>,
}

// 索引字段数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexField {
    pub column_id: String,
    pub sort_order: i32,
}

// 设置数据结构
#[derive(Debug, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: String,
}

// 数据库连接配置数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DatabaseConnection {
    pub id: i32,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: String,
    pub database: String,
    pub created_at: String,
    pub updated_at: String,
}

// 创建数据库连接配置的请求结构
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDatabaseConnectionRequest {
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: String,
    pub database: String,
}

// 更新数据库连接配置的请求结构
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateDatabaseConnectionRequest {
    pub id: i32,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub password: String,
    pub database: String,
}

// 初始数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InitData {
    pub id: i64,
    pub table_id: String,
    pub data: String, // JSON string
    pub created_at: String,
}

// 版本数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Version {
    pub id: i64,
    pub project_id: i32,
    pub name: String,
    pub snapshot: String, // JSON string
    pub created_at: String,
}

// 快照内部结构（用于序列化/反序列化）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Snapshot {
    pub tables: Vec<SnapshotTable>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotTable {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub comment: Option<String>,
    pub columns: Vec<ColumnDef>,
    pub indexes: Vec<IndexDef>,
    pub init_data: Vec<String>, // JSON strings
}

// 远程表列信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteColumn {
    pub name: String,
    pub data_type: String,
    pub length: Option<i32>,
    pub nullable: bool,
    pub column_key: String,
    pub extra: String,
    pub default_value: Option<String>,
    pub comment: Option<String>,
}

// 远程索引信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteIndex {
    pub name: String,
    pub index_type: String,        // "unique", "normal", "fulltext"
    pub column_names: Vec<String>,
}

// 远程表信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteTable {
    pub name: String,
    pub comment: Option<String>,
    pub columns: Vec<RemoteColumn>,
    pub indexes: Vec<RemoteIndex>,
}

// 表差异
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableDiff {
    pub table_name: String,
    pub status: String,
    pub local_display_name: Option<String>,
    pub column_diffs: Vec<ColumnDiff>,
    pub index_diffs: Vec<IndexDiff>,
}

// 列差异
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnDiff {
    pub column_name: String,
    pub status: String,
    pub local_type: Option<String>,
    pub remote_type: Option<String>,
    pub detail: Option<String>,
}

// 索引差异
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexDiff {
    pub index_name: String,
    pub status: String,
    pub local_type: Option<String>,
    pub remote_type: Option<String>,
    pub local_columns: Option<String>,
    pub remote_columns: Option<String>,
    pub detail: Option<String>,
}
