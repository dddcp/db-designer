# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-29
**Commit:** da3003b
**Branch:** main

## OVERVIEW

Tauri v2 desktop app for visually designing database table structures and generating SQL. Supports AI-powered table design, version management, remote DB comparison/sync (MySQL/PostgreSQL/Oracle), SQL export, Git integration, and local SQLite persistence.

**Stack:** React 18 + TypeScript + Ant Design 5 (frontend) | Rust + SQLite via rusqlite (backend) | Vite 7 + Tauri 2

## STRUCTURE

```
├── src/                        # React frontend
│   ├── components/
│   │   ├── main/               # Project list page (1 file)
│   │   ├── proj-detail/        # Core design workspace (15 files) ← SEE AGENTS.md
│   │   └── setting/            # Settings tabs (6 files)
│   ├── i18n/                   # i18next (zh-CN, en-US)
│   ├── store/                  # theme-context.tsx (only global state)
│   ├── types/index.ts          # Shared TS types (mirrors models.rs)
│   └── data-types.ts           # 19 built-in + custom DB column types
├── src-tauri/src/              # Rust backend ← SEE AGENTS.md
│   ├── lib.rs                  # Plugin + command registry (57 commands)
│   ├── models.rs               # Shared Rust structs (mirrors types/index.ts)
│   ├── db.rs                   # SQLite init + migrations
│   ├── dialect.rs              # DatabaseDialect + DatabaseConnector traits
│   ├── {project,table,...}.rs  # Command modules (flat, no subfolder)
│   ├── services/               # Business logic layer
│   └── storage/                # Trait definitions + sqlite/ implementations
├── scripts/bump-version.ps1    # Sync version across 3 config files
└── openspec/                   # OpenSpec workflow (changes + specs)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a new Tauri command | `src-tauri/src/<module>.rs` + `lib.rs` + `services/` + `storage/sqlite/` | Must register in `generate_handler![]` |
| Add a new DB dialect | `src-tauri/src/dialect.rs` | Implement both `DatabaseDialect` + `DatabaseConnector`, add to factories |
| Add a new frontend tab | `src/components/proj-detail/<name>-tab.tsx` | Import into `index.tsx`, add to Tabs component |
| Add a new settings section | `src/components/setting/<name>-tab.tsx` | Import into `setting.tsx` |
| Add a new shared type | `src/types/index.ts` (TS) + `src-tauri/src/models.rs` (Rust) | Must keep in sync |
| Add SQLite storage | `src-tauri/src/storage/mod.rs` (trait) + `storage/sqlite/<name>_store.rs` (impl) | Follow existing Store trait pattern |
| Add a new service | `src-tauri/src/services/<name>_service.rs` + register in `mod.rs` | Services take `Box<dyn XxxStore>` |
| Change DB schema | `src-tauri/src/db.rs::init_database()` | Add `CREATE TABLE` or `ALTER TABLE` migration |
| Change i18n strings | `src/i18n/locales/zh-CN.json` + `en-US.json` + `backend-messages.ts` | Backend error messages in `backend-messages.ts` |
| Debug IPC issues | Browser DevTools → `invoke('command_name', {...})` | Frontend camelCase, backend snake_case |

## CODE MAP

### Frontend Key Symbols

| Symbol | Location | Role |
|--------|----------|------|
| `App` | `src/App.tsx` | Root: ThemeProvider → ConfigProvider → Router |
| `Main` | `src/components/main/main.tsx` | Route `/` — project list, Git sync, auto-update |
| `ProjectDetail` | `src/components/proj-detail/index.tsx` | Route `/project/:id` — core workspace (1299 lines) |
| `Setting` | `src/components/setting/setting.tsx` | Route `/setting` — tabs for basic/AI/DB/Git/data-type |
| `useTheme` | `src/store/theme-context.tsx` | Only global context: dark mode via localStorage |
| `BUILT_IN_DATA_TYPES` | `src/data-types.ts` | 19 built-in column types + custom type CRUD |
| `i18n` | `src/i18n/index.ts` | i18next init: localStorage → navigator → zh-CN fallback |

### Backend Key Symbols

| Symbol | Location | Role |
|--------|----------|------|
| `run()` | `lib.rs:24` | Tauri Builder entry — registers plugins + 57 commands |
| `DatabaseDialect` trait | `dialect.rs` | SQL generation methods (CREATE, ALTER, DROP, comments, type maps) |
| `DatabaseConnector` trait | `dialect.rs` | Remote DB connection + table/routine introspection |
| `get_dialect()` / `get_connector()` | `dialect.rs` | Factory functions by `db_type` string |
| `init_database` | `db.rs` | SQLite schema creation + 3 field migrations |
| `init_db()` | `db.rs` | SQLite connection (respects `DB_DESIGNER_DATA_PATH` env) |
| Storage traits | `storage/mod.rs` | `ProjectStore`, `TableStore`, `VersionStore`, etc. |
| SQLite impls | `storage/sqlite/` | Concrete `Box<dyn XxxStore>` implementations |
| Service layer | `services/` | Business logic coordinating dialect + storage |

## CONVENTIONS

- **No ESLint/Prettier** — verification via `npx tsc --noEmit` + `cargo check` only
- **No test suite** — no Jest, Vitest, or `#[cfg(test)]` exists
- **ESM only** — `package.json` has `"type": "module"`
- **Tauri IPC naming** — backend `snake_case` params, frontend `camelCase` params (auto-converted)
- **Error handling** — all Tauri commands return `Result<T, String>` with `.map_err(|e| format!(...))`
- **Backend layering enforcement** — `command → service → storage`; never put SQL or business logic in command modules
- **Chinese comments** — all code comments in 中文
- **i18n** — `src/i18n/` with `zh-CN` (default) + `en-US`; backend errors mapped in `backend-messages.ts`
- **Version sync** — `package.json`, `Cargo.toml`, `tauri.conf.json` must have identical version; use `scripts/bump-version.ps1`
- **DB path** — respects `DB_DESIGNER_DATA_PATH` env var, defaults to `<exe_dir>/data/db_designer.db`
- **CSP is null** — `tauri.conf.json` has `"csp": null` (disabled for dev convenience)
- **React state** — only `ThemeProvider` is global; all other state is component-level `useState`

## ANTI-PATTERNS (THIS PROJECT)

- **NEVER** hardcode DB-specific SQL outside `dialect.rs` — use trait methods
- **NEVER** let Rust/TS type fields drift — `models.rs` ↔ `types/index.ts` must stay in sync
- **NEVER** commit Git without user confirmation
- **NEVER** add test frameworks without explicit request — project verifies with `tsc --noEmit` + `cargo check`
- **NEVER** use `as any` or `@ts-ignore` — only `@ts-expect-error` with explanation (1 existing: `vite.config.ts:4`)
- **NEVER** skip `generate_handler![]` registration when adding Tauri commands
- **NEVER** use `unwrap()` in production Rust code — use `expect("reason")` or `.map_err()`
- **NEVER** auto-format without request — no Prettier/ESLint configured

## UNIQUE STYLES

- **Flat command layer** — all Rust command modules sit at `src-tauri/src/` root, no `commands/` subfolder
- **Monolithic type files** — `models.rs` (Rust) and `types/index.ts` (TS) are single large files
- **Separate data-types module** — `src/data-types.ts` lives outside `types/`, does its own `invoke()` calls
- **Storage abstraction with partial impls** — `storage/mysql/` and `storage/pg/` are empty placeholders; only `sqlite/` is implemented
- **Dialect double-trait** — each DB type implements both `DatabaseDialect` (SQL gen) and `DatabaseConnector` (remote introspection)
- **Backend i18n on frontend** — `src/i18n/backend-messages.ts` maps Rust error strings to localized UI messages

## COMMANDS

```bash
yarn install                    # Install frontend deps
yarn tauri dev                  # Start dev (Vite + Rust backend)
yarn tauri build                # Production build
npx tsc --noEmit                # Type-check frontend
cd src-tauri && cargo check     # Type-check backend
powershell -File scripts/bump-version.ps1 -Version x.y.z  # Bump version
```

## NOTES

- Database migrations are idempotent `ALTER TABLE ADD COLUMN` with `let _ =` (errors silently ignored for existing columns)
- `services/sync_service/` subdirectory exists but is empty — `sync_service.rs` is a flat file in `services/`
- `src/test/` directory exists but is empty
- `public/` directory is empty — all assets loaded via frontend bundling
- `console.log` debug statements exist in `proj-detail/index.tsx:557-559` — should be removed before production
- 3 `unwrap()` calls in Rust production code (dialect.rs:1123, sync_service.rs:943, routine_service.rs:126) — should be `expect()` or `.map_err()`
- Error messages are mixed Chinese/English across backend modules
