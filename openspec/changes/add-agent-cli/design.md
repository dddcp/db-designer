# Design: add-agent-cli

## Context

- `src-tauri` 已具备 `[lib]` + `rlib`（Tauri v2 标准布局）；`services/`、`storage/` 完全不依赖 tauri runtime，`dialect.rs`（1497 行 SQL 生成）为纯函数，仅 3 处 `#[tauri::command]` 装饰器属于薄命令层。`lib.rs` 中模块目前除 `dialect` 外均为私有 `mod`。
- 数据目录为用户级 `dirs::data_dir()/db-designer`（`db.rs::get_data_dir()`，含旧版安装目录一次性迁移），CLI 无论安装到何处都能解析到同一份数据；`DB_DESIGNER_DATA_PATH` 覆盖逻辑在 `get_database_path()`。
- 桌面端为"每命令一次 `init_db()` 连接"模式；rusqlite 默认无 busy_timeout，并发写会立即 SQLITE_BUSY。
- 后端目前无任何代理处理逻辑（grep 无 `proxy` 命中）；设置持久化遵循 `local-app-settings` 能力：AI/Git 走 `settings.json`（setting_service），其余走 SQLite `t_setting`。
- 无测试框架，验证方式为 `npx tsc --noEmit` + `cargo check`；CI 具备多平台构建与 GitHub Release 发布能力。
- OpenSpec CLI 自带 46+ AI 工具注册表与各工具命令文件适配器（本机 `E:\node-data\npm-prefix\node_modules\@fission-ai\openspec\dist\core\command-generation\adapters\`），可作各 agent 路径规范的参考实现；其中无 `workbuddy`。

## Goals / Non-Goals

**Goals:**

- `dbd` 二进制以最小改动复用现有 lib（服务/存储/方言层零复制）
- skill 文档单一事实来源：内嵌于二进制，CLI 子命令与桌面端共用同一注册表代码
- 应用内安装/更新/卸载全生命周期闭环（下载、sha256 校验、PATH、skill、多副本检测）
- 各平台路径解析正确（Windows/macOS/Linux）

**Non-Goals:**

- MCP 接入（独立后续 change；`dbd mcp` 子命令位预留）
- 远程库 diff/sync 命令（v2，需先设计凭据门控；现有数据库含明文凭据）
- 任何写命令（建表/改表等）
- 发布到 crates.io（v1 仅 GitHub Release，版本与 app lockstep）
- 抽取 core crate 重构（v1 接受 CLI 链接 tauri 的体积代价，见 R1）

## Decisions

### D1: `[[bin]]` 挂在 src-tauri 包内，模块改 pub

`Cargo.toml` 增加 `[[bin]] name = "dbd"`，入口 `src/bin/dbd.rs`，通过 `db_designer_lib::` 复用 lib。`lib.rs` 私有模块改 `pub mod`（机械改动）。
备选：抽 `db-designer-core` workspace crate——更干净但要动所有模块引用，收益只是二进制瘦身，推迟。备选：`src/bin/` 直接 `include!` 模块——破坏封装，否决。

### D2: CLI 命令面与输出格式

clap derive 风格，v1 子命令：`projects list`、`tables list|get --project <id>`、`versions list --project <id>`、`export sql --project <id> --dialect <mysql|postgresql|oracle> [--out <file>]`、`skill install|list`、`--version`。CLI 调 services 层，不碰 `#[tauri::command]` 函数。
默认人类可读表格输出，`--json` 输出结构化 JSON（skill 文档教 agent 始终带 `--json`）。退出码：成功 0、业务错误 1、数据库正忙 2。

### D3: 数据定位与"空库"防御

复用 `db.rs::get_database_path()`。CLI **不调用** `init_database()`（避免建空库/跑迁移）；打开连接前先检查数据库文件存在性，不存在则报"未找到数据"。打开后探测关键表（`t_project` 等）存在性：缺失视为数据库过旧或损坏，报错并提示先启动桌面端完成初始化。比引入 `PRAGMA user_version` 简单（现有迁移链不维护 user_version），且不改动桌面端。
`get_data_dir()` 中的旧版迁移逻辑基于 `current_exe()`，对 CLI（装在 `~/.local/bin` 等）是无害空转，原样复用。

### D4: 并发策略——仅 busy_timeout，不动 journal mode

CLI 连接统一 `busy_timeout(5s)`；超时返回退出码 2 + "数据库正忙，请稍后重试"。v1 不切 WAL：WAL 是库级持久设置，会改变桌面端运行时行为，收益（读写并发）对只读 CLI 有限，列为后续可选项。

### D5: skill 注册表——共享模块，预设全部为 SKILL.md 目录型

新增 `src-tauri/src/skill_targets.rs`（被 CLI bin 与 agent_cli_service 共用）：目标 = `{ id, 名称, 用户级 skills 根目录(OS 相关) }`，安装动作统一为写 `<skills 根>/db-designer/SKILL.md`。

经调研（核对表见文末附录），8 家预设目标全部原生支持 Agent Skills（SKILL.md）标准目录，原设计的“指令文件追加型”无预设目标使用，经用户确认修订 spec 移除该机制（避免投机代码）；未来若新增指令文件型目标再扩展。

模板内嵌：`include_str!` + 运行时 `replace("{{VERSION}}", env!("CARGO_PKG_VERSION"))`，保证 skill 与 CLI 版本严格一致。桌面端“安装 Skill”直接调 `skill_targets` 共用代码（与 CLI 子命令同一实现），不 spawn 子进程。

v1 预设：claude-code、pi、opencode、cursor、codex、trae、zcode、kimi；自定义文件夹（`--dir`）始终可用；workbuddy 不在 OpenSpec 注册表，不进 v1。

### D6: 安装目录、分发与校验

- 安装目录：Windows `dirs::data_local_dir()/db-designer/bin`（`%LOCALAPPDATA%`）；macOS/Linux `~/.local/bin`（不存在则创建，属 PATH 惯例目录）
- 版本策略：与 app **lockstep**——同一 release tag 附带 `dbd-<rust-triple>(.exe)` 与 `dbd-<rust-triple>.sha256`；app 用 GitHub API `releases/latest` 对比已装版本（semver 比较，`semver` crate）
- 下载复用已有 `reqwest`（rustls），先落临时文件、sha256 校验通过后原子 rename；新增设置键 `cli_proxy_url` 与可选镜像前缀 `cli_mirror_url`（存 `settings.json`，沿用 setting_service；后端无既有代理逻辑，属新建）
- 不走 Tauri `externalBin` sidecar：规避 NSIS 重装不替换（tauri#15134）、MSI ICE30 等打包坑；CI 用 `cargo build --release --bin dbd --target <triple>` 独立产资产

### D7: Windows PATH 注册

`winreg` 直接读写 `HKCU\Environment\Path`：读 `get_raw_value` 保留 `REG_EXPAND_SZ` 原始值（含 `%...%` 引用），逐项追加不重复，`set_raw_value` 写回。**禁用 `setx`**（截断至 1024 字符会毁用户 PATH）。广播 `WM_SETTINGCHANGE` 用 `windows-sys` 最小 feature；广播失败不阻断，UI 文案兜底"重开终端生效"。Unix 用 `~/.local/bin`，检测不在 PATH 时展示可复制的手动配置指引（不自动改 shell rc）。

### D8: 多副本检测与卸载

安装/更新前枚举 PATH 各目录查找 `dbd(.exe)`，与安装目录比对，命中即列出路径与解析顺序。卸载：删安装目录二进制、PATH 精确移除本应用条目、按注册表删除各目标 skill（SkillsDir 删 `db-designer/` 子目录；InstructionFile 删标记块）；数据库与项目数据不动。

### D9: 后端分层与命令面

`agent_cli.rs`（薄命令）→ `agent_cli_service.rs`（下载/校验/落盘/PATH/skill 编排）→ 复用 `db.rs`、`skill_targets.rs`。文件操作属服务层职责（同 `git.rs` 先例）。命令：`cli_get_status`、`cli_install`、`cli_update`、`cli_uninstall`、`cli_install_skill`、`cli_check_copies`。注册进 `generate_handler![]`。

### D10: 最小侵入边界（硬约束）

原则：全部新逻辑放新文件（`src/bin/dbd.rs`、`skill_targets.rs`、`agent_cli.rs`、`agent_cli_service.rs`、`agent-cli-tab.tsx`、skill 模板），只调用既有方法；**禁止修改任何既有函数体**（包括重构、格式化、顺手优化）。既有文件仅允许以下 4 处追加式修改：

1. `src-tauri/Cargo.toml`：追加 `[[bin]]` 与新依赖
2. `src-tauri/src/lib.rs`：`mod` → `pub mod`（纯可见性）+ `generate_handler![]` 追加新命令注册
3. `src/components/setting/setting.tsx`（含 setting-sidebar）：追加 import/case/侧边栏项
4. `src/i18n/locales/zh-CN.json`、`en-US.json`、`backend-messages.ts`：追加键

备选方案已评估并否决：bin 内用 `#[path]` 重建模块树可消除 lib.rs 可见性改动，但同一批源文件双倍编译且模块声明需手工同步（漂移风险）；`generate_handler` 与 `setting.tsx` 注册在任何方案下均不可省（应用内托管安装依赖 IPC 与设置页挂载）。新增设置键（`cli_proxy_url` 等）走 `setting_service` 既有通用 KV 接口，不需改服务代码。

**实现后审计（实际触碰清单，超出清单的改动已回退）**：

1. `src-tauri/Cargo.toml`：追加 `[[bin]] dbd` 与依赖（clap/sha2/semver/winreg/windows-sys）
2. `src-tauri/src/lib.rs`：既有 17 行 `mod`→`pub mod`；追加 `pub mod agent_cli;`、`pub mod skill_targets;`；`generate_handler![]` 追加 6 条命令
3. `src-tauri/src/services/mod.rs`：追加 1 行 `pub mod agent_cli_service;`（服务注册必要）
4. `src/components/setting/setting.tsx` + `setting-sidebar.tsx`：追加 import/case/菜单项（含 union type 追加 `'agent'`）
5. `src/i18n/locales/zh-CN.json`、`en-US.json`：纯追加 34 键（文本插入保序，diff +34/-0）
6. `.github/workflows/release.yml`：CI 配置追加 dbd 构建与上传步骤（非应用代码）

其余全部为新文件；未修改任何既有函数体。

### D11: 前端与 i18n

新增 `src/components/setting/agent-cli-tab.tsx` 注册进 `setting.tsx`；状态卡片（未装/已装版本/最新版本/skill 落后）、安装/更新/卸载按钮、代理与镜像输入、skill 目标多选、多副本警告。i18n 双语 + `backend-messages.ts` 错误映射，全部中文注释。

## Risks / Trade-offs

- [R1 CLI 二进制链接 tauri 偏大（估 15-30MB）] → v1 接受；若用户反馈体积敏感，后续抽 core crate（D1 已留路径）
- [R2 GitHub 国内不可达] → 代理 + 镜像前缀（D6）；仍失败时设置页展示资产直链供手动下载与校验说明
- [R3 预设目标路径规范不可靠/已变更（zcode、kimi 资料少）] → 注册表数据驱动；预设准入以逐项核实为前置任务，核不出则剔除，只保留自定义文件夹兜底
- [R4 WM_SETTINGCHANGE 在部分环境（非 Explorer shell、RDP）不生效] → UI 提示重开终端 + 可复制 PATH 文案，属已知平台限制
- [R5 长事务下 5s busy_timeout 不够] → 只读命令重试一次；错误信息含"关闭桌面端弹窗或稍后重试"建议
- [R6 lockstep 版本策略下 CLI 无法独立修 bug] → 可临时发补丁 release，app 端 semver 比较允许 CLI 先行小版本；如常出现独立修复诉求再改为独立版本号
- [R7 reqwest 下载的文件无 quarantine 标记] → macOS Gatekeeper 默认不拦未隔离文件，作为设计依据记录；若未来引入浏览器下载路径需复查签名/公证

## Migration Plan

无数据库 schema 变更、无破坏性接口变更。发布顺序：CI 先产出带 `dbd` 资产的 release → 桌面端随新版本更新获得设置页入口。回滚：设置页入口可整体隐藏，CLI 资产保留不影响旧版 app。

## Open Questions

- opencode/zcode/kimi/trae 各自 skills（或等价机制）的准确路径与格式：由 tasks 中的专项调研任务回答，结果只影响 `skill_targets.rs` 的注册表数据，不影响架构与验收标准
- CLI 实际体积（R1）在首个 CI 构建后确认，超预期再议 core crate 抽取

## 附录：预设目标核对表（任务 1.1 产出）

| 目标 | 类型 | 用户级 skills 根目录 | 依据与备注 |
|------|------|---------------------|-----------|
| claude-code | SKILL.md 目录型 | `~/.claude/skills` | Anthropic Agent Skills 规范 |
| pi | SKILL.md 目录型 | `~/.pi/agent/skills` | 本机实证 |
| opencode | SKILL.md 目录型 | `~/.config/opencode/skills` | 官方文档；必须用复数 `skills/`（单数目录发现有 bug） |
| cursor | SKILL.md 目录型 | `~/.cursor/skills` | 官方文档；兼容读取 `~/.agents/skills` |
| codex | SKILL.md 目录型 | `~/.codex/skills` | openai/codex 官方 docs/skills.md（v1 递归扫描） |
| zcode | SKILL.md 目录型 | `~/.zcode/skills` | 智谱 ZCode 官方文档；兼容 `~/.agents/skills` |
| kimi | SKILL.md 目录型 | `~/.kimi-code/skills` | Kimi Code 官方文档；随 `KIMI_CODE_HOME` 迁移 |
| trae | SKILL.md 目录型 | `~/.trae-cn/skills` | 国内版路径（官方社区多来源一致）；国际版 `~/.trae/skills`、TRAE CLI `~/.traecli/skills`，如需可作未来变体 |
| custom（兑底） | SKILL.md 目录型 | `--dir` 指定 | 任意文件夹 |

排除：workbuddy（OpenSpec 工具注册表无此项，公开资料无 skills 规范）。8 家 SKILL.md frontmatter 均要求 `name` + `description`。
