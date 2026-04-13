use std::collections::HashMap;

use crate::storage::{LocalSettingsStore, SettingStore};
use crate::storage::sqlite::local_settings_store::JsonLocalSettingsStore;
use crate::storage::sqlite::setting_store::SqliteSettingStore;

const LOCAL_SETTING_KEYS: [&str; 12] = [
    "ai_base_url",
    "ai_api_key",
    "ai_model",
    "ai_design_common_prompt",
    "git_remote_mode",
    "git_platform",
    "git_base_url",
    "git_repository",
    "git_remote_url",
    "git_auth_type",
    "git_username",
    "git_token",
];

pub struct SettingsService {
    local_store: Box<dyn LocalSettingsStore>,
    setting_store: Box<dyn SettingStore>,
}

impl SettingsService {
    pub fn new() -> Self {
        Self {
            local_store: Box::new(JsonLocalSettingsStore::new()),
            setting_store: Box::new(SqliteSettingStore::new()),
        }
    }

    fn is_local_setting_key(&self, key: &str) -> bool {
        LOCAL_SETTING_KEYS.contains(&key)
    }

    pub fn get_local_settings(&self) -> Result<HashMap<String, String>, String> {
        let mut settings = self.local_store.load_settings()?;
        let mut migrated = false;

        for key in LOCAL_SETTING_KEYS {
            if settings.contains_key(key) {
                continue;
            }

            if let Some(value) = self.setting_store.get_setting(key)? {
                settings.insert(key.to_string(), value);
                self.setting_store.delete_setting(key)?;
                migrated = true;
            }
        }

        if migrated {
            self.local_store.save_settings(&settings)?;
        }

        Ok(settings)
    }

    pub fn save_local_setting(&self, key: String, value: String) -> Result<String, String> {
        if !self.is_local_setting_key(&key) {
            return Err(format!("Unsupported local setting key: {}", key));
        }

        let mut settings = self.get_local_settings()?;
        settings.insert(key.clone(), value);
        self.local_store.save_settings(&settings)?;
        self.setting_store.delete_setting(&key)?;

        Ok("本地设置保存成功".to_string())
    }

    pub fn delete_local_setting(&self, key: String) -> Result<String, String> {
        if !self.is_local_setting_key(&key) {
            return Err(format!("Unsupported local setting key: {}", key));
        }

        let mut settings = self.get_local_settings()?;
        settings.remove(&key);
        self.local_store.save_settings(&settings)?;
        self.setting_store.delete_setting(&key)?;

        Ok("本地设置删除成功".to_string())
    }

    pub fn get_setting(&self, key: String) -> Result<Option<String>, String> {
        self.setting_store.get_setting(&key)
    }

    pub fn save_setting(&self, key: String, value: String) -> Result<String, String> {
        self.setting_store.save_setting(&key, &value)?;
        Ok("设置保存成功".to_string())
    }

    pub fn delete_setting(&self, key: String) -> Result<String, String> {
        self.setting_store.delete_setting(&key)?;
        Ok("设置删除成功".to_string())
    }

    pub fn get_all_settings(&self) -> Result<HashMap<String, String>, String> {
        self.setting_store.get_all_settings()
    }
}
