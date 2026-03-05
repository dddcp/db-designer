use std::collections::HashMap;
use rusqlite::{Connection, params};

use crate::db::{get_data_dir, get_database_path};

// 获取Git分支信息
#[tauri::command]
pub fn get_git_info() -> Result<HashMap<String, String>, String> {
    let data_dir = get_data_dir();
    let mut info = HashMap::new();

    // 获取当前分支
    let output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["branch", "--show-current"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    info.insert("branch".to_string(), branch);

    // 获取最新提交信息
    let commit_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .args(["log", "-1", "--pretty=format:%h %s"])
        .output()
        .map_err(|e| format!("Failed to execute git command: {}", e))?;

    let commit = String::from_utf8_lossy(&commit_output.stdout).trim().to_string();
    info.insert("latest_commit".to_string(), commit);

    Ok(info)
}

// 初始化Git仓库
#[tauri::command]
pub fn init_git_repository() -> Result<String, String> {
    let data_dir = get_data_dir();

    // 确保 data 目录存在
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("无法创建 data 目录: {}", e))?;

    // 1. git init
    let init_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(["init"])
        .output()
        .map_err(|e| format!("执行 git init 失败: {}", e))?;

    if !init_output.status.success() {
        let stderr = String::from_utf8_lossy(&init_output.stderr);
        return Err(format!("git init 失败: {}", stderr));
    }

    // 2. 从 settings 读取 git 配置
    let db_path = get_database_path();
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("无法打开数据库: {}", e))?;

    let get_setting = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM t_setting WHERE key = ?1",
            params![key],
            |row| row.get(0),
        ).ok()
    };

    let platform = get_setting("git_platform").unwrap_or_default();
    let token = get_setting("git_token").unwrap_or_default();
    let repo = get_setting("git_repository").unwrap_or_default();

    if token.is_empty() || repo.is_empty() {
        return Err("请先在设置中配置 Git Token 和仓库名称".to_string());
    }

    // 3. 构造 remote URL（Gitee 格式: https://用户名:token@gitee.com/repo.git）
    let remote_url = match platform.as_str() {
        "gitlab" => format!("https://oauth2:{}@gitlab.com/{}.git", token, repo),
        "gitee" => {
            let username = repo.split('/').next().unwrap_or("");
            format!("https://{}:{}@gitee.com/{}.git", username, token, repo)
        },
        _ => format!("https://{}@github.com/{}.git", token, repo),
    };

    // 移除已有的 origin（忽略错误，可能不存在）
    let _ = std::process::Command::new("git")
        .current_dir(&data_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(["remote", "remove", "origin"])
        .output();

    // 4. 添加 remote origin
    let remote_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(["remote", "add", "origin", &remote_url])
        .output()
        .map_err(|e| format!("添加 remote 失败: {}", e))?;

    if !remote_output.status.success() {
        let stderr = String::from_utf8_lossy(&remote_output.stderr);
        return Err(format!("添加 remote origin 失败: {}", stderr));
    }

    Ok("Git 仓库初始化成功".to_string())
}

// Git同步操作
#[tauri::command]
pub fn sync_git_repository(commit_message: String) -> Result<String, String> {
    let data_dir = get_data_dir();

    // 禁用交互式凭证提示，防止界面卡住
    let git_env = [
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_ASKPASS", ""),
        ("SSH_ASKPASS", ""),
    ];

    // 1. git add db_designer.db
    let add_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .envs(git_env.iter().copied())
        .args(["add", "db_designer.db"])
        .output()
        .map_err(|e| format!("执行 git add 失败: {}", e))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("git add 失败: {}", stderr));
    }

    // 2. git commit
    let msg = if commit_message.trim().is_empty() {
        "Auto sync: database changes".to_string()
    } else {
        commit_message
    };

    let commit_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .envs(git_env.iter().copied())
        .args(["commit", "-m", &msg])
        .output()
        .map_err(|e| format!("执行 git commit 失败: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        if stdout.contains("nothing to commit") || stderr.contains("nothing to commit") {
            return Ok("没有需要提交的更改".to_string());
        }
        return Err(format!("git commit 失败: {}", stderr));
    }

    // 3. git push
    let push_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .envs(git_env.iter().copied())
        .args(["push", "-u", "origin", "HEAD"])
        .output()
        .map_err(|e| format!("执行 git push 失败: {}", e))?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(format!("git push 失败: {}", stderr));
    }

    Ok("同步成功".to_string())
}
