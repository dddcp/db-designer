use std::collections::HashMap;
use rusqlite::params;

use crate::db::init_db;

// 获取设置
#[tauri::command]
pub fn get_setting(key: String) -> Result<Option<String>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT value FROM t_setting WHERE key = ?1")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let mut result = stmt.query_map(params![key], |row| {
        Ok(row.get(0)?)
    }).map_err(|e| format!("Error querying setting: {}", e))?;

    if let Some(value) = result.next() {
        value.map_err(|e| format!("Error reading setting: {}", e))
    } else {
        Ok(None)
    }
}

// 保存设置
#[tauri::command]
pub fn save_setting(key: String, value: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO t_setting (key, value, updated_at) VALUES (?1, ?2, datetime('now'))",
        params![key, value],
    ).map_err(|e| format!("Error saving setting: {}", e))?;

    Ok("设置保存成功".to_string())
}

// 删除设置
#[tauri::command]
pub fn delete_setting(key: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "DELETE FROM t_setting WHERE key = ?1",
        params![key],
    ).map_err(|e| format!("Error deleting setting: {}", e))?;

    Ok("设置删除成功".to_string())
}

// 获取所有设置
#[tauri::command]
pub fn get_all_settings() -> Result<HashMap<String, String>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare("SELECT key, value FROM t_setting")
        .map_err(|e| format!("Error preparing statement: {}", e))?;

    let setting_iter = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?
        ))
    }).map_err(|e| format!("Error querying settings: {}", e))?;

    let mut settings = HashMap::new();
    for setting in setting_iter {
        let (key, value) = setting.map_err(|e| format!("Error reading setting: {}", e))?;
        settings.insert(key, value);
    }

    Ok(settings)
}
