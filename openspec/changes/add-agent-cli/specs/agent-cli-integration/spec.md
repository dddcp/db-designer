# Spec Delta

## Purpose

让 AI coding agent 与脚本通过只读 CLI（`dbd`）读取 db-designer 项目数据并生成/导出 SQL；由桌面端托管 CLI 的安装、更新、卸载与 skill 部署，使各类 agent 以标准化方式接入，无需手动下载配置。

## ADDED Requirements

### Requirement: dbd CLI 提供本地只读命令集
`dbd` SHALL 仅提供本地只读命令：项目列表、表结构列表与详情、版本列表、按方言导出 SQL（复用既有方言生成逻辑）。CLI MUST NOT 提供连接远程数据库的命令，MUST NOT 提供修改项目数据的写命令。

#### Scenario: 按方言导出 SQL
- **WHEN** 用户或 agent 执行 `dbd export sql` 并指定项目与目标方言
- **THEN** CLI 输出符合该方言的建表 SQL，退出码为 0

#### Scenario: 项目或表不存在时给出明确错误
- **WHEN** 指定的项目 ID 或表名在数据中不存在
- **THEN** CLI 输出人类可读的错误信息并以非零退出码结束

#### Scenario: 不存在远程或写操作命令
- **WHEN** 查看命令帮助或尝试调用远程连接、写入类子命令
- **THEN** CLI 列出的命令集中不含远程连接与写命令，未知子命令返回非零退出码

### Requirement: CLI 与桌面端共享数据定位规则
CLI SHALL 默认解析与桌面端一致的用户级数据目录，并按与桌面端相同的规则响应 `DB_DESIGNER_DATA_PATH` 环境变量覆盖。当目标数据库文件不存在时，CLI SHALL 输出明确的"未找到数据，请确认桌面端已安装或数据路径"错误，MUST NOT 自动创建空数据库。

#### Scenario: 默认路径与桌面端一致
- **WHEN** 未设置 `DB_DESIGNER_DATA_PATH` 时在同一台机器分别运行桌面端与 `dbd projects list`
- **THEN** CLI 列出与桌面端相同的项目数据

#### Scenario: 环境变量覆盖时遵循同一目标
- **WHEN** `DB_DESIGNER_DATA_PATH` 指向自定义目录
- **THEN** CLI 读取该目录下的数据库，与桌面端在相同环境变量下的行为一致

#### Scenario: 数据库文件不存在
- **WHEN** 目标数据库文件不存在
- **THEN** CLI 输出明确的未找到数据错误并以非零退出码结束，且不创建任何新的数据库文件

### Requirement: CLI 并发访问不破坏数据
CLI 访问与桌面端共享的 SQLite 数据库时，连接 SHALL 设置等待超时；等待超时后 SHALL 返回人类可读的"数据库正忙"错误并以非零退出码结束，MUST NOT 产生损坏或部分写入。

#### Scenario: 桌面端占用写入时 CLI 读取
- **WHEN** 桌面端正在写入而 CLI 执行只读命令
- **THEN** CLI 在等待窗口内完成读取或返回"数据库正忙"错误，不崩溃且数据完好

### Requirement: skill 安装子命令
`dbd` SHALL 提供 skill 安装子命令，将二进制内嵌的 skill 文档写入指定目标；skill 文档 MUST 携带 CLI 版本号元数据；重复安装 SHALL 幂等覆盖（即更新）。MUST 支持自定义文件夹作为通用目标。

#### Scenario: 安装到自定义文件夹
- **WHEN** 执行 `dbd skill install --dir <路径>`
- **THEN** 该路径下生成（或更新）skill 文档文件，内容包含版本号

#### Scenario: 重复安装幂等
- **WHEN** 对同一目标重复执行安装
- **THEN** skill 文档被覆盖为当前版本内容，不产生重复或残留文件

### Requirement: 预设 skill 目标注册表
CLI SHALL 内置主流 agent 的预设安装目标（至少覆盖 Claude Code、pi、OpenCode、Cursor、Codex、Trae、Zcode、Kimi），每个目标定义类型（skill 目录型 / 指令文件追加型）、路径解析规则与文档模板变体。无法核实规范的目标 MUST NOT 进入预设注册表（可经调研后补充）。目标路径解析 SHALL 支持 Windows/macOS/Linux。

#### Scenario: 安装到 Claude Code 用户级 skills 目录
- **WHEN** 执行 `dbd skill install --target claude-code`
- **THEN** skill 文档写入该工具规范的用户级 skills 目录下，目录结构符合其规范

#### Scenario: 指令文件型目标的追加与更新
- **WHEN** 对指令文件追加型目标执行安装，且该文件已有本 CLI 写入的带版本标记的片段
- **THEN** 旧片段被替换为新版本内容，文件其余部分保持不变

#### Scenario: 未知目标报错并列出可选项
- **WHEN** `--target` 指定注册表中不存在的目标
- **THEN** CLI 以非零退出码报错并列出全部可用目标

### Requirement: 桌面端托管安装与更新
设置页 SHALL 展示 CLI 安装状态（未安装 / 已安装版本 / 可用最新版本），并提供一键安装与更新：从项目 GitHub Release 下载对应平台与架构的资产、校验 sha256、写入用户级安装目录。下载 SHALL 支持代理配置。校验失败时 MUST 拒绝安装并报告原因。

#### Scenario: 一键安装成功
- **WHEN** 用户在设置页点击安装且网络可用
- **THEN** CLI 二进制落盘到用户级安装目录，状态刷新为已安装及版本号

#### Scenario: 校验失败拒绝安装
- **WHEN** 下载的资产 sha256 与发布校验值不符
- **THEN** 安装被拒绝，已下载内容被丢弃，并展示明确错误

#### Scenario: 检测到新版本
- **WHEN** GitHub Release 存在比已安装版本更新的 CLI 版本
- **THEN** 设置页展示新版本号并提供更新入口

#### Scenario: 网络不可用可配置代理
- **WHEN** 直连 GitHub Release 失败且用户已配置代理
- **THEN** 下载经由代理重试成功

### Requirement: Windows 用户 PATH 注册
在 Windows 上，安装 SHALL 将安装目录追加到当前用户的 PATH 环境变量（注册表逐项追加，保留既有条目，不截断），并广播环境变量变更；已存在时 MUST NOT 重复追加。UI SHALL 提示 PATH 仅对新启动的进程生效。非 Windows 平台 SHALL 使用标准用户级可执行目录，若该目录不在 PATH 中则给出可复制的手动配置指引。

#### Scenario: 安装后新终端可找到 dbd
- **WHEN** 在 Windows 上完成安装并新开一个终端进程
- **THEN** 该目录出现在用户 PATH 注册表条目中，`dbd` 可被解析

#### Scenario: 重复安装不产生重复条目
- **WHEN** 已注册过安装目录后再次安装或更新
- **THEN** 用户 PATH 中该目录仅出现一次

### Requirement: 多副本冲突检测
安装或更新前，应用 SHALL 检测 PATH 上是否已存在同名的其他来源可执行文件（如 cargo install、手动安装）；检测到时 SHALL 在设置页警告并说明解析优先级。

#### Scenario: 检测到同名旧副本
- **WHEN** PATH 中已存在另一来源的 `dbd` 且其路径不同于安装目录
- **THEN** 设置页展示警告，指出两个路径及实际解析顺序

### Requirement: CLI 卸载
设置页 SHALL 提供卸载：删除 CLI 二进制、移除本应用添加的 PATH 条目、删除已安装的 skill 文件。用户数据库与项目数据 MUST 保留。

#### Scenario: 卸载清理且数据保留
- **WHEN** 用户在设置页执行卸载
- **THEN** 安装目录中的 CLI 二进制、PATH 条目与已安装 skill 被清除，项目数据完好

### Requirement: skill 与 CLI 版本一致性
已安装 skill 文件中的版本元数据 SHALL 被设置页读取并比对；CLI 更新后若 skill 落后，设置页 SHALL 提示并提供一键重装。

#### Scenario: CLI 升级后提示 skill 落后
- **WHEN** CLI 已更新到新版本而已安装 skill 的版本元数据较旧
- **THEN** 设置页展示落后提示与一键重装入口，重装后提示消除
