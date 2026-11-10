//! Agent CLI（dbd）托管安装/更新/卸载服务
//!
//! 职责：状态检测、GitHub Release 下载与 sha256 校验、原子落盘、
//! 用户 PATH 注册（Windows 注册表）、skill 部署、多副本检测与卸载清理。
//! 遵循 command → service 分层；CLI 与桌面端同 tag 发布（lockstep），
//! 桌面端自身版本即可代表"当前应安装的 CLI 版本"。

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::services::setting_service::SettingsService;
use crate::skill_targets;

/// GitHub 仓库（owner/repo），Release 资产由 CI 的 dbd 构建步骤附带
const GITHUB_REPO: &str = "dddcp/db-designer";
/// 网络超时（秒）
const HTTP_TIMEOUT_SECS: u64 = 120;
/// 代理设置键（settings.json，经 setting_service 通用 KV 存取）
const SETTING_PROXY: &str = "cli_proxy_url";
/// 镜像前缀设置键（如 ghproxy 类服务，拼接在 GitHub URL 之前）
const SETTING_MIRROR: &str = "cli_mirror_url";

/// 单个 skill 目标的状态
#[derive(Serialize)]
pub struct SkillStatusInfo {
    pub id: String,
    pub name: String,
    /// 用户级 skills 根目录（无法解析主目录时为空串）
    pub root: String,
    /// 已安装的 skill 版本
    pub installed_version: Option<String>,
    /// 已安装但落后于当前 CLI 版本
    pub outdated: bool,
}

/// CLI 整体状态（设置页卡片数据源）
#[derive(Serialize)]
pub struct CliStatus {
    /// 安装目录中存在可执行文件
    pub installed: bool,
    /// 实测版本（spawn `dbd --version` 解析）
    pub installed_version: Option<String>,
    pub install_dir: String,
    /// GitHub 最新版本（查询失败时为 None，原因见 latest_error）
    pub latest_version: Option<String>,
    /// 最新版本 > 已安装版本
    pub update_available: bool,
    /// 安装目录已注册进 PATH（Windows 用户 PATH / Unix 已在 PATH 环境）
    pub path_registered: bool,
    /// PATH 上发现的其他来源同名可执行文件（多副本警告）
    pub copies: Vec<String>,
    pub skills: Vec<SkillStatusInfo>,
    /// 最新版本查询失败原因（不阻断状态展示）
    pub latest_error: Option<String>,
}

// ============ 路径与平台 ============

/// CLI 安装目录：Windows %LOCALAPPDATA%\db-designer\bin；Unix ~/.local/bin
pub fn install_dir() -> PathBuf {
    #[cfg(windows)]
    {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("db-designer")
            .join("bin")
    }
    #[cfg(not(windows))]
    {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".local/bin")
    }
}

/// CLI 可执行文件路径
fn cli_exe_path() -> PathBuf {
    install_dir().join(exe_file_name())
}

/// 可执行文件名（带扩展名）
fn exe_file_name() -> String {
    if cfg!(windows) {
        "dbd.exe".to_string()
    } else {
        "dbd".to_string()
    }
}

/// 当前平台对应的 Release 资产三元组（与 CI 矩阵一致）
fn current_triple() -> &'static str {
    if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else if cfg!(target_arch = "aarch64") {
        "aarch64-unknown-linux-gnu"
    } else {
        "x86_64-unknown-linux-gnu"
    }
}

/// 二进制资产名（dbd-<triple>(.exe)）
fn asset_exe_name() -> String {
    format!("dbd-{}{}", current_triple(), if cfg!(windows) { ".exe" } else { "" })
}

// ============ 设置读取 ============

/// 读取本地设置键值（settings.json 通用 KV）
fn local_setting(key: &str) -> Option<String> {
    SettingsService::new()
        .get_local_settings()
        .ok()?
        .get(key)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 镜像前缀（去除尾斜杠；未配置返回空串）
fn mirror_prefix() -> String {
    local_setting(SETTING_MIRROR)
        .map(|s| s.trim_end_matches('/').to_string())
        .unwrap_or_default()
}

/// 构建 HTTP 客户端（应用层代理来自设置）
async fn http_client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent("db-designer-desktop");
    if let Some(proxy) = local_setting(SETTING_PROXY) {
        let proxy = reqwest::Proxy::all(&proxy)
            .map_err(|e| format!("代理地址无效（{}）：{}", proxy, e))?;
        builder = builder.proxy(proxy);
    }
    builder
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))
}

// ============ 版本查询 ============

/// 查询 GitHub 最新发布版本（tag 去 v 前缀，semver 校验）
async fn query_latest_version(client: &reqwest::Client) -> Result<String, String> {
    let url = format!(
        "{}https://api.github.com/repos/{}/releases/latest",
        mirror_prefix(),
        GITHUB_REPO
    );
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("访问 GitHub 失败：{}（可在设置中配置代理或镜像）", e))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub 返回 {}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析发布数据失败：{}", e))?;
    let tag = json["tag_name"]
        .as_str()
        .ok_or("发布数据缺少 tag_name")?
        .trim_start_matches('v')
        .to_string();
    semver::Version::parse(&tag).map_err(|_| format!("版本号无法解析：{}", tag))?;
    Ok(tag)
}

/// 实测已安装 CLI 版本：spawn `dbd --version` 解析（不存在/无法执行返回 None）
async fn installed_version(exe: &Path) -> Option<String> {
    let exe = exe.to_path_buf();
    let output = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new(&exe).arg("--version").output().ok()
    })
    .await
    .ok()??;
    let text = String::from_utf8_lossy(&output.stdout);
    text.split_whitespace().next_back().map(|s| s.trim().to_string())
}

// ============ PATH 扫描（多副本检测，跨平台） ============

/// 除本应用安装目录外，PATH 上是否存在同名 dbd 可执行文件
pub fn check_copies() -> Vec<String> {
    let exe_name = exe_file_name();
    let own = install_dir();
    let split = if cfg!(windows) { ';' } else { ':' };
    std::env::var("PATH")
        .map(|paths| {
            paths
                .split(split)
                .filter(|p| !p.trim().is_empty())
                .map(PathBuf::from)
                .filter(|p| !same_dir(p, &own))
                .filter(|p| p.join(&exe_name).is_file())
                .map(|p| p.join(&exe_name).display().to_string())
                .collect()
        })
        .unwrap_or_default()
}

/// 目录等价比较（Windows 大小写不敏感）
fn same_dir(a: &Path, b: &Path) -> bool {
    if cfg!(windows) {
        a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
    } else {
        a == b
    }
}

// ============ PATH 注册（平台分派） ============

/// 将安装目录加入用户 PATH（仅追加、不重复）；返回给用户的结果提示
pub fn register_path() -> Result<String, String> {
    #[cfg(windows)]
    {
        win_path::ensure_in_user_path(&install_dir())?;
        Ok("已将安装目录加入用户 PATH（对新启动的进程生效，可能需要重新打开终端）。".to_string())
    }
    #[cfg(not(windows))]
    {
        let dir = install_dir();
        let in_path = std::env::var("PATH")
            .map(|paths| paths.split(':').any(|p| Path::new(p) == dir))
            .unwrap_or(false);
        if in_path {
            Ok("安装目录已在 PATH 中。".to_string())
        } else {
            Ok(format!(
                "提示：{} 不在 PATH 中，请手动加入（例如在 shell 配置中添加 export PATH=\"$PATH:{}\"）。",
                dir.display(),
                dir.display()
            ))
        }
    }
}

/// 从用户 PATH 中移除安装目录（卸载用；仅移除本应用添加的条目）
#[cfg_attr(not(windows), allow(dead_code))]
fn remove_from_path() -> Result<(), String> {
    #[cfg(windows)]
    {
        win_path::remove_from_user_path(&install_dir())
    }
    #[cfg(not(windows))]
    {
        // Unix 下不自动改 shell 配置，卸载时仅在结果中提示
        let _ = install_dir();
        Ok(())
    }
}

// ============ Windows 用户 PATH（注册表 raw 读写，保留 REG_EXPAND_SZ） ============

#[cfg(windows)]
mod win_path {
    use std::path::Path;

    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_EXPAND_SZ};
    use winreg::{RegKey, RegValue};

    /// 用户 Path 条目集合（保留原始展开变量语义由 raw 读写保证）
    fn read_entries() -> Result<(Vec<String>, RegValue), String> {
        let hk = RegKey::predef(HKEY_CURRENT_USER);
        let env = hk
            .open_subkey_with_flags("Environment", KEY_READ)
            .map_err(|e| format!("打开注册表 Environment 失败：{}", e))?;
        let value = match env.get_raw_value("Path") {
            Ok(v) => v,
            Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => RegValue {
                bytes: Vec::new(),
                vtype: REG_EXPAND_SZ,
            },
            Err(e) => return Err(format!("读取用户 Path 失败：{}", e)),
        };
        let (text, raw) = (decode_reg_string(&value), value);
        // 过滤空条目（注册表常见尾随分号），避免写回时产生空段
        let entries: Vec<String> = text
            .split(';')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        Ok((entries, raw))
    }

    /// REG_SZ / REG_EXPAND_SZ 的字节流按 UTF-16 解码（其他类型按 lossy 处理）
    fn decode_reg_string(value: &RegValue) -> String {
        let pairs: Vec<u16> = value
            .bytes
            .chunks(2)
            .map(|c| u16::from_le_bytes([c[0], *c.get(1).unwrap_or(&0)]))
            .collect();
        String::from_utf16_lossy(&pairs)
            .trim_matches('\0')
            .to_string()
    }

    fn encode_reg_string(text: &str, vtype: winreg::enums::RegType) -> RegValue {
        let mut bytes: Vec<u8> = text
            .encode_utf16()
            .flat_map(|u| u.to_le_bytes())
            .collect();
        bytes.extend_from_slice(&[0, 0]); // 双 NUL 结尾
        RegValue { bytes, vtype }
    }

    fn write_entries(entries: &[String], template: RegValue) -> Result<(), String> {
        let joined = entries.join(";");
        let hk = RegKey::predef(HKEY_CURRENT_USER);
        let env = hk
            .open_subkey_with_flags("Environment", KEY_WRITE)
            .map_err(|e| format!("打开注册表 Environment（写）失败：{}", e))?;
        env.set_raw_value("Path", &encode_reg_string(&joined, template.vtype))
            .map_err(|e| format!("写入用户 Path 失败：{}", e))?;
        broadcast_env_change();
        Ok(())
    }

    /// 追加安装目录（存在则不重复追加）
    pub fn ensure_in_user_path(dir: &Path) -> Result<(), String> {
        let (mut entries, template) = read_entries()?;
        let dir_text = dir.to_string_lossy().to_string();
        if entries
            .iter()
            .any(|e| e.eq_ignore_ascii_case(&dir_text))
        {
            return Ok(());
        }
        entries.push(dir_text);
        // 原值未设置时使用 REG_EXPAND_SZ（兼容 %VAR% 引用）
        write_entries(&entries, template)
    }

    /// 移除安装目录条目（不存在则不动）
    pub fn remove_from_user_path(dir: &Path) -> Result<(), String> {
        let (entries, template) = read_entries()?;
        let dir_text = dir.to_string_lossy().to_string();
        let kept: Vec<String> = entries
            .iter()
            .filter(|e| !e.eq_ignore_ascii_case(&dir_text))
            .cloned()
            .collect();
        if kept.len() == entries.len() {
            return Ok(()); // 条目不存在，无需写回
        }
        write_entries(&kept, template)
    }

    /// 用户 Path 是否包含指定目录（大小写不敏感）
    pub fn user_path_contains(dir: &Path) -> bool {
        match read_entries() {
            Ok((entries, _)) => {
                let dir_text = dir.to_string_lossy().to_string();
                entries.iter().any(|e| e.eq_ignore_ascii_case(&dir_text))
            }
            Err(_) => false,
        }
    }

    /// 广播环境变量变更（失败不阻断：新终端兜底生效）
    fn broadcast_env_change() {
        use windows_sys::Win32::Foundation::HWND;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
        };
        let mut param: Vec<u16> = "Environment".encode_utf16().collect();
        param.push(0);
        let mut result: usize = 0;
        // HWND_BROADCAST 广播；超时 2 秒；失败静默（UI 已有"重开终端"提示兜底）
        unsafe {
            SendMessageTimeoutW(
                HWND_BROADCAST as HWND,
                WM_SETTINGCHANGE,
                0,
                param.as_ptr() as isize,
                SMTO_ABORTIFHUNG,
                2000,
                &mut result,
            );
        }
    }
}

// ============ 安装 / 更新 ============

/// 安装或更新（lockstep：下载最新 Release 的当前平台资产，sha256 校验后原子落盘并注册 PATH）
pub async fn install_or_update() -> Result<String, String> {
    let client = http_client().await?;
    let prefix = mirror_prefix();

    // 1. 查询最新 Release 与本平台资产
    let url = format!(
        "{}https://api.github.com/repos/{}/releases/latest",
        prefix, GITHUB_REPO
    );
    let json: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("访问 GitHub 失败：{}（可在设置中配置代理或镜像）", e))?
        .error_for_status()
        .map_err(|e| format!("GitHub 响应异常：{}", e))?
        .json()
        .await
        .map_err(|e| format!("解析发布数据失败：{}", e))?;
    let tag = json["tag_name"]
        .as_str()
        .ok_or("发布数据缺少 tag_name")?
        .to_string();
    let assets = json["assets"]
        .as_array()
        .ok_or("发布数据缺少 assets")?;
    let exe_name = asset_exe_name();
    let sha_name = format!("{}.sha256", exe_name);
    let find_asset = |name: &str| -> Result<String, String> {
        assets
            .iter()
            .find(|a| a["name"].as_str() == Some(name))
            .and_then(|a| a["browser_download_url"].as_str())
            .map(|s| s.to_string())
            .ok_or(format!("发布 {} 缺少资产 {}（CI 未上传或平台不符）", tag, name))
    };
    let exe_url = find_asset(&exe_name)?;
    let sha_url = find_asset(&sha_name)?;

    // 2. 下载二进制与校验文件（镜像前缀拼接）
    let bytes = client
        .get(format!("{}{}", prefix, exe_url))
        .send()
        .await
        .map_err(|e| format!("下载 {} 失败：{}", exe_name, e))?
        .error_for_status()
        .map_err(|e| format!("下载 {} 响应异常：{}", exe_name, e))?
        .bytes()
        .await
        .map_err(|e| format!("读取 {} 失败：{}", exe_name, e))?
        .to_vec();
    let sha_text = client
        .get(format!("{}{}", prefix, sha_url))
        .send()
        .await
        .map_err(|e| format!("下载 {} 失败：{}", sha_name, e))?
        .error_for_status()
        .map_err(|e| format!("下载 {} 响应异常：{}", sha_name, e))?
        .text()
        .await
        .map_err(|e| format!("读取 {} 失败：{}", sha_name, e))?;

    // 3. sha256 校验（不匹配则丢弃，绝不落盘）
    let expected = sha_text
        .split_whitespace()
        .next()
        .ok_or("校验文件内容为空")?
        .to_lowercase();
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let actual: String = hasher
        .finalize()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();
    if actual != expected {
        return Err(format!(
            "sha256 校验失败，已丢弃下载内容（预期 {}，实际 {}）。网络可能被劫持，请配置镜像后重试。",
            expected, actual
        ));
    }

    // 4. 原子落盘（写临时文件后替换；Windows 上 rename 不能覆盖已存在文件，先移除旧文件）
    let exe = cli_exe_path();
    let parent = exe
        .parent()
        .ok_or_else(|| "无法确定安装目录".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("创建安装目录失败（{}）：{}", parent.display(), e))?;
    let tmp = parent.join("dbd.tmp_download");
    std::fs::write(&tmp, &bytes)
        .map_err(|e| format!("写入临时文件失败：{}", e))?;
    if exe.exists() {
        std::fs::remove_file(&exe).map_err(|e| format!("移除旧版本失败：{}", e))?;
    }
    if let Err(e) = std::fs::rename(&tmp, &exe) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("安装落盘失败：{}", e));
    }

    // 5. 注册 PATH
    let path_msg = register_path()?;

    let version = tag.trim_start_matches('v');
    Ok(format!(
        "已安装 dbd {} 至 {}。{}新启动的终端进程即可使用 dbd 命令。",
        version,
        exe.display(),
        path_msg
    ))
}

// ============ 卸载 ============

/// 卸载：删二进制、移除 PATH 条目、清理已安装的 skill；数据库与项目数据不动
pub async fn uninstall() -> Result<String, String> {
    let mut removed = Vec::new();

    let exe = cli_exe_path();
    if exe.exists() {
        std::fs::remove_file(&exe).map_err(|e| format!("删除 CLI 失败：{}", e))?;
        removed.push("CLI 二进制".to_string());
    }

    remove_from_path()?;
    removed.push("PATH 条目".to_string());

    // 清理各预设目标下本应用的 skill 目录（仅删除 <skills根>/db-designer）
    for status in skill_targets::list_targets() {
        if let Some(root) = status.root {
            let dir = root.join(skill_targets::SKILL_DIR_NAME);
            if dir.is_dir() {
                std::fs::remove_dir_all(&dir)
                    .map_err(|e| format!("清理 skill 失败（{}）：{}", dir.display(), e))?;
            }
        }
    }
    removed.push("已安装的 skill".to_string());

    Ok(format!(
        "已卸载：{}。用户数据库与项目数据保持不变。",
        removed.join("、")
    ))
}

// ============ skill 部署（桌面端与 CLI 共用 skill_targets，行为一致） ============

/// 安装/更新 skill 到指定预设目标与（可选）自定义 skills 根目录，返回写入路径列表
pub fn install_skills(
    targets: Vec<String>,
    custom_dir: Option<String>,
) -> Result<Vec<String>, String> {
    let mut written = Vec::new();
    for id in &targets {
        match skill_targets::install_to_target(id) {
            Ok(path) => written.push(path.display().to_string()),
            Err(e) if e.starts_with("未知目标") => {
                let ids: Vec<&str> = skill_targets::PRESET_TARGETS
                    .iter()
                    .map(|t| t.id)
                    .collect();
                return Err(format!("{}。可用目标：{}", e, ids.join(", ")));
            }
            Err(e) => return Err(e),
        }
    }
    if let Some(dir) = custom_dir {
        let path = skill_targets::install_to_dir(Path::new(&dir))?;
        written.push(path.display().to_string());
    }
    Ok(written)
}

// ============ 状态汇总 ============

/// 汇总设置页所需的完整状态
pub async fn get_status() -> Result<CliStatus, String> {
    let dir = install_dir();
    let exe = cli_exe_path();
    let installed = exe.exists();
    let installed_version = if installed {
        installed_version(&exe).await
    } else {
        None
    };

    // 最新版本查询失败不阻断状态展示
    let client = http_client().await?;
    let (latest_version, latest_error) = match query_latest_version(&client).await {
        Ok(v) => (Some(v), None),
        Err(e) => (None, Some(e)),
    };

    let update_available = match (&installed_version, &latest_version) {
        (Some(cur), Some(latest)) => {
            let cur = semver::Version::parse(cur).ok();
            let latest = semver::Version::parse(latest).ok();
            matches!((cur, latest), (Some(c), Some(l)) if l > c)
        }
        _ => false,
    };

    // skill 状态：与桌面端自身版本（= CLI lockstep 版本）比对判断落后
    let current = env!("CARGO_PKG_VERSION");
    let skills = skill_targets::list_targets()
        .into_iter()
        .map(|t| {
            let outdated = t
                .installed_version
                .as_ref()
                .map(|v| v != current)
                .unwrap_or(false);
            SkillStatusInfo {
                id: t.id.to_string(),
                name: t.name.to_string(),
                root: t
                    .root
                    .as_ref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_default(),
                installed_version: t.installed_version,
                outdated,
            }
        })
        .collect();

    let path_registered = path_contains_dir(&dir);
    let copies = check_copies();

    Ok(CliStatus {
        installed,
        installed_version,
        install_dir: dir.display().to_string(),
        latest_version,
        update_available,
        path_registered,
        copies,
        skills,
        latest_error,
    })
}

/// 安装目录是否已在 PATH 环境中（Windows 同时核对注册表用户 Path）
fn path_contains_dir(dir: &Path) -> bool {
    #[cfg(windows)]
    {
        win_path::user_path_contains(dir)
    }
    #[cfg(not(windows))]
    {
        std::env::var("PATH")
            .map(|paths| paths.split(':').any(|p| Path::new(p) == dir))
            .unwrap_or(false)
    }
}
