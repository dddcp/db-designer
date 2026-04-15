# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DB Designer is a Tauri v2 desktop app for visually designing database table structures and generating SQL. It supports AI-powered table design, version management, remote DB comparison/sync, SQL export, Git integration, and local settings/config persistence for MySQL and PostgreSQL workflows.

**Tech stack:** React 18 + TypeScript + React Router + Ant Design 5 (frontend) | Rust + SQLite via rusqlite (backend) | Vite 7 (build) | Tauri 2 (framework)

## Development Commands

```bash
# Install frontend dependencies
yarn install

# Start development (launches both Vite dev server and Rust backend)
yarn tauri dev

# Build production package
yarn tauri build

# Type-check frontend only
npx tsc --noEmit

# Type-check Rust backend only (run from src-tauri/)
cd src-tauri && cargo check

# Bump version across all config files
powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Version x.y.z
```

There are no test suites configured. Verify changes with `cargo check` (Rust) and `npx tsc --noEmit` (TypeScript).

## Architecture

### Frontend ↔ Backend Communication

All frontend-backend communication uses Tauri's IPC via `invoke()`. Every Tauri command must be:
1. Defined with `#[tauri::command]` in a Rust module
2. Registered in `lib.rs` → `tauri::generate_handler![...]`
3. Called from frontend: `invoke<ReturnType>('command_name', { params })`

**Naming convention:** 
- Rust 后端命令参数使用 `snake_case`（如 `project_id`, `table_id`, `database_type`）
- 前端 invoke 调用参数使用 `camelCase`（如 `projectId`, `tableId`, `databaseType`）
- Tauri 自动转换，无需手动处理
- Rust struct 字段与 keyword 冲突时（如 `type`），使用 `#[serde(rename = "type")] pub r#type: String`

### Backend Modules (`src-tauri/src/`)

| Module | Role |
|--------|------|
| `lib.rs` | Tauri plugin registration + command handler registry |
| `db.rs` | SQLite connection, schema creation, migrations |
| `models.rs` | Shared Rust-side data structs |
| `dialect.rs` | `DatabaseDialect` trait (SQL generation) + `DatabaseConnector` trait (remote connection/introspection) |
| `project.rs` / `table.rs` / `routine.rs` / `version.rs` / `sync.rs` / `setting.rs` / `db_connection.rs` | Tauri command layer; validates IPC input and delegates to services |
| `services/` | Business logic layer for projects, tables, routines, versions, sync, settings, and DB connections |
| `storage/` | Storage abstraction layer; currently defines traits and SQLite-backed implementations entrypoint |
| `git.rs` | Git repository integration |
| `main.rs` | Desktop entrypoint |

### Backend Layering

When adding or refactoring backend features, prefer this flow:

`Tauri command` → `service` → `storage`

- Command modules own `#[tauri::command]` functions and IPC-facing parameter mapping
- Services contain business logic and coordinate dialect / storage operations
- Storage traits isolate persistence details so future remote/local store backends can be swapped in more easily
- Keep database-specific SQL generation inside `dialect.rs`, not in services or command handlers

### Frontend Structure (`src/`)

Three routes: `/` (project list), `/project/:id` (project detail), `/setting` (settings).

The project detail page (`components/proj-detail/index.tsx`) is the core screen:
- Left sidebar: table list, search, create/edit/delete actions
- Main work area: structure editing, indexes, init data, SQL preview
- Project-level views: table design, programmable objects (routines), version management, DB sync, SQL export
- AI helpers: `ai-design-modal.tsx`, `ai-modify-table-modal.tsx`, `ai-recommend-index-modal.tsx`
- Drag-and-drop column sorting is implemented with `@dnd-kit`

Type definitions live in `types/index.ts` (must stay in sync with `models.rs`). Besides table/project types, it also defines routine, remote sync diff, Git, and DB connection types used across the app. Data types are defined in `data-types.ts` (built-in + user-custom types stored in settings).

### Tauri Commands Currently Registered

`src-tauri/src/lib.rs` currently wires commands for:
- project CRUD
- table / column / index / init-data CRUD
- local settings + key-value settings
- database connection CRUD
- version snapshot creation / deletion / SQL export
- remote DB connect / compare / sync
- dialect metadata (`get_supported_database_types`, `get_type_mappings`)
- routine CRUD / remote compare / sync / SQL export
- Git init / sync / info

If you add a new command, update both the command module and `tauri::generate_handler![...]` in `lib.rs`.

### Shared Type Sync

If you change Rust structs in `models.rs`, also update matching TypeScript definitions in `src/types/index.ts`. Current TS types include:
- `Project`, `TableDef`, `ColumnDef`
- `BackendTableDef`, `BackendColumnDef`
- `IndexDef`, `DatabaseConnection`, `DatabaseTypeOption`
- `GitInfo`, `GitConfig`, `GitPlatform`
- `RoutineDef`, `RemoteRoutine`, `RoutineDiff`
- `RemoteTable`, `RemoteColumn`, `RemoteIndex`
- `TableDiff`, `ColumnDiff`, `IndexDiff`

Do not let Rust/TypeScript field names drift.

### Dialect System

The `dialect.rs` file is the database abstraction layer:
- `DatabaseDialect` trait: SQL generation methods (CREATE TABLE, ALTER, DROP, indexes, comments, type mapping)
- `DatabaseConnector` trait: Remote connection testing + table introspection + routine (function/procedure/trigger) fetching
- Factory functions: `get_dialect(db_type)` and `get_connector(db_type)`
- Adding a new dialect: implement both traits, add match arms in factories, add to `get_supported_database_types()`

SQL generation flow: raw type → `dialect.map_data_type()` → uppercase → append length/scale suffix → concatenate with dialect-specific clauses.

### SQLite Schema

Tables: `t_proj`, `t_table`, `t_column`, `t_index`, `t_index_field`, `t_init_data`, `t_version`, `t_routine`, `t_setting`, `t_database_connection`. Schema is created/migrated in `db.rs::init_database()`.

## Key Conventions

- All Tauri commands return `Result<T, String>` with `.map_err(|e| format!(...))` for error handling
- Rust backend command parameters use `snake_case`; frontend `invoke()` calls use `camelCase`
- All database-specific SQL must go through `dialect.*` methods — never hardcode DB-specific logic
- Prefer backend layering as `command -> service -> storage`
- Code comments are in Chinese (中文注释); follow the same style
- When modifying Rust structs in `models.rs`, update the corresponding TypeScript interface in `types/index.ts`
- Frontend uses Ant Design components exclusively — no custom CSS framework
- Column drag-and-drop sorting uses `@dnd-kit`
- Verify changes with `cargo check` in `src-tauri/` and `npx tsc --noEmit` in repo root
- Keep `lib.rs` command registration, Rust models, and frontend types in sync when adding features
- 提交代码时候需要将openspec一起提交

## Current Dependency Notes

- Frontend routing uses `react-router-dom` v7
- Build uses Vite 7 + TypeScript 5.8
- Tauri plugins currently include opener, updater, process, and dialog
- There is no dedicated automated test suite yet; type-check / cargo-check are the expected verification steps
