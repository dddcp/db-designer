//! skill 目标注册表：预设 agent 的用户级 SKILL.md 安装目录
//!
//! 预设目标全部为 Agent Skills（SKILL.md）标准目录型，核对表与依据见
//! openspec/changes/add-agent-cli/design.md 附录。
//! 本模块被 dbd CLI 与桌面端 agent_cli_service 共用，保证行为与版本一致。

use std::path::{Path, PathBuf};

/// 安装的 skill 子目录名（各 agent 的 skills 根目录下）
pub const SKILL_DIR_NAME: &str = "db-designer";
/// 模板中的版本占位符
const VERSION_PLACEHOLDER: &str = "{{VERSION}}";
/// 已安装文件中的版本标记（写入模板尾部注释，用于检测安装版本与落后状态）
const VERSION_MARKER: &str = "dbd-skill-version:";

/// 预设安装目标
pub struct SkillTarget {
    /// 目标 id（`dbd skill install --target <id>`）
    pub id: &'static str,
    /// 显示名
    pub name: &'static str,
    /// 用户级 skills 根目录解析（返回 None 表示无法解析主目录）
    pub skills_root: fn() -> Option<PathBuf>,
}

/// 目标安装状态
#[derive(serde::Serialize)]
pub struct TargetStatus {
    pub id: &'static str,
    pub name: &'static str,
    /// 用户级 skills 根目录（无法解析主目录时为 None）
    pub root: Option<PathBuf>,
    /// 已安装的 skill 版本（未安装或无法识别时为 None）
    pub installed_version: Option<String>,
}

/// 主目录相对路径解析辅助
fn home_join(rel: &str) -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(rel))
}

// 各目标用户级 skills 根目录（依据 design.md 附录核对表，逐家官方文档核实）
fn root_claude_code() -> Option<PathBuf> {
    home_join(".claude/skills")
}
fn root_pi() -> Option<PathBuf> {
    home_join(".pi/agent/skills")
}
fn root_opencode() -> Option<PathBuf> {
    home_join(".config/opencode/skills")
}
fn root_cursor() -> Option<PathBuf> {
    home_join(".cursor/skills")
}
fn root_codex() -> Option<PathBuf> {
    home_join(".codex/skills")
}
fn root_zcode() -> Option<PathBuf> {
    home_join(".zcode/skills")
}
fn root_kimi() -> Option<PathBuf> {
    home_join(".kimi-code/skills")
}
fn root_trae() -> Option<PathBuf> {
    home_join(".trae-cn/skills")
}

/// 预设目标注册表（数据驱动：修正路径不需要改架构）
pub const PRESET_TARGETS: &[SkillTarget] = &[
    SkillTarget { id: "claude-code", name: "Claude Code", skills_root: root_claude_code },
    SkillTarget { id: "pi", name: "Pi", skills_root: root_pi },
    SkillTarget { id: "opencode", name: "OpenCode", skills_root: root_opencode },
    SkillTarget { id: "cursor", name: "Cursor", skills_root: root_cursor },
    SkillTarget { id: "codex", name: "Codex CLI", skills_root: root_codex },
    SkillTarget { id: "zcode", name: "ZCode", skills_root: root_zcode },
    SkillTarget { id: "kimi", name: "Kimi Code CLI", skills_root: root_kimi },
    SkillTarget { id: "trae", name: "TRAE", skills_root: root_trae },
];

/// 按 id 查找预设目标
pub fn find_target(id: &str) -> Option<&'static SkillTarget> {
    PRESET_TARGETS.iter().find(|t| t.id == id)
}

/// 渲染后的 SKILL.md 内容（版本占位符替换为当前 CLI 版本，保证文档与二进制版本一致）
pub fn rendered_skill_md() -> String {
    include_str!("dbd_skill.md").replace(VERSION_PLACEHOLDER, env!("CARGO_PKG_VERSION"))
}

/// 某 skills 根目录下本技能的目标文件路径
pub fn skill_file_path(skills_root: &Path) -> PathBuf {
    skills_root.join(SKILL_DIR_NAME).join("SKILL.md")
}

/// 读取已安装文件的版本号（文件不存在或无标记时返回 None）
pub fn installed_version(skills_root: &Path) -> Option<String> {
    let content = std::fs::read_to_string(skill_file_path(skills_root)).ok()?;
    let idx = content.find(VERSION_MARKER)?;
    let rest = &content[idx + VERSION_MARKER.len()..];
    let end = rest.find("-->")?;
    Some(rest[..end].trim().to_string())
}

/// 写入 skill 到指定 skills 根目录（幂等覆盖），返回写入的文件路径
pub fn install_to_dir(skills_root: &Path) -> Result<PathBuf, String> {
    let file = skill_file_path(skills_root);
    let parent = file
        .parent()
        .ok_or_else(|| "无法确定 skill 目标路径".to_string())?;
    std::fs::create_dir_all(parent)
        .map_err(|e| format!("创建目录失败（{}）：{}", parent.display(), e))?;
    std::fs::write(&file, rendered_skill_md())
        .map_err(|e| format!("写入失败（{}）：{}", file.display(), e))?;
    Ok(file)
}

/// 写入 skill 到指定预设目标，返回写入的文件路径
pub fn install_to_target(id: &str) -> Result<PathBuf, String> {
    let target = find_target(id).ok_or_else(|| format!("未知目标：{}", id))?;
    let root = (target.skills_root)().ok_or_else(|| "无法解析用户主目录".to_string())?;
    install_to_dir(&root)
}

/// 列出全部预设目标及其安装状态
pub fn list_targets() -> Vec<TargetStatus> {
    PRESET_TARGETS
        .iter()
        .map(|t| {
            let root = (t.skills_root)();
            let installed_version = root.as_deref().and_then(installed_version);
            TargetStatus {
                id: t.id,
                name: t.name,
                root,
                installed_version,
            }
        })
        .collect()
}
