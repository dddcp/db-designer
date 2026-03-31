## 1. 存储抽象基础结构

- [x] 1.1 新增 `service` 与 `storage` 模块结构，并整理 `mod` 导出关系
- [x] 1.2 在 `storage` 层定义设置、项目、表结构三个领域的 store trait
- [x] 1.3 新增 SQLite store 实现入口，收口 `init_db()`、SQL 执行与行映射职责

## 2. 设置模块迁移

- [x] 2.1 提取 `SettingsService`，承接本地设置 key 分类、迁移与跨存储协调逻辑
- [x] 2.2 提取本地 JSON 设置存储实现，封装 `settings.json` 的读写
- [x] 2.3 提取 SQLite 设置存储实现，封装 `t_setting` 的查询、保存、删除能力
- [x] 2.4 改造 `setting.rs`，让 Tauri commands 仅调用 service 并保持现有对外接口不变

## 3. 项目模块迁移

- [x] 3.1 提取 `ProjectService`，收口项目列表、创建、删除的业务入口
- [x] 3.2 提取 SQLite `ProjectStore`，封装项目查询与创建逻辑
- [x] 3.3 将项目删除的级联删除逻辑迁移到 store 聚合方法，并从 `project.rs` 中移除直接 SQL 操作
- [x] 3.4 改造 `project.rs`，让 Tauri commands 仅调用 service 并保持现有返回行为

## 4. 表结构模块迁移

- [x] 4.1 提取 `TableService`，统一承接表结构、字段、索引、初始化数据相关业务入口
- [x] 4.2 提取 SQLite `TableStore`，封装表、列、索引、初始化数据的查询与写入逻辑
- [x] 4.3 将表结构保存、索引保存、初始化数据保存中的事务控制收口到 store 实现内部
- [x] 4.4 将表删除级联逻辑迁移到 store 聚合方法，并从 `table.rs` 中移除直接 SQL 操作
- [x] 4.5 改造 `table.rs`，让 Tauri commands 仅调用 service 并保持现有接口和结果不变

## 5. 集成与验证

- [x] 5.1 调整 `lib.rs` 与相关模块引用，确保 Tauri command 注册入口保持兼容
- [x] 5.2 运行 `cargo check` 验证 Rust 后端编译通过
- [ ] 5.3 手工验证项目管理、表结构编辑、索引保存、初始化数据保存、本地设置保存等核心流程行为未发生回归