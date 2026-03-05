use rusqlite::params;

use crate::db::init_db;
use crate::models::{TableDef, ColumnDef, IndexDef, IndexField, InitData};

// 获取项目下的所有表
#[tauri::command]
pub fn get_project_tables(project_id: i32) -> Result<Vec<TableDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT * FROM t_table WHERE project_id = ?1 ORDER BY created_at")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let table_iter = stmt.query_map(params![project_id], |row| {
        Ok(TableDef {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            display_name: row.get(3)?,
            comment: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).map_err(|e| format!("Error querying tables: {}", e))?;

    let mut tables = Vec::new();
    for table in table_iter {
        tables.push(table.map_err(|e| format!("Error reading table: {}", e))?);
    }

    Ok(tables)
}

// 保存表结构
#[tauri::command]
pub fn save_table_structure(project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    // 临时禁用外键约束，因为 t_index_field 引用了 t_column，
    // 删除列再重新插入（ID不变）期间会触发外键检查
    conn.execute_batch("PRAGMA foreign_keys = OFF")
        .map_err(|e| format!("Error disabling foreign keys: {}", e))?;

    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    tx.execute(
        "INSERT OR REPLACE INTO t_table (id, project_id, name, display_name, comment, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
        params![table.id, project_id, table.name, table.display_name, table.comment],
    ).map_err(|e| format!("Error saving table: {}", e))?;

    tx.execute("DELETE FROM t_column WHERE table_id = ?1", params![table.id])
        .map_err(|e| format!("Error deleting old columns: {}", e))?;

    for column in columns {
        tx.execute(
            "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, nullable, primary_key, auto_increment, default_value, comment, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                column.id, table.id, column.name, column.display_name, column.data_type,
                column.length, column.nullable, column.primary_key, column.auto_increment,
                column.default_value, column.comment, column.sort_order
            ],
        ).map_err(|e| format!("Error saving column: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    conn.execute_batch("PRAGMA foreign_keys = ON")
        .map_err(|e| format!("Error enabling foreign keys: {}", e))?;

    Ok("表结构保存成功".to_string())
}

// 获取表的列定义
#[tauri::command]
pub fn get_table_columns(table_id: String) -> Result<Vec<ColumnDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT * FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let column_iter = stmt.query_map(params![table_id], |row| {
        Ok(ColumnDef {
            id: row.get(0)?,
            table_id: row.get(1)?,
            name: row.get(2)?,
            display_name: row.get(3)?,
            data_type: row.get(4)?,
            length: row.get(5)?,
            nullable: row.get(6)?,
            primary_key: row.get(7)?,
            auto_increment: row.get(8)?,
            default_value: row.get(9)?,
            comment: row.get(10)?,
            sort_order: row.get(11)?,
        })
    }).map_err(|e| format!("Error querying columns: {}", e))?;

    let mut columns = Vec::new();
    for column in column_iter {
        columns.push(column.map_err(|e| format!("Error reading column: {}", e))?);
    }

    Ok(columns)
}

// 保存索引
#[tauri::command]
pub fn save_table_indexes(table_id: String, indexes: Vec<IndexDef>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    tx.execute(
        "DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)",
        params![table_id],
    ).map_err(|e| format!("Error deleting old index fields: {}", e))?;

    tx.execute("DELETE FROM t_index WHERE table_id = ?1", params![table_id])
        .map_err(|e| format!("Error deleting old indexes: {}", e))?;

    for index in indexes {
        tx.execute(
            "INSERT INTO t_index (id, table_id, name, index_type, comment) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![index.id, table_id, index.name, index.index_type, index.comment],
        ).map_err(|e| format!("Error saving index: {}", e))?;

        for field in index.fields {
            tx.execute(
                "INSERT INTO t_index_field (index_id, column_id, sort_order) VALUES (?1, ?2, ?3)",
                params![index.id, field.column_id, field.sort_order],
            ).map_err(|e| format!("Error saving index field: {}", e))?;
        }
    }

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    Ok("索引保存成功".to_string())
}

// 获取表的索引
#[tauri::command]
pub fn get_table_indexes(table_id: String) -> Result<Vec<IndexDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT * FROM t_index WHERE table_id = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let index_iter = stmt.query_map(params![table_id], |row| {
        Ok(IndexDef {
            id: row.get(0)?,
            table_id: row.get(1)?,
            name: row.get(2)?,
            index_type: row.get(3)?,
            comment: row.get(4)?,
            fields: Vec::new(),
        })
    }).map_err(|e| format!("Error querying indexes: {}", e))?;

    let mut indexes = Vec::new();
    for index in index_iter {
        let mut index = index.map_err(|e| format!("Error reading index: {}", e))?;

        let mut field_stmt = conn.prepare("SELECT column_id, sort_order FROM t_index_field WHERE index_id = ?1 ORDER BY sort_order")
            .map_err(|e| format!("Error preparing field statement: {}", e))?;

        let field_iter = field_stmt.query_map(params![index.id], |row| {
            Ok(IndexField {
                column_id: row.get(0)?,
                sort_order: row.get(1)?,
            })
        }).map_err(|e| format!("Error querying index fields: {}", e))?;

        let mut fields = Vec::new();
        for field in field_iter {
            fields.push(field.map_err(|e| format!("Error reading index field: {}", e))?);
        }

        index.fields = fields;
        indexes.push(index);
    }

    Ok(indexes)
}

// 获取表的初始数据
#[tauri::command]
pub fn get_init_data(table_id: String) -> Result<Vec<InitData>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT id, table_id, data, created_at FROM t_init_data WHERE table_id = ?1 ORDER BY id")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let iter = stmt.query_map(params![table_id], |row| {
        Ok(InitData {
            id: row.get(0)?,
            table_id: row.get(1)?,
            data: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| format!("Error querying init data: {}", e))?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| format!("Error reading init data: {}", e))?);
    }

    Ok(results)
}

// 保存初始数据（全量覆盖）
#[tauri::command]
pub fn save_init_data(table_id: String, rows: Vec<String>) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    tx.execute("DELETE FROM t_init_data WHERE table_id = ?1", params![table_id])
        .map_err(|e| format!("Error deleting old init data: {}", e))?;

    for row_json in rows {
        tx.execute(
            "INSERT INTO t_init_data (table_id, data) VALUES (?1, ?2)",
            params![table_id, row_json],
        ).map_err(|e| format!("Error saving init data row: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    Ok("初始数据保存成功".to_string())
}

// 删除初始数据
#[tauri::command]
pub fn delete_init_data(id: i64) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute("DELETE FROM t_init_data WHERE id = ?1", params![id])
        .map_err(|e| format!("Error deleting init data: {}", e))?;

    Ok("初始数据删除成功".to_string())
}

// 删除表
#[tauri::command]
pub fn delete_table(table_id: String) -> Result<String, String> {
    let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
    let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

    tx.execute("DELETE FROM t_init_data WHERE table_id = ?1", params![table_id])
        .map_err(|e| format!("Error deleting init data: {}", e))?;
    tx.execute("DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)", params![table_id])
        .map_err(|e| format!("Error deleting index fields: {}", e))?;
    tx.execute("DELETE FROM t_index WHERE table_id = ?1", params![table_id])
        .map_err(|e| format!("Error deleting indexes: {}", e))?;
    tx.execute("DELETE FROM t_column WHERE table_id = ?1", params![table_id])
        .map_err(|e| format!("Error deleting columns: {}", e))?;
    tx.execute("DELETE FROM t_table WHERE id = ?1", params![table_id])
        .map_err(|e| format!("Error deleting table: {}", e))?;

    tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

    Ok("表删除成功".to_string())
}
