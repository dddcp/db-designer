use rusqlite::params;

use crate::db::init_db;
use crate::models::{ColumnDef, IndexDef, IndexField, InitData, TableDef};
use crate::storage::TableStore;
use std::collections::HashMap;

pub struct SqliteTableStore;

impl SqliteTableStore {
    pub fn new() -> Self {
        Self
    }
}

impl TableStore for SqliteTableStore {
    fn get_project_tables(&self, project_id: i32) -> Result<Vec<TableDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn.prepare("SELECT * FROM t_table WHERE project_id = ?1 ORDER BY created_at DESC")
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
                columns: Vec::new(),
            })
        }).map_err(|e| format!("Error querying tables: {}", e))?;

        let mut tables = Vec::new();
        for table in table_iter {
            tables.push(table.map_err(|e| format!("Error reading table: {}", e))?);
        }

        Ok(tables)
    }

    fn get_project_tables_with_columns(&self, project_id: i32) -> Result<Vec<TableDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        // 第 1 次查询：项目下所有表
        let mut stmt = conn
            .prepare(
                "SELECT id, project_id, name, display_name, comment, created_at, updated_at \
                 FROM t_table WHERE project_id = ?1 ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Error preparing tables statement: {}", e))?;

        let mut tables: Vec<TableDef> = stmt
            .query_map(params![project_id], |row| {
                Ok(TableDef {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    display_name: row.get(3)?,
                    comment: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    columns: Vec::new(),
                })
            })
            .map_err(|e| format!("Error querying tables: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Error reading tables: {}", e))?;

        if tables.is_empty() {
            return Ok(tables);
        }

        // 第 2 次查询：一次性取所有列（IN 子句）
        let table_ids: Vec<String> = tables.iter().map(|t| t.id.clone()).collect();
        let placeholders = std::iter::repeat("?")
            .take(table_ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT table_id, id, name, display_name, data_type, length, scale, nullable, \
                    primary_key, auto_increment, default_value, default_null, comment, sort_order \
             FROM t_column WHERE table_id IN ({}) ORDER BY table_id, sort_order",
            placeholders
        );

        let mut col_stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("Error preparing columns statement: {}", e))?;

        let params_iter = rusqlite::params_from_iter(table_ids.iter());
        let column_iter = col_stmt
            .query_map(params_iter, |row| {
                Ok(ColumnDef {
                    table_id: row.get(0)?,
                    id: row.get(1)?,
                    name: row.get(2)?,
                    display_name: row.get(3)?,
                    data_type: row.get(4)?,
                    length: row.get(5)?,
                    scale: row.get(6)?,
                    nullable: row.get(7)?,
                    primary_key: row.get(8)?,
                    auto_increment: row.get(9)?,
                    default_value: row.get(10)?,
                    default_null: row.get(11)?,
                    comment: row.get(12)?,
                    sort_order: row.get(13)?,
                })
            })
            .map_err(|e| format!("Error querying columns: {}", e))?;

        let mut columns_by_table: HashMap<String, Vec<ColumnDef>> = HashMap::new();
        for col in column_iter {
            let col = col.map_err(|e| format!("Error reading column: {}", e))?;
            columns_by_table
                .entry(col.table_id.clone())
                .or_default()
                .push(col);
        }

        for table in tables.iter_mut() {
            if let Some(cols) = columns_by_table.remove(&table.id) {
                table.columns = cols;
            }
        }

        Ok(tables)
    }

    fn get_table_by_id(&self, table_id: &str) -> Result<Option<TableDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn.prepare("SELECT * FROM t_table WHERE id = ?1")
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let mut table_iter = stmt.query_map(params![table_id], |row| {
            Ok(TableDef {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                display_name: row.get(3)?,
                comment: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                columns: Vec::new(),
            })
        }).map_err(|e| format!("Error querying table: {}", e))?;

        if let Some(table) = table_iter.next() {
            Ok(Some(table.map_err(|e| format!("Error reading table: {}", e))?))
        } else {
            Ok(None)
        }
    }

    fn save_table_structure(&self, project_id: i32, table: TableDef, columns: Vec<ColumnDef>) -> Result<(), String> {
        let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute_batch("PRAGMA foreign_keys = OFF")
            .map_err(|e| format!("Error disabling foreign keys: {}", e))?;

        let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

        tx.execute(
            "INSERT INTO t_table (id, project_id, name, display_name, comment, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now')) \
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, display_name=excluded.display_name, comment=excluded.comment, updated_at=datetime('now')",
            params![table.id, project_id, table.name, table.display_name, table.comment],
        ).map_err(|e| format!("Error saving table: {}", e))?;

        // 读取当前已存在的列 (id, name)，用于按列名匹配保留旧 id。
        // 背景：原先保存表结构是「先 DELETE 全部列再按前端 id 重插」。一旦前端重新生成了列 id
        // （例如「AI 修改表结构」会对所有列生成新 id），列 id 就会漂移；而 t_index_field.column_id
        // 仍指向旧 id → 成为孤儿，导出 SQL 时索引列会变成 '?'。
        // 这里改为按列名匹配：同名列沿用旧 id（索引引用与 init_data 的列名 key 都得以保留），
        // 仅对真正消失的列做删除并清理其索引字段引用。
        let old_columns: Vec<(String, String)> = {
            let mut stmt = tx
                .prepare("SELECT id, name FROM t_column WHERE table_id = ?1")
                .map_err(|e| format!("Error preparing statement: {}", e))?;
            let rows = stmt
                .query_map(params![table.id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| format!("Error querying existing columns: {}", e))?;
            let mut out = Vec::new();
            for row in rows {
                out.push(row.map_err(|e| format!("Error reading existing column: {}", e))?);
            }
            out
        };

        // name -> 旧 id（同名理论上不应出现，取第一个；其余同名旧列稍后按孤儿删除）
        let mut old_id_by_name: HashMap<String, String> = HashMap::new();
        for (id, name) in &old_columns {
            old_id_by_name.entry(name.clone()).or_insert(id.clone());
        }

        // 本次实际写入的列 id 集合（含沿用旧 id 与前端传入的新/旧 id），用于识别未被覆盖、需删除的孤儿列。
        // 注意：不能只看「按名匹配命中的旧 id」——手动改字段名时前端保留旧 id 但 name 变了，
        // 该列走前端 id 分支写入，旧 id 仍被占用，绝不能当孤儿删。
        let mut written_ids: Vec<String> = Vec::new();

        for column in &columns {
            // 同名列已存在且其旧 id 尚未被写过 → 沿用旧 id（保留索引引用）；
            // 否则使用前端传入的 id（新增列，或保留 id 但改了名的情况）
            let column_id = match old_id_by_name.get(&column.name) {
                Some(old_id) if !written_ids.contains(old_id) => old_id.clone(),
                _ => column.id.clone(),
            };
            tx.execute(
                "INSERT INTO t_column (id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, default_null, comment, sort_order) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
                 ON CONFLICT(id) DO UPDATE SET table_id=excluded.table_id, name=excluded.name, display_name=excluded.display_name, data_type=excluded.data_type, length=excluded.length, scale=excluded.scale, nullable=excluded.nullable, primary_key=excluded.primary_key, auto_increment=excluded.auto_increment, default_value=excluded.default_value, default_null=excluded.default_null, comment=excluded.comment, sort_order=excluded.sort_order",
                params![
                    column_id, table.id, column.name, column.display_name, column.data_type,
                    column.length, column.scale, column.nullable, column.primary_key, column.auto_increment,
                    column.default_value, column.default_null, column.comment, column.sort_order
                ],
            ).map_err(|e| format!("Error saving column: {}", e))?;
            written_ids.push(column_id);
        }

        // 删除本次未被写入覆盖的旧列（真正消失的列）。先清 t_index_field 引用，再删列，避免外键违反。
        for (old_id, _) in &old_columns {
            if written_ids.contains(old_id) {
                continue;
            }
            tx.execute("DELETE FROM t_index_field WHERE column_id = ?1", params![old_id])
                .map_err(|e| format!("Error deleting orphan index fields: {}", e))?;
            tx.execute("DELETE FROM t_column WHERE id = ?1", params![old_id])
                .map_err(|e| format!("Error deleting orphan column: {}", e))?;
        }

        // 删列可能清空某些索引的全部字段。索引没有任何字段时已无意义，删除这些空壳索引。
        tx.execute(
            "DELETE FROM t_index WHERE table_id = ?1 AND id NOT IN (SELECT DISTINCT index_id FROM t_index_field)",
            params![table.id],
        )
        .map_err(|e| format!("Error deleting empty indexes: {}", e))?;

        // 手动改字段名时（保留列 id、仅改 name），t_init_data 的 JSON key 仍是旧列名，会与新列名对不上而丢值。
        // 这里按「同 id 的 name 发生变化」识别改名，把该表 t_init_data 的 JSON key 从旧列名改为新列名。
        // 仅能覆盖「保留 id 的改名」（手动改名）；AI 改结构因前端重新生成 id 无法建立映射，不在处理范围。
        let new_name_by_id: HashMap<String, String> = columns
            .iter()
            .map(|c| (c.id.clone(), c.name.clone()))
            .collect();
        let rename_map: Vec<(String, String)> = old_columns
            .iter()
            .filter_map(|(old_id, old_name)| {
                if old_name.is_empty() {
                    return None;
                }
                new_name_by_id.get(old_id).and_then(|new_name| {
                    if new_name != old_name {
                        Some((old_name.clone(), new_name.clone()))
                    } else {
                        None
                    }
                })
            })
            .collect();

        if !rename_map.is_empty() {
            // 先收集所有 init_data 行（stmt 借用 tx，收集完再 execute，避免 rusqlite 连接重复借用）
            let init_rows: Vec<(i64, String)> = {
                let mut stmt = tx
                    .prepare("SELECT id, data FROM t_init_data WHERE table_id = ?1")
                    .map_err(|e| format!("Error preparing init_data statement: {}", e))?;
                let rows = stmt
                    .query_map(params![table.id], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })
                    .map_err(|e| format!("Error querying init_data: {}", e))?;
                let mut acc = Vec::new();
                for row in rows {
                    acc.push(row.map_err(|e| format!("Error reading init_data: {}", e))?);
                }
                acc
            };

            for (row_id, data_json) in init_rows {
                let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&data_json) else {
                    continue;
                };
                let Some(obj) = value.as_object_mut() else {
                    continue;
                };
                let mut changed = false;
                for (old_name, new_name) in &rename_map {
                    if let Some(v) = obj.remove(old_name) {
                        obj.insert(new_name.clone(), v);
                        changed = true;
                    }
                }
                if changed {
                    let new_json = serde_json::to_string(&value)
                        .map_err(|e| format!("Error serializing init_data: {}", e))?;
                    tx.execute(
                        "UPDATE t_init_data SET data = ?1 WHERE id = ?2",
                        params![new_json, row_id],
                    )
                    .map_err(|e| format!("Error updating init_data: {}", e))?;
                }
            }
        }

        tx.commit().map_err(|e| format!("Error committing transaction: {}", e))?;

        conn.execute_batch("PRAGMA foreign_keys = ON")
            .map_err(|e| format!("Error enabling foreign keys: {}", e))?;

        Ok(())
    }

    fn get_table_columns(&self, table_id: &str) -> Result<Vec<ColumnDef>, String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        let mut stmt = conn.prepare("SELECT id, table_id, name, display_name, data_type, length, scale, nullable, primary_key, auto_increment, default_value, default_null, comment, sort_order FROM t_column WHERE table_id = ?1 ORDER BY sort_order")
            .map_err(|e| format!("Error preparing statement: {}", e))?;

        let column_iter = stmt.query_map(params![table_id], |row| {
            Ok(ColumnDef {
                id: row.get(0)?,
                table_id: row.get(1)?,
                name: row.get(2)?,
                display_name: row.get(3)?,
                data_type: row.get(4)?,
                length: row.get(5)?,
                scale: row.get(6)?,
                nullable: row.get(7)?,
                primary_key: row.get(8)?,
                auto_increment: row.get(9)?,
                default_value: row.get(10)?,
                default_null: row.get::<_, bool>(11).unwrap_or(false),
                comment: row.get(12)?,
                sort_order: row.get(13)?,
            })
        }).map_err(|e| format!("Error querying columns: {}", e))?;

        let mut columns = Vec::new();
        for column in column_iter {
            columns.push(column.map_err(|e| format!("Error reading column: {}", e))?);
        }

        Ok(columns)
    }

    fn save_table_indexes(&self, table_id: &str, indexes: Vec<IndexDef>) -> Result<(), String> {
        let mut conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;
        let tx = conn.transaction().map_err(|e| format!("Error starting transaction: {}", e))?;

        tx.execute(
            "DELETE FROM t_index_field WHERE index_id IN (SELECT id FROM t_index WHERE table_id = ?1)",
            params![table_id],
        ).map_err(|e| format!("Error deleting old index fields: {}", e))?;

        tx.execute("DELETE FROM t_index WHERE table_id = ?1", params![table_id])
            .map_err(|e| format!("Error deleting old indexes: {}", e))?;

        for index in indexes {
            // 索引没有任何字段时无意义，直接丢弃，不保留空壳
            if index.fields.is_empty() {
                continue;
            }
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

        Ok(())
    }

    fn get_table_indexes(&self, table_id: &str) -> Result<Vec<IndexDef>, String> {
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

    fn get_init_data(&self, table_id: &str) -> Result<Vec<InitData>, String> {
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

    fn save_init_data(&self, table_id: &str, rows: Vec<String>) -> Result<(), String> {
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

        Ok(())
    }

    fn delete_init_data(&self, id: i64) -> Result<(), String> {
        let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

        conn.execute("DELETE FROM t_init_data WHERE id = ?1", params![id])
            .map_err(|e| format!("Error deleting init data: {}", e))?;

        Ok(())
    }

    fn delete_table(&self, table_id: &str) -> Result<(), String> {
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

        Ok(())
    }
}
