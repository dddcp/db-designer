use std::collections::HashMap;

use crate::db::get_data_dir;
use crate::setting::load_local_settings;

#[derive(Clone, Debug, PartialEq)]
enum GitRemoteMode {
    Preset,
    Custom,
}

#[derive(Clone, Debug, PartialEq)]
enum GitPlatform {
    Github,
    Gitlab,
    Gitee,
    Gitea,
}

#[derive(Clone, Debug, PartialEq)]
enum GitAuthType {
    Token,
    Ssh,
}

#[derive(Clone, Debug)]
struct GitConfig {
    remote_mode: GitRemoteMode,
    platform: Option<GitPlatform>,
    base_url: Option<String>,
    repository: Option<String>,
    remote_url: Option<String>,
    auth_type: GitAuthType,
    username: Option<String>,
    token: Option<String>,
}

#[derive(Clone, Debug)]
struct ResolvedGitRemote {
    canonical_remote: String,
    push_remote: String,
}

impl GitPlatform {
    fn from_str(value: &str) -> Option<Self> {
        match value.trim().to_lowercase().as_str() {
            "github" => Some(Self::Github),
            "gitlab" => Some(Self::Gitlab),
            "gitee" => Some(Self::Gitee),
            "gitea" => Some(Self::Gitea),
            _ => None,
        }
    }

    fn default_base_url(&self) -> Option<&'static str> {
        match self {
            Self::Github => Some("https://github.com"),
            Self::Gitlab => Some("https://gitlab.com"),
            Self::Gitee => Some("https://gitee.com"),
            Self::Gitea => None,
        }
    }
}

fn get_setting(settings: &HashMap<String, String>, key: &str) -> Option<String> {
    settings
        .get(key)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

fn normalize_repository(repository: &str) -> Result<String, String> {
    let repository = repository.trim().trim_matches('/').to_string();

    if repository.is_empty() || !repository.contains('/') {
        return Err("仓库名称必须使用 owner/repo 格式".to_string());
    }

    Ok(repository)
}

fn is_http_remote(remote: &str) -> bool {
    remote.starts_with("https://") || remote.starts_with("http://")
}

fn is_ssh_remote(remote: &str) -> bool {
    remote.starts_with("git@") || remote.starts_with("ssh://")
}

fn build_https_remote(base_url: &str, repository: &str) -> String {
    format!("{}/{}.git", normalize_base_url(base_url), repository)
}

fn build_ssh_remote(base_url: &str, repository: &str) -> Result<String, String> {
    let normalized = normalize_base_url(base_url);
    let host = normalized
        .strip_prefix("https://")
        .or_else(|| normalized.strip_prefix("http://"))
        .unwrap_or(normalized.as_str())
        .trim_end_matches('/')
        .to_string();

    if host.is_empty() {
        return Err("Git 服务地址无效".to_string());
    }

    Ok(format!("git@{}:{}.git", host, repository))
}

fn inject_http_credentials(remote: &str, username: &str, password: &str) -> Result<String, String> {
    if let Some(without_scheme) = remote.strip_prefix("https://") {
        return Ok(format!("https://{}:{}@{}", username, password, without_scheme));
    }

    if let Some(without_scheme) = remote.strip_prefix("http://") {
        return Ok(format!("http://{}:{}@{}", username, password, without_scheme));
    }

    Err("仅支持为 HTTP/HTTPS 地址注入访问凭证".to_string())
}

fn build_push_remote(config: &GitConfig, canonical_remote: &str) -> Result<String, String> {
    if config.auth_type == GitAuthType::Ssh {
        return Ok(canonical_remote.to_string());
    }

    if !is_http_remote(canonical_remote) {
        return Err("Token 认证仅支持 HTTP/HTTPS 远程地址".to_string());
    }

    let token = config
        .token
        .as_deref()
        .ok_or_else(|| "请先在设置中配置 Git Token".to_string())?;

    match config.platform.as_ref() {
        Some(GitPlatform::Github) => inject_http_credentials(canonical_remote, token, ""),
        Some(GitPlatform::Gitlab) => inject_http_credentials(canonical_remote, "oauth2", token),
        Some(GitPlatform::Gitee) | Some(GitPlatform::Gitea) => {
            let username = config
                .username
                .as_deref()
                .or_else(|| config.repository.as_deref().and_then(|repo| repo.split('/').next()))
                .ok_or_else(|| "当前 Git 平台需要配置用户名".to_string())?;
            inject_http_credentials(canonical_remote, username, token)
        }
        None => {
            let username = config
                .username
                .as_deref()
                .ok_or_else(|| "自定义 HTTPS 远程使用 Token 认证时必须填写用户名".to_string())?;
            inject_http_credentials(canonical_remote, username, token)
        }
    }
}

fn load_git_config() -> Result<GitConfig, String> {
    let settings = load_local_settings()?;

    let remote_mode = match get_setting(&settings, "git_remote_mode").as_deref() {
        Some("custom") => GitRemoteMode::Custom,
        Some(_) => GitRemoteMode::Preset,
        None => {
            if get_setting(&settings, "git_remote_url").is_some() {
                GitRemoteMode::Custom
            } else {
                GitRemoteMode::Preset
            }
        }
    };

    let legacy_platform = get_setting(&settings, "git_platform");
    let legacy_repository = get_setting(&settings, "git_repository");
    let legacy_token = get_setting(&settings, "git_token");

    let auth_type = match get_setting(&settings, "git_auth_type").as_deref() {
        Some("ssh") => GitAuthType::Ssh,
        Some(_) => GitAuthType::Token,
        None => {
            if legacy_token.is_some() {
                GitAuthType::Token
            } else {
                GitAuthType::Ssh
            }
        }
    };

    let platform = legacy_platform
        .as_deref()
        .and_then(GitPlatform::from_str);

    let base_url = get_setting(&settings, "git_base_url");
    let repository = legacy_repository;
    let remote_url = get_setting(&settings, "git_remote_url");
    let username = get_setting(&settings, "git_username");
    let token = legacy_token;

    let config = GitConfig {
        remote_mode,
        platform,
        base_url,
        repository,
        remote_url,
        auth_type,
        username,
        token,
    };

    validate_git_config(&config)?;
    Ok(config)
}

fn validate_git_config(config: &GitConfig) -> Result<(), String> {
    match config.remote_mode {
        GitRemoteMode::Preset => {
            let platform = config
                .platform
                .as_ref()
                .ok_or_else(|| "请先选择 Git 平台".to_string())?;
            let repository = config
                .repository
                .as_deref()
                .ok_or_else(|| "请先配置仓库名称".to_string())?;
            normalize_repository(repository)?;

            if *platform == GitPlatform::Gitea {
                let base_url = config
                    .base_url
                    .as_deref()
                    .ok_or_else(|| "Gitea 模式需要配置服务地址".to_string())?;
                if !is_http_remote(&normalize_base_url(base_url)) {
                    return Err("Gitea 服务地址必须以 http:// 或 https:// 开头".to_string());
                }
            }

            if config.auth_type == GitAuthType::Token && config.token.is_none() {
                return Err("Token 认证需要配置访问令牌".to_string());
            }

            if config.auth_type == GitAuthType::Token
                && matches!(config.platform, Some(GitPlatform::Gitea))
                && config.username.is_none()
            {
                return Err("Gitea Token 认证需要配置用户名".to_string());
            }
        }
        GitRemoteMode::Custom => {
            let remote_url = config
                .remote_url
                .as_deref()
                .ok_or_else(|| "请先配置自定义远程地址".to_string())?;

            match config.auth_type {
                GitAuthType::Token => {
                    if !is_http_remote(remote_url) {
                        return Err("Token 认证仅支持 HTTP/HTTPS 自定义远程地址".to_string());
                    }
                    if config.token.is_none() {
                        return Err("Token 认证需要配置访问令牌".to_string());
                    }
                    if config.username.is_none() {
                        return Err("自定义 HTTPS 远程使用 Token 认证时必须配置用户名".to_string());
                    }
                }
                GitAuthType::Ssh => {
                    if !is_ssh_remote(remote_url) {
                        return Err("SSH 认证需要 SSH 格式的远程地址".to_string());
                    }
                }
            }
        }
    }

    Ok(())
}

fn resolve_git_remote(config: &GitConfig) -> Result<ResolvedGitRemote, String> {
    let canonical_remote = match config.remote_mode {
        GitRemoteMode::Preset => {
            let platform = config
                .platform
                .as_ref()
                .ok_or_else(|| "请先选择 Git 平台".to_string())?;
            let repository = normalize_repository(
                config
                    .repository
                    .as_deref()
                    .ok_or_else(|| "请先配置仓库名称".to_string())?,
            )?;
            let base_url = config
                .base_url
                .clone()
                .or_else(|| platform.default_base_url().map(str::to_string))
                .ok_or_else(|| "请先配置 Git 服务地址".to_string())?;

            match config.auth_type {
                GitAuthType::Token => build_https_remote(&base_url, &repository),
                GitAuthType::Ssh => build_ssh_remote(&base_url, &repository)?,
            }
        }
        GitRemoteMode::Custom => config
            .remote_url
            .as_deref()
            .ok_or_else(|| "请先配置自定义远程地址".to_string())?
            .trim()
            .to_string(),
    };

    let push_remote = build_push_remote(config, &canonical_remote)?;

    Ok(ResolvedGitRemote {
        canonical_remote,
        push_remote,
    })
}

fn git_env() -> [(&'static str, &'static str); 3] {
    [
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_ASKPASS", ""),
        ("SSH_ASKPASS", ""),
    ]
}

fn ensure_origin_remote(data_dir: &std::path::Path, remote_url: &str) -> Result<(), String> {
    let current_origin_output = std::process::Command::new("git")
        .current_dir(data_dir)
        .envs(git_env().iter().copied())
        .args(["remote", "get-url", "origin"])
        .output()
        .map_err(|e| format!("读取 origin 失败: {}", e))?;

    if current_origin_output.status.success() {
        let current_origin = String::from_utf8_lossy(&current_origin_output.stdout)
            .trim()
            .to_string();

        if current_origin == remote_url {
            return Ok(());
        }

        let set_url_output = std::process::Command::new("git")
            .current_dir(data_dir)
            .envs(git_env().iter().copied())
            .args(["remote", "set-url", "origin", remote_url])
            .output()
            .map_err(|e| format!("更新 origin 失败: {}", e))?;

        if !set_url_output.status.success() {
            let stderr = String::from_utf8_lossy(&set_url_output.stderr);
            return Err(format!("更新 remote origin 失败: {}", stderr));
        }

        return Ok(());
    }

    let add_origin_output = std::process::Command::new("git")
        .current_dir(data_dir)
        .envs(git_env().iter().copied())
        .args(["remote", "add", "origin", remote_url])
        .output()
        .map_err(|e| format!("添加 origin 失败: {}", e))?;

    if !add_origin_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_origin_output.stderr);
        return Err(format!("添加 remote origin 失败: {}", stderr));
    }

    Ok(())
}

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
        .envs(git_env().iter().copied())
        .args(["init"])
        .output()
        .map_err(|e| format!("执行 git init 失败: {}", e))?;

    if !init_output.status.success() {
        let stderr = String::from_utf8_lossy(&init_output.stderr);
        return Err(format!("git init 失败: {}", stderr));
    }

    // 2. 解析 Git 配置并更新 origin
    let config = load_git_config()?;
    let remote = resolve_git_remote(&config)?;
    ensure_origin_remote(&data_dir, &remote.canonical_remote)?;

    Ok("Git 仓库初始化成功".to_string())
}

// Git同步操作
#[tauri::command]
pub fn sync_git_repository(commit_message: String) -> Result<String, String> {
    let data_dir = get_data_dir();
    let git_env = git_env();

    let config = load_git_config()?;
    let remote = resolve_git_remote(&config)?;
    ensure_origin_remote(&data_dir, &remote.canonical_remote)?;

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

    // 3. git push (force push)
    let push_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .envs(git_env.iter().copied())
        .args(["push", "-f", "-u", &remote.push_remote, "HEAD"])
        .output()
        .map_err(|e| format!("执行 git push 失败: {}", e))?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(format!("git push 失败: {}", stderr));
    }

    Ok("同步成功".to_string())
}

// 拉取远程数据
#[tauri::command]
pub fn pull_git_repository() -> Result<String, String> {
    let data_dir = get_data_dir();
    let git_env = git_env();

    let config = load_git_config()?;
    let remote = resolve_git_remote(&config)?;
    ensure_origin_remote(&data_dir, &remote.canonical_remote)?;

    // 1. git fetch origin
    let fetch_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .envs(git_env.iter().copied())
        .args(["fetch", "origin"])
        .output()
        .map_err(|e| format!("执行 git fetch 失败: {}", e))?;

    if !fetch_output.status.success() {
        let stderr = String::from_utf8_lossy(&fetch_output.stderr);
        return Err(format!("git fetch 失败: {}", stderr));
    }

    // 2. git reset --hard origin/HEAD
    let reset_output = std::process::Command::new("git")
        .current_dir(&data_dir)
        .envs(git_env.iter().copied())
        .args(["reset", "--hard", "origin/HEAD"])
        .output()
        .map_err(|e| format!("执行 git reset 失败: {}", e))?;

    if !reset_output.status.success() {
        let stderr = String::from_utf8_lossy(&reset_output.stderr);
        return Err(format!("git reset 失败: {}", stderr));
    }

    Ok("拉取成功".to_string())
}
