## 1. 数据库连接存储抽象

- [x] 1.1 在 `storage` 中新增数据库连接领域 trait 与 SQLite store，实现连接列表查询、创建、更新、删除及按 id 查询
- [x] 1.2 在 `services` 中新增数据库连接 service，并将 `db_connection.rs` 改造成仅负责 Tauri command 转发
- [x] 1.3 运行 `cargo check`，确认数据库连接模块抽象后编译通过

## 2. 例程模块存储抽象

- [x] 2.1 在 `storage` 中新增例程领域 trait 与 SQLite store，收口本地例程 CRUD 的 SQLite 读写
- [x] 2.2 在 `services` 中新增例程 service，迁移 `routine.rs` 本地 CRUD 与远程获取/比较/同步/导出编排逻辑
- [x] 2.3 运行 `cargo check`，确认例程模块抽象后编译通过

## 3. 版本模块存储抽象

- [x] 3.1 在 `storage` 中新增版本领域 trait 与 SQLite store，承接版本记录与版本快照的本地持久化
- [x] 3.2 在 `services` 中新增版本 service，迁移 `version.rs` 的快照组装、版本读写与 SQL 导出编排逻辑
- [x] 3.3 运行 `cargo check`，确认版本模块抽象后编译通过

## 4. 同步模块服务化编排

- [x] 4.1 在 `services` 中新增同步 service，复用数据库连接、表结构、例程等领域边界组合本地与远程数据访问
- [x] 4.2 将 `sync.rs` 改造成仅负责 Tauri command 转发，移除命令层中的直接 SQLite 访问
- [x] 4.3 运行 `cargo check`，确认同步模块服务化后编译通过

## 5. 集成验证

- [x] 5.1 运行 `cargo check` 与 `npx tsc --noEmit`，确认后端与前端类型检查通过
- [x] 5.2 手工验证数据库连接管理、例程管理、版本管理与同步核心流程行为未发生回归
