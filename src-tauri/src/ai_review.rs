use serde::{Deserialize, Serialize};
use crate::db::init_db;

/// AI 评审记录
#[derive(Debug, Serialize, Deserialize)]
pub struct AiReview {
    pub id: i64,
    pub project_id: i32,
    pub title: String,
    pub result: String,
    pub created_at: String,
}

/// 获取项目的 AI 评审记录列表，按 created_at 倒序
#[tauri::command]
pub fn get_ai_reviews(project_id: i32) -> Result<Vec<AiReview>, String> {
    let conn = init_db().map_err(|e| format!("数据库连接失败: {}", e))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, title, result, created_at FROM t_ai_review WHERE project_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| format!("查询失败: {}", e))?;

    let reviews = stmt
        .query_map([project_id], |row| {
            Ok(AiReview {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                result: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("查询失败: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取数据失败: {}", e))?;

    Ok(reviews)
}

/// 保存 AI 评审记录，插入后返回新记录
#[tauri::command]
pub fn save_ai_review(project_id: i32, title: String, result: String) -> Result<AiReview, String> {
    let conn = init_db().map_err(|e| format!("数据库连接失败: {}", e))?;
    conn.execute(
        "INSERT INTO t_ai_review (project_id, title, result) VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, title, result],
    )
    .map_err(|e| format!("插入失败: {}", e))?;

    let id = conn.last_insert_rowid();
    let review = conn
        .query_row(
            "SELECT id, project_id, title, result, created_at FROM t_ai_review WHERE id = ?1",
            [id],
            |row| {
                Ok(AiReview {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    title: row.get(2)?,
                    result: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| format!("查询新记录失败: {}", e))?;

    Ok(review)
}

/// 删除指定 AI 评审记录
#[tauri::command]
pub fn delete_ai_review(id: i64) -> Result<(), String> {
    let conn = init_db().map_err(|e| format!("数据库连接失败: {}", e))?;
    conn.execute("DELETE FROM t_ai_review WHERE id = ?1", [id])
        .map_err(|e| format!("删除失败: {}", e))?;
    Ok(())
}
