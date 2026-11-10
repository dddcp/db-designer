# Proposal: add-agent-cli

## Why

db-designer 的核心能力（SQL 方言生成、表结构数据、版本快照）目前只能通过 GUI 使用，AI coding agent（Claude Code、pi、Cursor、Codex、Trae 等）无法直接读取项目数据或调用 SQL 导出能力。需要提供 CLI 入口与 Agent Skill 文档，让 agent 以标准化方式使用这些能力；同时通过桌面端应用内托管安装/更新，避免用户手动下载配置的负担（参考 LM Studio `lms`、VS Code `code` 命令的模式）。

## What Changes

- 新增 `dbd` CLI 二进制（src-tauri 增加 `[[bin]]` target），v1 仅**本地只读**命令：项目列表、表结构查询、版本列表、SQL 导出（复用 `dialect.rs` 与 services/storage 层）
- CLI 二进制内嵌 skill 文档，提供 `dbd skill install` 子命令，支持安装/更新到预设 agent 目标与自定义文件夹；skill 内容与 CLI 版本严格一致（单一事实来源）
- 桌面端设置页新增「Agent CLI」区域：安装状态与版本展示、一键安装/更新/卸载、PATH 注册、skill 安装目标管理、CLI 升级后 skill 落后提示
- 分发机制：GitHub Release 附多平台 `dbd` 资产与 sha256 校验文件；应用内通过 Releases API 检测新版本、下载、校验、落盘
- Windows 用户级 PATH 注册（注册表 `HKCU\Environment` 逐项追加 + 广播，禁止 `setx`）；安装前多副本冲突检测；卸载流程（清 PATH、删 skill、保留数据库）
- 明确排除：MCP 接入（后续独立 change）；远程库 diff/sync（v2，需先设计凭据门控——现有数据库含明文凭据，agent 触达远程库属于安全边界问题）；CLI 写操作

## Capabilities

### New Capabilities

- `agent-cli-integration`: dbd CLI 的本地只读命令集与数据定位规则、skill 安装目标注册表（预设 agent + 自定义文件夹）、桌面端托管安装/更新/卸载生命周期、PATH 注册与分发校验机制

### Modified Capabilities

（无——`local-app-settings` 现有需求不变；新增设置键属于实现细节，由新能力的需求覆盖）

## Impact

- **Rust 后端**：`src-tauri/Cargo.toml` 增加 `[[bin]] name = "dbd"`；`src/bin/dbd.rs` 新增 CLI 入口；`lib.rs` 私有模块改为 `pub mod` 供 bin 复用；新增命令模块 `agent_cli.rs` 与 `services/agent_cli_service.rs`（遵循 command → service 分层）；新增依赖 `clap`、`sha2`、`semver`、Windows 下 `winreg`
- **前端**：新增 `src/components/setting/agent-cli-tab.tsx` 并注册进 `setting.tsx`；i18n 双语（zh-CN/en-US）；`backend-messages.ts` 补错误映射
- **CI**：release 工作流增加多平台 `dbd` 构建产物与 sha256 上传
- **并发与安全**：CLI 连接需 busy_timeout（app 为每命令一连接模式，rusqlite 默认无超时）；数据目录复用 `dirs::data_dir()/db-designer`（用户级，CLI 天然定位同一份数据）；GitHub 下载需支持代理/镜像（后端目前无代理处理逻辑）
