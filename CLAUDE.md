# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DB Designer is a Tauri v2 desktop app for visually designing database table structures and generating SQL. It supports AI-powered table design, version management, remote DB comparison/sync, and SQL export for MySQL and PostgreSQL.

**Tech stack:** React 18 + TypeScript + Ant Design 5 (frontend) | Rust + SQLite via rusqlite (backend) | Vite (build) | Tauri 2 (framework)

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

**Naming convention:** Rust structs use `snake_case` fields; TypeScript interfaces use `camelCase`. Tauri handles the conversion automatically. When a Rust field conflicts with a keyword (e.g., `type`), use `#[serde(rename = "type")] pub r#type: String`.

### Backend Modules (`src-tauri/src/`)

| Module | Role |
|--------|------|
| `lib.rs` | Plugin registration + command handler registry (central wiring) |
| `db.rs` | SQLite connection, schema creation, migrations |
| `models.rs` | All shared data structs (Rust side) |
| `dialect.rs` | `DatabaseDialect` trait (SQL generation) + `DatabaseConnector` trait (remote connection) with MySQL/PostgreSQL implementations |
| `version.rs` | Version snapshots (tables + routines) + SQL export (`export_version_sql`, `export_upgrade_sql`, `export_project_sql`, `export_table_sql`) |
| `sync.rs` | Remote DB comparison + sync SQL generation |
| `table.rs` | Table/column/index/init-data CRUD |
| `routine.rs` | Programmable objects (functions/procedures/triggers) CRUD, remote comparison, sync, SQL export |
| `project.rs` | Project CRUD |
| `setting.rs` | Key-value settings store |
| `db_connection.rs` | DB connection config CRUD |
| `git.rs` | Git repository integration |

### Frontend Structure (`src/`)

Three routes: `/` (project list), `/project/:id` (project detail), `/setting` (settings).

The project detail page (`components/proj-detail/index.tsx`) is the core — left sidebar for table list (with search), right pane with tabs for structure editing, indexes, init data, and SQL preview. Project-level tabs switch between table design, programmable objects (routines), version management, DB sync, and SQL export.

Type definitions live in `types/index.ts` (must stay in sync with `models.rs`). Data types are defined in `data-types.ts` (19 built-in + user-custom types stored in settings).

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
- All database-specific SQL must go through `dialect.*` methods — never hardcode DB-specific logic
- Code comments are in Chinese (中文注释); follow the same style
- When modifying Rust structs in `models.rs`, update the corresponding TypeScript interface in `types/index.ts`
- Frontend uses Ant Design components exclusively — no custom CSS framework
- Column drag-and-drop sorting uses `@dnd-kit`
