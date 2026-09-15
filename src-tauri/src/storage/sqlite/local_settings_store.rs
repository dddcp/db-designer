use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::db::get_data_dir;
use crate::storage::LocalSettingsStore;

const LOCAL_SETTINGS_FILE: &str = "settings.json";

pub struct JsonLocalSettingsStore;

impl JsonLocalSettingsStore {
    pub fn new() -> Self {
        Self
    }

    fn get_local_settings_path(&self) -> PathBuf {
        get_data_dir().join(LOCAL_SETTINGS_FILE)
    }
}

impl LocalSettingsStore for JsonLocalSettingsStore {
    fn load_settings(&self) -> Result<HashMap<String, String>, String> {
        let settings_path = self.get_local_settings_path();

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

    fn save_settings(&self, settings: &HashMap<String, String>) -> Result<(), String> {
        let data_dir = get_data_dir();
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Error creating data directory: {}", e))?;
        // 安全：settings.json 存放 ai_api_key / git_token / 数据库连接凭据，
        // 目录与文件必须仅限属主访问（仅 Unix 生效）
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&data_dir, fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("Error setting data directory permissions: {}", e))?;
        }

        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Error serializing local settings: {}", e))?;

        fs::write(self.get_local_settings_path(), content)
            .map_err(|e| format!("Error writing local settings file: {}", e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                self.get_local_settings_path(),
                fs::Permissions::from_mode(0o600),
            )
            .map_err(|e| format!("Error setting settings file permissions: {}", e))?;
        }

        Ok(())
    }
}
