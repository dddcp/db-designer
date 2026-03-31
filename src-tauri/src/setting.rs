use std::collections::HashMap;

use crate::services::setting_service::SettingsService;

pub fn load_local_settings() -> Result<HashMap<String, String>, String> {
    SettingsService::new().get_local_settings()
}

#[tauri::command]
pub fn get_local_settings() -> Result<HashMap<String, String>, String> {
    load_local_settings()
}

#[tauri::command]
pub fn save_local_setting(key: String, value: String) -> Result<String, String> {
    SettingsService::new().save_local_setting(key, value)
}

#[tauri::command]
pub fn delete_local_setting(key: String) -> Result<String, String> {
    SettingsService::new().delete_local_setting(key)
}

// 获取设置
#[tauri::command]
pub fn get_setting(key: String) -> Result<Option<String>, String> {
    SettingsService::new().get_setting(key)
}

// 保存设置
#[tauri::command]
pub fn save_setting(key: String, value: String) -> Result<String, String> {
    SettingsService::new().save_setting(key, value)
}

// 删除设置
#[tauri::command]
pub fn delete_setting(key: String) -> Result<String, String> {
    SettingsService::new().delete_setting(key)
}

// 获取所有设置
#[tauri::command]
pub fn get_all_settings() -> Result<HashMap<String, String>, String> {
    SettingsService::new().get_all_settings()
}
