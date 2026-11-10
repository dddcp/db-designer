# Tasks: add-agent-cli

## 1. 预设目标调研与 skill 模板

- [ ] 1.1 逐一核实 8 个预设目标（claude-code、pi、opencode、cursor、codex、trae、zcode、kimi）的 skills/等价机制路径与格式：以官方文档为准，参考本机 OpenSpec 适配器目录 `E:\node-data\npm-prefix\node_modules\@fission-ai\openspec\dist\core\command-generation\adapters\`；产出核对表（目标 → kind → 三平台路径 → 模板变体），核实不出规范的从预设剔除。验证：核对表完成并逐目标标注 ✅/❌
- [ ] 1.2 编写 SKILL.md 模板：命令表、`--json` 用法与退出码、`export sql` 示例、"何时用 dbd 而非直接写 SQL"、`{{VERSION}}` 占位符。验证：模板定稿并含版本占位符

## 2. CLI 骨架

- [ ] 2.1 `Cargo.toml` 增加 `[[bin]] name = "dbd"` 及 `clap`/`sha2`/`semver` 依赖（Windows 目标追加 `winreg`、`windows-sys` 最小 feature）；`lib.rs` 私有模块改 `pub mod`。验证：`cd src-tauri && cargo check` 通过，`cargo build --release --bin dbd` 产出二进制
- [ ] 2.2 新建 `src/bin/dbd.rs`：clap 命令骨架（projects/tables/versions/export/skill 子命令占位、全局 `--json`、`--version`、退出码约定 0/1/2）。验证：`dbd --version` 与各子命令 `--help` 输出正常
- [ ] 2.3 新建 `src-tauri/src/skill_targets.rs`：目标结构体与注册表（按 1.1 结果）、SkillsDir/InstructionFile 两类 kind 的三平台路径解析、`{{VERSION}}` 模板渲染、标记块替换逻辑（只动自身标记块）。验证：`cargo check` 通过；临时目录手测写入与重复覆盖幂等

## 3. CLI 数据命令（v1 只读面）

- [ ] 3.1 数据定位与空库防御：复用 `get_database_path()`；数据库文件不存在或关键表缺失时报明确中文错误（提示先启动桌面端），不调用 `init_database()`、不创建新库文件。验证：无数据环境运行 `dbd projects list` 输出明确错误且目录未生成新 .db
- [ ] 3.2 所有连接统一 `busy_timeout(5s)`，超时以退出码 2 输出"数据库正忙"错误。验证：桌面端持续写入期间运行只读命令，观察等待与报错行为，数据完好
- [ ] 3.3 实现 `projects list`、`tables list|get --project`、`versions list --project` 及 `--json` 输出。验证：与桌面端同库抽查数据一致（项目数、表字段、版本数）
- [ ] 3.4 实现 `export sql --project --dialect mysql|postgresql|oracle [--out]`，复用 dialect 层生成逻辑。验证：同一项目导出的 SQL 与桌面端"导出 SQL"结果一致

## 4. CLI skill 子命令

- [ ] 4.1 实现 `dbd skill install --target <id>|--dir <path>` 与 `dbd skill list`（含各目标安装状态）；未知目标报错并列出全部可选项。验证：安装到自定义目录与本机真实 agent 目录（如 `~/.pi/agent/skills`），重复安装幂等，错误路径返回退出码 1

## 5. CI 分发资产

- [ ] 5.1 release 工作流增加 `dbd` 多平台构建（平台矩阵与现有 tauri 构建一致）、产物改名 `dbd-<rust-triple>(.exe)`、生成 `.sha256` 并上传到 Release。验证：跑一次发布，资产与校验文件齐全，本地 `sha256sum -c` 通过

## 6. 桌面端后端（service + 命令）

- [ ] 6.1 新建 `services/agent_cli_service.rs`：`cli_get_status`（已装版本、`releases/latest` semver 比较、skill 落后检测）、下载 → sha256 校验 → 临时文件 → 原子落盘；新增设置键 `cli_proxy_url`/`cli_mirror_url` 经 setting_service 存 `settings.json`，下载经代理/镜像重试。验证：`cargo check` 通过；开发环境手测状态查询与真实下载校验、断网换代理重试成功
- [ ] 6.2 Windows PATH：`winreg` 以 raw 读写保留 `REG_EXPAND_SZ`、逐项追加去重、`windows-sys` 广播 `WM_SETTINGCHANGE`（失败不阻断）；Unix 端 `~/.local/bin` 不在 PATH 时输出可复制指引。验证：本机注册表项新增目录且重复执行不产生重复条目；代码评审确认未使用 `setx`
- [ ] 6.3 多副本检测（枚举 PATH 找同名 `dbd` 并列出解析顺序）与卸载（删二进制、PATH 精确移除、按注册表清理 skill，数据不动）。验证：伪造 PATH 旧副本出现警告；卸载后安装目录/PATH/skill 清空且项目数据完好
- [ ] 6.4 新建 `agent_cli.rs` 薄命令（`cli_get_status`/`cli_install`/`cli_update`/`cli_uninstall`/`cli_install_skill`/`cli_check_copies`），注册 `generate_handler![]`，错误 `.map_err` 中文消息。验证：`cargo check` 通过；DevTools `invoke('cli_get_status')` 返回结构正确

## 7. 设置页 UI 与 i18n

- [ ] 7.1 新建 `src/components/setting/agent-cli-tab.tsx`（状态卡片、安装/更新/卸载按钮、skill 目标多选、代理/镜像输入、多副本与 skill 落后提示、"重开终端生效"文案）并注册进 `setting.tsx`。验证：`npx tsc --noEmit` 通过；页面手测安装 → 更新 → 卸载全流程
- [ ] 7.2 i18n `zh-CN.json`/`en-US.json` 新增键 + `backend-messages.ts` 新错误映射。验证：切换两种语言检查无缺键、错误消息正确映射

## 8. 端到端集成验证

- [ ] 8.1 全流程清单走查：安装（含校验失败拒绝路径）→ 新终端解析 `dbd` → skill 安装到 Claude Code/pi 真实目录 → 在 agent 会话中调用 `dbd export sql --json` 完成一次 SQL 生成 → CLI 更新 → skill 落后提示与一键重装 → 卸载清理。验证：清单逐项记录结果，发现问题回修后复跑
