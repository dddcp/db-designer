use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use rusqlite::params;

use crate::db::{get_data_dir, init_db};

const LOCAL_SETTINGS_FILE: &str = "settings.json";
const LOCAL_SETTING_KEYS: [&str; 6] = [
    "ai_base_url",
    "ai_api_key",
    "ai_model",
    "git_platform",
    "git_token",
    "git_repository",
];

fn get_local_settings_path() -> PathBuf {
    get_data_dir().join(LOCAL_SETTINGS_FILE)
}

fn is_local_setting_key(key: &str) -> bool {
    LOCAL_SETTING_KEYS.contains(&key)
}

fn read_local_settings_file() -> Result<HashMap<String, String>, String> {
    let settings_path = get_local_settings_path();

    if !settings_path.exists() {
        return Ok(HashMap::new());
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Error reading local settings file: {}", e))?;

    if content.trim().is_empty() {
        return Ok(HashMap::new());
    }

    serde_json::from_str(&content)
        .map_err(|e| format!("Error parsing local settings file: {}", e))
}

fn write_local_settings_file(settings: &HashMap<String, String>) -> Result<(), String> {
    let data_dir = get_data_dir();
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Error creating data directory: {}", e))?;

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Error serializing local settings: {}", e))?;

    fs::write(get_local_settings_path(), content)
        .map_err(|e| format!("Error writing local settings file: {}", e))?;

    Ok(())
}

fn get_sqlite_setting(key: &str) -> Result<Option<String>, String> {
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

fn delete_sqlite_setting(key: &str) -> Result<(), String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "DELETE FROM t_setting WHERE key = ?1",
        params![key],
    ).map_err(|e| format!("Error deleting setting: {}", e))?;

    Ok(())
}

pub fn load_local_settings() -> Result<HashMap<String, String>, String> {
    let mut settings = read_local_settings_file()?;
    let mut migrated = false;

    for key in LOCAL_SETTING_KEYS {
        if settings.contains_key(key) {
            continue;
        }

        if let Some(value) = get_sqlite_setting(key)? {
            settings.insert(key.to_string(), value);
            delete_sqlite_setting(key)?;
            migrated = true;
        }
    }

    if migrated {
        write_local_settings_file(&settings)?;
    }

    Ok(settings)
}

#[tauri::command]
pub fn get_local_settings() -> Result<HashMap<String, String>, String> {
    load_local_settings()
}

#[tauri::command]
pub fn save_local_setting(key: String, value: String) -> Result<String, String> {
    if !is_local_setting_key(&key) {
        return Err(format!("Unsupported local setting key: {}", key));
    }

    let mut settings = load_local_settings()?;
    settings.insert(key.clone(), value);
    write_local_settings_file(&settings)?;
    delete_sqlite_setting(&key)?;

    Ok("本地设置保存成功".to_string())
}

#[tauri::command]
pub fn delete_local_setting(key: String) -> Result<String, String> {
    if !is_local_setting_key(&key) {
        return Err(format!("Unsupported local setting key: {}", key));
    }

    let mut settings = load_local_settings()?;
    settings.remove(&key);
    write_local_settings_file(&settings)?;
    delete_sqlite_setting(&key)?;

    Ok("本地设置删除成功".to_string())
}

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
