# Rust Backend (src-tauri/src/)

## OVERVIEW

Tauri v2 backend: 57 IPC commands, SQLite persistence, multi-database SQL generation (MySQL/PostgreSQL/Oracle), remote DB introspection, Git integration, AI review. Strict 3-layer architecture: `command → service → storage`.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Register a new command | `lib.rs` | Add to `tauri::generate_handler![...]` |
| Add a command handler | `<module>.rs` (flat in this dir) | Follow existing pattern: params → service call → Result |
| Add a service | `services/<name>_service.rs` + `services/mod.rs` | Inject `Box<dyn XxxStore>` |
| Add a storage trait | `storage/mod.rs` | Define trait + add to `sqlite/mod.rs` impl |
| Add SQLite impl | `storage/sqlite/<name>_store.rs` + `storage/sqlite/mod.rs` | Follow Store trait pattern |
| Add a DB dialect | `dialect.rs` | Implement both `DatabaseDialect` + `DatabaseConnector`, add to factories |
| Change DB schema | `db.rs::init_database()` | `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN` migration |
| Add a shared type | `models.rs` | Must sync with `src/types/index.ts` |
| Change DB path logic | `db.rs::get_database_path()` | Respects `DB_DESIGNER_DATA_PATH` env |

## CONVENTIONS

- **Flat module layout** — all command `.rs` files sit directly here, no `commands/` subfolder
- **Command modules** only do `#[tauri::command]` + param mapping + service delegation; NO business logic
- **All commands** return `Result<T, String>` with `.map_err(|e| format!("context: {}", e))`
- **Service layer** takes `Box<dyn XxxStore>` — never import `rusqlite` directly in services
- **Dialect layer** is the ONLY place for DB-specific SQL generation — never put `SELECT * FROM` or `CREATE TABLE` in services/commands
- **Chinese comments** — `// 中文注释` throughout
- **Serde rename** — Rust keywords like `type` use `#[serde(rename = "type")] pub r#type: String`
- **Snake_case params** — command parameters use `snake_case`; Tauri auto-converts from frontend `camelCase`
- **Migrations** — idempotent `ALTER TABLE ADD COLUMN` with `let _ = conn.execute_batch(...)` (ignore errors for existing columns)

## ANTI-PATTERNS

- **NEVER** put SQL or business logic in command modules — delegate to services
- **NEVER** import `rusqlite` in service or command modules — use storage traits
- **NEVER** hardcode DB-specific SQL outside `dialect.rs` — use trait methods
- **NEVER** use `unwrap()` — use `expect("reason")` or `.map_err()`
- **NEVER** let `models.rs` and `src/types/index.ts` drift — keep in sync
- **NEVER** forget `generate_handler![]` registration in `lib.rs`

## KEY FILES

| File | Lines | Role |
|------|-------|------|
| `lib.rs` | 92 | `run()` builds Tauri app: 4 plugins + 57 commands |
| `models.rs` | 254 | All Rust data structs (mirrors TypeScript `types/index.ts`) |
| `dialect.rs` | 1076 | `DatabaseDialect` + `DatabaseConnector` traits, MySQL/PG/Oracle impls |
| `db.rs` | 183 | `init_database()` creates 11 tables + 3 migrations, `init_db()` returns connection |
| `git.rs` | 451 | Git init/pull/push operations via `git2` crate |
| `sync_service.rs` | 872 | Remote DB compare/sync orchestration (largest service) |

## NOTES

- `storage/mysql/` and `storage/pg/` are empty placeholders — only `sqlite/` is implemented
- `services/sync_service/` subdirectory exists but is empty — `sync_service.rs` is a flat file
- 3 `unwrap()` calls need fixing: `dialect.rs:1123`, `sync_service.rs:943`, `routine_service.rs:126`
- Error messages are mixed Chinese/English — consider standardizing