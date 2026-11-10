//! dbd —— db-designer 只读命令行
//!
//! 复用桌面端 lib 层（services/storage/dialect），仅提供本地只读命令与 skill 安装。
//! 与桌面端共享同一数据目录，绝不创建或修改数据库。
//!
//! 退出码约定：0 成功；1 业务错误；2 数据库正忙。

use std::path::Path;
use std::time::{Duration, Instant};

use clap::{Parser, Subcommand};
use db_designer_lib::models::Project;
use db_designer_lib::services::project_service::ProjectService;
use db_designer_lib::services::table_service::TableService;
use db_designer_lib::services::version_service::VersionService;
use db_designer_lib::{db, skill_targets};

/// 数据库被占用时的最长等待时间
const BUSY_WAIT: Duration = Duration::from_secs(5);
/// 忙重试间隔
const BUSY_RETRY_INTERVAL: Duration = Duration::from_millis(150);

// ============ 命令行定义 ============

#[derive(Parser)]
#[command(
    name = "dbd",
    version,
    about = "db-designer 只读命令行：查询项目、表结构、版本并导出 SQL",
    after_help = "agent 调用时建议始终携带 --json；数据与 db-designer 桌面端共享同一目录。"
)]
struct Cli {
    /// 以 JSON 格式输出（agent 调用推荐）
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// 设计项目
    Projects {
        #[command(subcommand)]
        cmd: ProjectsCommand,
    },
    /// 表结构
    Tables {
        #[command(subcommand)]
        cmd: TablesCommand,
    },
    /// 设计版本
    Versions {
        #[command(subcommand)]
        cmd: VersionsCommand,
    },
    /// SQL 导出
    Export {
        #[command(subcommand)]
        cmd: ExportCommand,
    },
    /// Agent Skill 安装与管理
    Skill {
        #[command(subcommand)]
        cmd: SkillCommand,
    },
}

#[derive(Subcommand)]
enum ProjectsCommand {
    /// 列出全部设计项目
    List,
}

#[derive(Subcommand)]
enum TablesCommand {
    /// 列出项目下的表
    List {
        /// 项目 ID
        #[arg(long)]
        project: i32,
    },
    /// 查看单表完整定义（含列/索引/外键）
    Get {
        /// 项目 ID
        #[arg(long)]
        project: i32,
        /// 表名称或表 ID
        #[arg(long)]
        table: String,
    },
}

#[derive(Subcommand)]
enum VersionsCommand {
    /// 列出项目历史版本
    List {
        /// 项目 ID
        #[arg(long)]
        project: i32,
    },
}

#[derive(Subcommand)]
enum ExportCommand {
    /// 按方言导出当前项目完整建表 SQL
    Sql {
        /// 项目 ID
        #[arg(long)]
        project: i32,
        /// 目标方言：mysql | postgresql | oracle
        #[arg(long)]
        dialect: String,
        /// 写入指定文件（缺省输出到标准输出）
        #[arg(long)]
        out: Option<String>,
    },
}

#[derive(Subcommand)]
enum SkillCommand {
    /// 安装 skill 文档到预设目标或自定义 skills 根目录（幂等覆盖）
    Install {
        /// 预设目标 id（可用值见 dbd skill list）
        #[arg(long, conflicts_with = "dir")]
        target: Option<String>,
        /// 自定义 skills 根目录（写入 <目录>/db-designer/SKILL.md）
        #[arg(long)]
        dir: Option<String>,
    },
    /// 列出预设目标及安装状态
    List,
}

// ============ 错误与退出码 ============

enum CliError {
    /// 业务错误（退出码 1）
    Biz(String),
    /// 数据库正忙（退出码 2）
    Busy(String),
}

// ============ 忙重试（spec：等待窗口内完成或返回可读忙错误） ============

/// 判断错误串是否为数据库被占用
fn is_busy_error(err: &str) -> bool {
    err.contains("database is locked")
        || err.contains("database table is locked")
        || err.contains("SQLITE_BUSY")
}

/// 包装服务调用：数据库被占用时退避重试，超过等待窗口返回退出码 2 的可读错误。
/// 服务层/store 内部各自开连接（rusqlite 默认无 busy_timeout），故在 CLI 边界统一包装。
fn with_busy_retry<T>(mut op: impl FnMut() -> Result<T, String>) -> Result<T, CliError> {
    let start = Instant::now();
    loop {
        match op() {
            Ok(value) => return Ok(value),
            Err(err) if is_busy_error(&err) => {
                if start.elapsed() >= BUSY_WAIT {
                    return Err(CliError::Busy(format!(
                        "数据库正忙（等待 {} 秒后仍被占用）。桌面端可能正在写入，请稍后重试。",
                        BUSY_WAIT.as_secs()
                    )));
                }
                std::thread::sleep(BUSY_RETRY_INTERVAL);
            }
            Err(err) => return Err(CliError::Biz(err)),
        }
    }
}

// ============ 数据定位与空库防御（spec：不建空库、缺表明确报错） ============

/// 确保数据库文件存在且已初始化：文件不存在或缺关键表时报业务错误，绝不创建新库
fn ensure_data_ready() -> Result<(), CliError> {
    let path = db::get_database_path();
    if !Path::new(&path).exists() {
        return Err(CliError::Biz(format!(
            "未找到 db-designer 数据库（{}）。请确认桌面端已安装并至少启动过一次；若自定义了数据目录，请设置环境变量 DB_DESIGNER_DATA_PATH。",
            path
        )));
    }
    // 只读探测关键表：不建库、不跑迁移
    with_busy_retry(|| {
        let conn = rusqlite::Connection::open_with_flags(
            &path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("无法打开数据库（{}）：{}", path, e))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 't_proj'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("数据库读取失败：{}", e))?;
        if count == 0 {
            Err("数据库尚未初始化设计表。请先启动 db-designer 桌面端完成初始化。".to_string())
        } else {
            Ok(())
        }
    })
}

// ============ 方言与输出辅助 ============

/// 校验并归一方言参数（与桌面端 db_type 取值一致）
fn normalize_dialect(raw: &str) -> Result<String, CliError> {
    match raw.to_lowercase().as_str() {
        "mysql" => Ok("mysql".to_string()),
        "postgresql" | "postgres" | "pg" => Ok("postgresql".to_string()),
        "oracle" => Ok("oracle".to_string()),
        other => Err(CliError::Biz(format!(
            "不支持的方言：{}（可选 mysql | postgresql | oracle）",
            other
        ))),
    }
}

/// 统一输出：--json 时序列化输出，否则执行人类可读打印
fn emit<T: serde::Serialize>(
    json_mode: bool,
    value: &T,
    human: impl FnOnce(&T),
) -> Result<(), CliError> {
    if json_mode {
        let text =
            serde_json::to_string(value).map_err(|e| CliError::Biz(format!("JSON 序列化失败：{}", e)))?;
        println!("{}", text);
    } else {
        human(value);
    }
    Ok(())
}

fn print_projects(items: &Vec<Project>) {
    println!("{:<6} {:<28} {:<8} {}", "ID", "名称", "表数", "更新时间");
    for p in items {
        println!("{:<6} {:<28} {:<8} {}", p.id, p.name, p.table_count, p.updated_at);
    }
}

fn print_tables(items: &Vec<db_designer_lib::models::TableDef>) {
    println!("{:<6} {:<28} {:<20} {}", "ID", "表名", "显示名", "更新时间");
    for t in items {
        println!("{:<6} {:<28} {:<20} {}", t.id, t.name, t.display_name, t.updated_at);
    }
}

fn print_versions(items: &Vec<db_designer_lib::models::Version>) {
    println!("{:<6} {:<32} {}", "ID", "版本名", "创建时间");
    for v in items {
        println!("{:<6} {:<32} {}", v.id, v.name, v.created_at);
    }
}

fn print_skills(items: &Vec<skill_targets::TargetStatus>) {
    println!("{:<12} {:<16} {:<44} {}", "ID", "名称", "skills 根目录", "已装版本");
    for t in items {
        let root = t
            .root
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "<无法解析用户主目录>".to_string());
        println!(
            "{:<12} {:<16} {:<44} {}",
            t.id,
            t.name,
            root,
            t.installed_version.as_deref().unwrap_or("未安装")
        );
    }
}

// ============ 命令分发 ============

fn dispatch(cli: Cli) -> Result<(), CliError> {
    match cli.command {
        Commands::Projects { cmd } => match cmd {
            ProjectsCommand::List => {
                ensure_data_ready()?;
                let items = with_busy_retry(|| ProjectService::new().get_projects())?;
                emit(cli.json, &items, print_projects)
            }
        },
        Commands::Tables { cmd } => match cmd {
            TablesCommand::List { project } => {
                ensure_data_ready()?;
                let items =
                    with_busy_retry(|| TableService::new().get_project_tables(project))?;
                emit(cli.json, &items, print_tables)
            }
            TablesCommand::Get { project, table } => {
                ensure_data_ready()?;
                let tables = with_busy_retry(|| {
                    TableService::new().get_project_tables_with_columns(project)
                })?;
                let found = tables
                    .iter()
                    .find(|t| t.name == table || t.id == table || t.display_name == table);
                match found {
                    Some(t) => emit(cli.json, t, |t| {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(t).unwrap_or_default()
                        );
                    }),
                    None => Err(CliError::Biz(format!(
                        "项目 {} 下未找到表“{}”",
                        project, table
                    ))),
                }
            }
        },
        Commands::Versions { cmd } => match cmd {
            VersionsCommand::List { project } => {
                ensure_data_ready()?;
                let items = with_busy_retry(|| VersionService::new().get_versions(project))?;
                emit(cli.json, &items, print_versions)
            }
        },
        Commands::Export { cmd } => match cmd {
            ExportCommand::Sql { project, dialect, out } => {
                ensure_data_ready()?;
                let db_type = normalize_dialect(&dialect)?;
                let sql = with_busy_retry(|| {
                    // 复用桌面端“导出当前项目 SQL”同一代码路径，保证输出一致
                    VersionService::new().export_project_sql(project, db_type.clone())
                })?;
                match out {
                    Some(path) => std::fs::write(&path, &sql)
                        .map_err(|e| CliError::Biz(format!("写入文件失败（{}）：{}", path, e)))?,
                    None => print!("{}", sql),
                }
                Ok(())
            }
        },
        Commands::Skill { cmd } => match cmd {
            SkillCommand::Install { target, dir } => {
                let result = match (target, dir) {
                    (Some(t), None) => skill_targets::install_to_target(&t),
                    (None, Some(d)) => skill_targets::install_to_dir(Path::new(&d)),
                    _ => return Err(CliError::Biz(
                        "请通过 --target <id> 或 --dir <目录> 指定安装位置（二选一）".to_string(),
                    )),
                };
                match result {
                    Ok(path) => {
                        println!("已安装 skill：{}", path.display());
                        Ok(())
                    }
                    Err(e) if e.starts_with("未知目标") => {
                        let ids: Vec<&str> = skill_targets::PRESET_TARGETS
                            .iter()
                            .map(|t| t.id)
                            .collect();
                        Err(CliError::Biz(format!("{}。可用目标：{}", e, ids.join(", "))))
                    }
                    Err(e) => Err(CliError::Biz(e)),
                }
            }
            SkillCommand::List => {
                let items = skill_targets::list_targets();
                emit(cli.json, &items, print_skills)
            }
        },
    }
}

#[cfg(windows)]
fn force_utf8_console() {
    // 旧控制台默认 GBK 代码页，中文 UTF-8 输出会乱码，切换为 UTF-8（65001）
    unsafe {
        windows_sys::Win32::System::Console::SetConsoleOutputCP(65001);
    }
}

fn main() {
    #[cfg(windows)]
    force_utf8_console();
    let cli = Cli::parse();
    let code = match dispatch(cli) {
        Ok(()) => 0,
        Err(CliError::Biz(msg)) => {
            eprintln!("错误：{}", msg);
            1
        }
        Err(CliError::Busy(msg)) => {
            eprintln!("{}", msg);
            2
        }
    };
    std::process::exit(code);
}
