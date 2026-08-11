use std::collections::HashMap;
use std::process::Command;

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

// 解析纯远程地址（不含凭证）。
// - Token：git2 运行时凭证回调注入，URL 保持纯净；
// - SSH：直接交给系统 git CLI，由其 ~/.ssh 配置与密钥完成认证。
fn resolve_git_remote(config: &GitConfig) -> Result<String, String> {
    match config.remote_mode {
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
                GitAuthType::Token => Ok(build_https_remote(&base_url, &repository)),
                GitAuthType::Ssh => build_ssh_remote(&base_url, &repository),
            }
        }
        GitRemoteMode::Custom => Ok(config
            .remote_url
            .as_deref()
            .ok_or_else(|| "请先配置自定义远程地址".to_string())?
            .trim()
            .to_string()),
    }
}

// ==================== SSH：系统 git CLI（简单，复用用户 ~/.ssh）====================

fn git_env() -> [(&'static str, &'static str); 3] {
    [
        ("GIT_TERMINAL_PROMPT", "0"),
        ("GIT_ASKPASS", ""),
        ("SSH_ASKPASS", ""),
    ]
}

fn ensure_origin_remote_cli(data_dir: &std::path::Path, remote_url: &str) -> Result<(), String> {
    let current_origin_output = Command::new("git")
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

        let set_url_output = Command::new("git")
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

    let add_origin_output = Command::new("git")
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

// SSH 同步：系统 git add/commit/force-push，认证由系统 git SSH 处理
fn sync_git_ssh(data_dir: &std::path::Path, remote_url: &str, msg: &str) -> Result<String, String> {
    let git_env = git_env();
    ensure_origin_remote_cli(data_dir, remote_url)?;

    let add_output = Command::new("git")
        .current_dir(data_dir)
        .envs(git_env.iter().copied())
        .args(["add", "db_designer.db"])
        .output()
        .map_err(|e| format!("执行 git add 失败: {}", e))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("git add 失败: {}", stderr));
    }

    let commit_output = Command::new("git")
        .current_dir(data_dir)
        .envs(git_env.iter().copied())
        .args(["commit", "-m", msg])
        .output()
        .map_err(|e| format!("执行 git commit 失败: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        if stdout.contains("nothing to commit") || stderr.contains("nothing to commit") {
            return Ok("git_nothing_to_commit".to_string());
        }
        return Err(format!("git commit 失败: {}", stderr));
    }

    let push_output = Command::new("git")
        .current_dir(data_dir)
        .envs(git_env.iter().copied())
        .args(["push", "-f", "-u", "origin", "HEAD"])
        .output()
        .map_err(|e| format!("执行 git push 失败: {}", e))?;

    if !push_output.status.success() {
        let stderr = String::from_utf8_lossy(&push_output.stderr);
        return Err(format!("git push 失败: {}", stderr));
    }

    Ok("git_sync_success".to_string())
}

// SSH 拉取：系统 git fetch + reset --hard origin/HEAD
fn pull_git_ssh(data_dir: &std::path::Path, remote_url: &str) -> Result<String, String> {
    let git_env = git_env();
    ensure_origin_remote_cli(data_dir, remote_url)?;

    let fetch_output = Command::new("git")
        .current_dir(data_dir)
        .envs(git_env.iter().copied())
        .args(["fetch", "origin"])
        .output()
        .map_err(|e| format!("执行 git fetch 失败: {}", e))?;

    if !fetch_output.status.success() {
        let stderr = String::from_utf8_lossy(&fetch_output.stderr);
        return Err(format!("git fetch 失败: {}", stderr));
    }

    let reset_output = Command::new("git")
        .current_dir(data_dir)
        .envs(git_env.iter().copied())
        .args(["reset", "--hard", "origin/HEAD"])
        .output()
        .map_err(|e| format!("执行 git reset 失败: {}", e))?;

    if !reset_output.status.success() {
        let stderr = String::from_utf8_lossy(&reset_output.stderr);
        return Err(format!("git reset 失败: {}", stderr));
    }

    Ok("git_pull_success".to_string())
}

// ==================== Token：git2（无需系统 git；凭证回调注入）====================

// 凭证回调载体：仅 Token 分支，按平台分派返回 userpass。
#[derive(Clone)]
struct GitCredentials {
    platform: Option<GitPlatform>,
    username: Option<String>,
    token: Option<String>,
}

impl GitCredentials {
    fn from_config(config: &GitConfig) -> Self {
        Self {
            platform: config.platform.clone(),
            username: config.username.clone(),
            token: config.token.clone(),
        }
    }

    // 构造 RemoteCallbacks：挂载凭证回调闭包，闭包以 owned 数据 move 进去，故为 'static。
    fn build_callbacks(&self) -> git2::RemoteCallbacks<'static> {
        let creds = self.clone();
        let mut callbacks = git2::RemoteCallbacks::new();
        callbacks.credentials(move |_url, _username_from_url, _cred_type| creds.resolve());
        callbacks
    }

    fn resolve(&self) -> Result<git2::Cred, git2::Error> {
        let token = self
            .token
            .as_deref()
            .ok_or_else(|| git2::Error::from_str("缺少 Git Token"))?;
        match self.platform.as_ref() {
            Some(GitPlatform::Github) => git2::Cred::userpass_plaintext(token, ""),
            Some(GitPlatform::Gitlab) => git2::Cred::userpass_plaintext("oauth2", token),
            Some(GitPlatform::Gitee) | Some(GitPlatform::Gitea) => {
                let user = self
                    .username
                    .as_deref()
                    .ok_or_else(|| git2::Error::from_str("缺少 Git 用户名"))?;
                git2::Cred::userpass_plaintext(user, token)
            }
            None => {
                let user = self
                    .username
                    .as_deref()
                    .ok_or_else(|| git2::Error::from_str("缺少 Git 用户名"))?;
                git2::Cred::userpass_plaintext(user, token)
            }
        }
    }
}

// 默认提交签名（不依赖系统 git 配置）
fn default_signature() -> Result<git2::Signature<'static>, String> {
    git2::Signature::now("DB Designer", "db-designer@local")
        .map_err(|e| format!("创建提交签名失败: {}", e))
}

// 基于 git2 维护 origin 远程：存在则 set-url，否则新增。URL 为纯地址（不含凭证）。
fn ensure_origin_remote(repo: &git2::Repository, remote_url: &str) -> Result<(), String> {
    let has_origin = repo
        .remotes()
        .map_err(|e| format!("读取 remote 列表失败: {}", e))?
        .iter()
        .any(|name| matches!(name, Ok(Some("origin"))));

    if has_origin {
        repo.remote_set_url("origin", remote_url)
            .map_err(|e| format!("更新 origin 失败: {}", e))?;
    } else {
        repo.remote("origin", remote_url)
            .map_err(|e| format!("添加 origin 失败: {}", e))?;
    }

    Ok(())
}

// 取当前分支简短名（detached 或无提交时返回 None）
fn current_branch_name(repo: &git2::Repository) -> Option<String> {
    repo.head()
        .ok()
        .filter(|head| head.is_branch())
        .and_then(|head| head.shorthand().ok().map(|s| s.to_string()))
}

// Token 同步：git2 add/commit/force-push，凭证回调注入
fn sync_git_token(
    config: &GitConfig,
    remote_url: &str,
    msg: &str,
) -> Result<String, String> {
    let data_dir = get_data_dir();
    let repo = git2::Repository::open(&data_dir)
        .map_err(|e| format!("打开仓库失败: {}", e))?;
    ensure_origin_remote(&repo, remote_url)?;

    let mut index = repo
        .index()
        .map_err(|e| format!("读取暂存区失败: {}", e))?;
    index
        .add_path(std::path::Path::new("db_designer.db"))
        .map_err(|e| format!("git add 失败: {}", e))?;
    index
        .write()
        .map_err(|e| format!("写入暂存区失败: {}", e))?;

    let tree_oid = index
        .write_tree()
        .map_err(|e| format!("write_tree 失败: {}", e))?;
    let tree = repo
        .find_tree(tree_oid)
        .map_err(|e| format!("查找 tree 失败: {}", e))?;

    let head = repo.head().ok();
    let parent = head.as_ref().and_then(|h| h.peel_to_commit().ok());

    let nothing_to_commit = match &parent {
        Some(p) => p
            .tree()
            .map(|parent_tree| parent_tree.id() == tree.id())
            .unwrap_or(false),
        None => false,
    };
    if nothing_to_commit {
        return Ok("git_nothing_to_commit".to_string());
    }

    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let signature = default_signature()?;
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        msg,
        &tree,
        &parents,
    )
    .map_err(|e| format!("git commit 失败: {}", e))?;

    let branch = current_branch_name(&repo).unwrap_or_else(|| "main".to_string());
    let refspec = format!("+HEAD:refs/heads/{}", branch);

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 失败: {}", e))?;
    let callbacks = GitCredentials::from_config(config).build_callbacks();
    let mut push_options = git2::PushOptions::new();
    push_options.remote_callbacks(callbacks);
    remote
        .push(&[refspec.as_str()], Some(&mut push_options))
        .map_err(|e| format!("git push 失败: {}", e))?;

    Ok("git_sync_success".to_string())
}

// Token 拉取：git2 fetch + reset --hard（凭证回调注入）
fn pull_git_token(config: &GitConfig, remote_url: &str) -> Result<String, String> {
    let data_dir = get_data_dir();
    let repo = git2::Repository::open(&data_dir)
        .map_err(|e| format!("打开仓库失败: {}", e))?;
    ensure_origin_remote(&repo, remote_url)?;

    let callbacks = GitCredentials::from_config(config).build_callbacks();
    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("查找 origin 失败: {}", e))?;
    remote
        .fetch(
            &["refs/heads/*:refs/remotes/origin/*"],
            Some(&mut fetch_options),
            None,
        )
        .map_err(|e| format!("git fetch 失败: {}", e))?;

    let target = repo
        .revparse_single("origin/HEAD")
        .or_else(|_| repo.revparse_single("FETCH_HEAD"))
        .map_err(|e| format!("解析远程引用失败: {}", e))?;
    repo.reset(&target, git2::ResetType::Hard, None)
        .map_err(|e| format!("git reset 失败: {}", e))?;

    Ok("git_pull_success".to_string())
}

// ==================== Tauri 命令 ====================

// 获取Git分支信息（git2，本地操作，两种认证模式通用）
#[tauri::command]
pub fn get_git_info() -> Result<HashMap<String, String>, String> {
    let data_dir = get_data_dir();
    let mut info = HashMap::new();

    let repo = match git2::Repository::open(&data_dir) {
        Ok(repo) => repo,
        Err(_) => {
            info.insert("branch".to_string(), String::new());
            info.insert("latest_commit".to_string(), String::new());
            return Ok(info);
        }
    };

    let head = repo.head().ok();

    let branch = head
        .as_ref()
        .filter(|h| h.is_branch())
        .and_then(|h| h.shorthand().ok().map(|s| s.to_string()))
        .unwrap_or_default();
    info.insert("branch".to_string(), branch);

    let latest_commit = head
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| {
            let id = c.id().to_string();
            let short = &id[..7.min(id.len())];
            let summary = c.summary().ok().flatten().unwrap_or("").to_string();
            format!("{} {}", short, summary)
        })
        .unwrap_or_default();
    info.insert("latest_commit".to_string(), latest_commit);

    Ok(info)
}

// 初始化Git仓库（git2 init + 设置 origin，无需认证，两种模式通用）
#[tauri::command]
pub fn init_git_repository() -> Result<String, String> {
    let data_dir = get_data_dir();

    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("无法创建 data 目录: {}", e))?;

    let repo = git2::Repository::init(&data_dir)
        .map_err(|e| format!("git init 失败: {}", e))?;

    let config = load_git_config()?;
    let remote = resolve_git_remote(&config)?;
    ensure_origin_remote(&repo, &remote)?;

    Ok("git_init_success".to_string())
}

// Git同步操作：Token 走 git2，SSH 走系统 git CLI
#[tauri::command]
pub fn sync_git_repository(commit_message: String) -> Result<String, String> {
    let data_dir = get_data_dir();
    let config = load_git_config()?;
    let remote = resolve_git_remote(&config)?;

    let msg = if commit_message.trim().is_empty() {
        "Auto sync: database changes"
    } else {
        &commit_message
    };

    match config.auth_type {
        GitAuthType::Ssh => sync_git_ssh(&data_dir, &remote, msg),
        GitAuthType::Token => sync_git_token(&config, &remote, msg),
    }
}

// 拉取远程数据：Token 走 git2，SSH 走系统 git CLI
#[tauri::command]
pub fn pull_git_repository() -> Result<String, String> {
    let data_dir = get_data_dir();
    let config = load_git_config()?;
    let remote = resolve_git_remote(&config)?;

    match config.auth_type {
        GitAuthType::Ssh => pull_git_ssh(&data_dir, &remote),
        GitAuthType::Token => pull_git_token(&config, &remote),
    }
}
