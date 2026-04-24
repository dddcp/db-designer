use serde::{Deserialize, Serialize};
use crate::db::init_db;

/// AI SQL 对话记录
#[derive(Debug, Serialize, Deserialize)]
pub struct AiSqlConversation {
    pub id: i64,
    pub project_id: i32,
    pub title: String,
    pub messages: String,
    pub database_type: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 获取项目的 AI SQL 对话列表，按 updated_at 倒序
#[tauri::command]
pub fn get_ai_sql_conversations(project_id: i32) -> Result<Vec<AiSqlConversation>, String> {
    let conn = init_db().map_err(|e| format!("db_connection_failed: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, messages, database_type, created_at, updated_at FROM t_ai_sql_conversation WHERE project_id = ?1 ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("query_failed: {}", e))?;

    let conversations = stmt
        .query_map([project_id], |row| {
            Ok(AiSqlConversation {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                messages: row.get(3)?,
                database_type: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("query_failed: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read_data_failed: {}", e))?;

    Ok(conversations)
}

/// 保存 AI SQL 对话（新建或更新）
#[tauri::command]
pub fn save_ai_sql_conversation(
    id: Option<i64>,
    project_id: i32,
    title: String,
    messages: String,
    database_type: String,
) -> Result<AiSqlConversation, String> {
    let conn = init_db().map_err(|e| format!("db_connection_failed: {}", e))?;

    if let Some(conv_id) = id {
        // 更新已有对话
        conn.execute(
            "UPDATE t_ai_sql_conversation SET title = ?1, messages = ?2, database_type = ?3, updated_at = datetime('now') WHERE id = ?4",
            rusqlite::params![title, messages, database_type, conv_id],
        )
        .map_err(|e| format!("update_failed: {}", e))?;

        let conversation = conn
            .query_row(
                "SELECT id, project_id, title, messages, database_type, created_at, updated_at FROM t_ai_sql_conversation WHERE id = ?1",
                [conv_id],
                |row| {
                    Ok(AiSqlConversation {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        title: row.get(2)?,
                        messages: row.get(3)?,
                        database_type: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| format!("query_updated_failed: {}", e))?;

        Ok(conversation)
    } else {
        // 创建新对话
        conn.execute(
            "INSERT INTO t_ai_sql_conversation (project_id, title, messages, database_type) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![project_id, title, messages, database_type],
        )
        .map_err(|e| format!("insert_failed: {}", e))?;

        let new_id = conn.last_insert_rowid();
        let conversation = conn
            .query_row(
                "SELECT id, project_id, title, messages, database_type, created_at, updated_at FROM t_ai_sql_conversation WHERE id = ?1",
                [new_id],
                |row| {
                    Ok(AiSqlConversation {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        title: row.get(2)?,
                        messages: row.get(3)?,
                        database_type: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| format!("query_new_record_failed: {}", e))?;

        Ok(conversation)
    }
}

/// 删除指定 AI SQL 对话
#[tauri::command]
pub fn delete_ai_sql_conversation(id: i64) -> Result<(), String> {
    let conn = init_db().map_err(|e| format!("db_connection_failed: {}", e))?;
    conn.execute("DELETE FROM t_ai_sql_conversation WHERE id = ?1", [id])
        .map_err(|e| format!("delete_failed: {}", e))?;
    Ok(())
}