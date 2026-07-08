use tauri::{Manager, Theme};

/// 同步应用主题到操作系统窗口标题栏
/// Tauri 的 set_theme 在 macOS / Windows 11 上生效,Windows 10 系统限制不生效
#[tauri::command]
pub fn apply_window_theme(app: tauri::AppHandle, is_dark: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_theme(if is_dark { Some(Theme::Dark) } else { Some(Theme::Light) })
            .map_err(|e| format!("设置窗口主题失败: {}", e))?;
    }
    Ok(())
}
