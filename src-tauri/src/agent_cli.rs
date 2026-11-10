//! Agent CLI 托管命令（薄命令层，业务逻辑在 services/agent_cli_service）

use crate::services::agent_cli_service::{self, CliStatus};

/// 获取 CLI 托管状态（已装版本 / 最新版本 / skill 落后 / PATH / 多副本）
#[tauri::command]
pub async fn cli_get_status() -> Result<CliStatus, String> {
    agent_cli_service::get_status().await
}

/// 安装 CLI（下载最新 Release → sha256 校验 → 原子落盘 → 注册 PATH）
#[tauri::command]
pub async fn cli_install() -> Result<String, String> {
    agent_cli_service::install_or_update().await
}

/// 更新 CLI 到最新版本（与安装同一流程）
#[tauri::command]
pub async fn cli_update() -> Result<String, String> {
    agent_cli_service::install_or_update().await
}

/// 卸载 CLI（删二进制、移除 PATH 条目、清理 skill；数据不动）
#[tauri::command]
pub async fn cli_uninstall() -> Result<String, String> {
    agent_cli_service::uninstall().await
}

/// 安装/更新 skill 到指定预设目标与（可选）自定义 skills 根目录，返回写入路径
#[tauri::command]
pub fn cli_install_skill(
    targets: Vec<String>,
    custom_dir: Option<String>,
) -> Result<Vec<String>, String> {
    agent_cli_service::install_skills(targets, custom_dir)
}

/// 检测 PATH 上其他来源的 dbd 副本（多副本警告）
#[tauri::command]
pub fn cli_check_copies() -> Result<Vec<String>, String> {
    Ok(agent_cli_service::check_copies())
}
