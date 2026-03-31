## Context

当前 `src-tauri/src/project.rs`、`src-tauri/src/table.rs`、`src-tauri/src/setting.rs` 直接作为 Tauri command 实现，同时承担业务编排、事务管理、SQL 执行和行映射职责。`src-tauri/src/db.rs` 提供的 `init_db()` 被多个模块直接调用，使 SQLite 连接细节泄漏到命令层。由于未来需要支持远程存储，如果继续沿用当前结构，后续每个 command 都需要重写。

## Goals / Non-Goals

**Goals:**
- 将后端持久化重构为 command -> service -> store 的三层结构。
- 让 command 层只负责 IPC 输入输出，不再依赖 `rusqlite` 类型或直接执行 SQL。
- 以领域为边界拆分 store，例如 `SettingStore`、`ProjectStore`、`TableStore`，由 SQLite 实现这些 trait。
- 先完成 `setting`、`project`、`table` 三个模块的第一阶段改造，并保持现有前端命令名与行为稳定。
- 为未来新增 MySQL/PostgreSQL store 实现预留扩展点。

**Non-Goals:**
- 本次不实现远程存储读写。
- 本次不修改前端调用协议与交互流程。
- 本次不重构 `routine`、`version`、`sync` 等全部模块，只为后续迁移提供模板。
- 本次不引入新的 ORM 或第三方持久化框架。

## Decisions

### 1. 使用领域化 store trait，而不是单一 DB 包装层
采用按领域拆分的 store trait，例如 `SettingStore`、`ProjectStore`、`TableStore`，而不是提供一个薄的通用数据库工具层。

- 这样可以让 service 依赖更稳定的业务接口，而不是依赖底层 SQL 能力。
- 未来接入远程存储时，可以按领域分别补齐实现，而不是从通用 DB API 反推业务能力。
- 相比一个巨大的统一 trait，领域化 store 更容易按模块渐进迁移。

备选方案：单一 `Storage`/`Database` 抽象层。
未采用原因：容易演变为万能接口，仍然让业务层暴露底层连接和事务语义，不利于未来远程实现。

### 2. command 层保留在现有模块中，先做“薄命令化”
`setting.rs`、`project.rs`、`table.rs` 继续作为 Tauri command 注册入口，`lib.rs` 中的 command 名称保持不变；模块内部改为调用 service。

- 可以避免前端 IPC 改动。
- 可以用最小成本分阶段替换内部实现。
- 后续若需要再进一步将 command 文件与 service 文件彻底分离，也不会影响已建立的边界。

备选方案：一次性重命名/拆分所有 command 文件。
未采用原因：首阶段改动面过大，不利于平滑迁移。

### 3. service 层负责业务编排，事务细节由 SQLite store 封装
service 层负责组织业务流程，但不直接接触 `rusqlite::Connection` 或 `Transaction`。涉及事务的完整业务操作（如保存表结构、删除项目级联删除）通过 store 的聚合方法完成。

- 这样可以避免将 SQLite 专属事务类型泄漏到 service 层。
- 未来远程存储实现可用自身事务或批处理机制替换，而不影响上层调用。
- 对 `table` 和 `project` 中已有的级联删除、全量替换写入场景尤其重要。

备选方案：在 service 层显式持有连接并传入 store。
未采用原因：会将 SQLite 事务模型继续向上泄漏，削弱抽象意义。

### 4. 设置模块拆分为双存储后端示例
`setting` 模块天然包含两类存储：本地 `settings.json` 与 SQLite `t_setting`。本次将其拆成：
- `LocalSettingsStore`：负责 JSON 文件读写
- `SettingStore`：负责 SQLite `t_setting`
- `SettingsService`：负责 key 分类、本地设置迁移、跨存储协调

这样可以先在最简单但最典型的场景中验证三层结构。

### 5. 第一阶段新增 service/storage 模块，不改动模型结构
优先复用 `models.rs` 中已有的数据结构，避免本次同时引入 DTO 重构。只有当 service 层确实需要聚合参数时，才新增少量内部请求结构。

- 降低首阶段风险。
- 避免因为模型迁移引起前后端类型联动。

## Risks / Trade-offs

- [模块数量增加] → 通过按 `setting/project/table` 三个领域逐步迁移，先建立模板，再推广到其他模块。
- [部分逻辑仍暂时保留在旧模块] → 接受阶段性混合状态，但要求首批模块完成后 command 层不再直接访问 SQLite。
- [级联删除和全量覆盖写入容易在迁移时行为漂移] → 保持 command 名称和返回值不变，并用 `cargo check` 与现有手工流程验证行为一致。
- [未来远程存储事务模型不同] → 现在就禁止 `rusqlite::Transaction` 向 service/command 层泄漏，把事务控制封装在 store 实现内部。

## Migration Plan

1. 新增 `service` 与 `storage` 目录结构，以及 SQLite store 实现入口。
2. 先改造 `setting`：抽出 `SettingsService`、`LocalSettingsStore`、SQLite `SettingStore`，保留现有 command 名称。
3. 改造 `project`：抽出 `ProjectService` 与 SQLite `ProjectStore`，将项目删除级联逻辑收口到 store 聚合方法。
4. 改造 `table`：抽出 `TableService` 与 SQLite `TableStore`，将表结构保存、索引保存、初始化数据保存等事务逻辑收口到 store。
5. 调整 `lib.rs`、模块导出与依赖引用，确保 Tauri 注册入口不变。
6. 运行 `cargo check` 验证 Rust 后端编译通过；如前端类型未改动则无需额外 IPC 兼容调整。

回滚策略：如果单个领域改造出现问题，可只回退该领域 service/store 文件和对应 command 调用，不影响其余模块。

## Open Questions

- store trait 是按文件平铺组织，还是使用 `storage/sqlite/` 分层目录组织；建议实现时优先选择目录化方案。
- `project` 删除时是否应同时把与项目相关的 routine 删除逻辑一并纳入第一阶段；现有代码主要覆盖表与版本，实施时需要按当前真实行为校准。
- `table` 相关能力是否拆分为 `TableStore`、`IndexStore`、`InitDataStore` 三个 trait，还是先以一个聚合型 `TableStore` 落地；首阶段建议先聚合，后续再细分。