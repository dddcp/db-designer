# AGENTS.md - DB Designer Development Guide

## Project Overview

DB Designer is a Tauri v2 desktop app for visually designing database table structures and generating SQL. It supports AI-powered table design, version management, remote DB comparison/sync, and SQL export for MySQL and PostgreSQL.

**Tech Stack:** React 18 + TypeScript + Ant Design 5 (frontend) | Rust + SQLite via rusqlite (backend) | Vite (build) | Tauri 2 (framework)

---

## Build Commands

### Frontend (React/TypeScript)

```bash
# Install dependencies
yarn install

# Start development (Vite dev server only - frontend)
yarn dev

# Type-check frontend only
npx tsc --noEmit

# Build for production
yarn build
```

### Backend (Rust/Tauri)

```bash
# Type-check Rust only (run from src-tauri/)
cd src-tauri && cargo check

# Build Rust backend
cd src-tauri && cargo build

# Run Rust tests (if any)
cd src-tauri && cargo test
```

### Full Tauri Application

```bash
# Start full development (Vite dev server + Rust backend)
yarn tauri dev

# Build production package
yarn tauri build
```

### Version Bump

When the user asks to update/bump the version, automatically invoke this script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Version x.y.z
```

The script will:
- Update version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Update `Cargo.lock`
- Create a git commit and tag
- Push to remote

**Note:** There are no test suites configured. Verify changes with `cargo check` (Rust) and `npx tsc --noEmit` (TypeScript).

---

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

### Frontend Routes

Three routes: `/` (project list), `/project/:id` (project detail), `/setting` (settings).

The project detail page (`components/proj-detail/index.tsx`) is the core — left sidebar for table list (with search), right pane with tabs for structure editing, indexes, init data, and SQL preview. Project-level tabs switch between table design, programmable objects (routines), version management, DB sync, and SQL export.

### Backend Modules (`src-tauri/src/`)

| Module | Role |
|--------|------|
| `lib.rs` | Plugin registration + command handler registry (central wiring) |
| `db.rs` | SQLite connection, schema creation, migrations |
| `models.rs` | All shared data structs (Rust side) |
| `dialect.rs` | `DatabaseDialect` trait (SQL generation) + `DatabaseConnector` trait (remote connection) with MySQL/PostgreSQL/Oracle implementations |
| `version.rs` | Version snapshots (tables + routines) + SQL export (`export_version_sql`, `export_upgrade_sql`, `export_project_sql`, `export_table_sql`) |
| `sync.rs` | Remote DB comparison + sync SQL generation |
| `table.rs` | Table/column/index/init-data CRUD |
| `routine.rs` | Programmable objects (functions/procedures/triggers) CRUD, remote comparison, sync, SQL export |
| `project.rs` | Project CRUD |
| `setting.rs` | Key-value settings store |
| `db_connection.rs` | DB connection config CRUD |
| `git.rs` | Git repository integration |

### SQLite Schema

Tables: `t_proj`, `t_table`, `t_column`, `t_index`, `t_index_field`, `t_init_data`, `t_version`, `t_routine`, `t_setting`, `t_database_connection`. Schema is created/migrated in `db.rs::init_database()`.

### Dialect System

The `dialect.rs` file is the database abstraction layer:
- `DatabaseDialect` trait: SQL generation methods (CREATE TABLE, ALTER, DROP, indexes, comments, type mapping)
- `DatabaseConnector` trait: Remote connection testing + table introspection + routine (function/procedure/trigger) fetching
- Factory functions: `get_dialect(db_type)` and `get_connector(db_type)`
- Adding a new dialect: implement both traits, add match arms in factories, add to `get_supported_database_types()`

SQL generation flow: raw type → `dialect.map_data_type()` → uppercase → append length/scale suffix → concatenate with dialect-specific clauses.

---

## Code Style Guidelines

### TypeScript/React (Frontend)

**Imports:**
- React imports first: `import React, { useState, useEffect } from 'react';`
- Third-party imports next: `import { invoke } from '@tauri-apps/api/core';`
- Ant Design imports next: `import { Button, Card, message } from 'antd';`
- Custom imports last: `import type { IndexDef } from '../../types';`
- Separate import groups with blank lines

**Naming Conventions:**
- Components: PascalCase (`IndexTab`, `AiDesignModal`)
- Functions/Variables: camelCase (`loadIndexes`, `selectedTable`)
- Types/Interfaces: PascalCase (`ColumnDef`, `TableDef`)
- File names: kebab-case for components (`index-tab.tsx`, `ai-design-modal.tsx`)
- Backend data interfaces prefixed: `BackendTableDef`, `BackendColumnDef`

**Types:**
- Use explicit types for props and state
- Use `interface` for object shapes, `type` for unions/primitives
- Import types with `import type { ... }` for type-only imports
- Frontend uses camelCase; Backend uses snake_case
- Type definitions live in `types/index.ts` (must stay in sync with `models.rs`)
- Data types defined in `data-types.ts` (19 built-in + user-custom types stored in settings)

**Error Handling:**
- Wrap async operations in try/catch
- Use `console.error` for logging errors
- Use Ant Design `message.error()` for user-facing errors
- Return early on invalid conditions

**Formatting:**
- Use 2 spaces for indentation
- No semicolons at end of statements
- Use template literals for string interpolation
- Prefer `const` over `let`, avoid `var`

### Rust (Backend)

**Module Organization:**
```rust
mod db;
mod models;
mod project;
mod table;
// pub mod for public APIs
pub mod dialect;
```

**Naming Conventions:**
- Modules/Files: snake_case (`table.rs`, `db_connection.rs`)
- Structs/Enums: PascalCase (`TableDef`, `DatabaseDialect`)
- Functions/Variables: snake_case (`get_project_tables`, `init_db`)
- Traits: PascalCase (`DatabaseDialect`, `DatabaseConnector`)
- Rust keywords: use `r#` prefix (e.g., `r#type`)

**Error Handling:**
- All Tauri commands return `Result<T, String>`
- Use `.map_err(|e| format!("Error connecting to database: {}", e))` pattern
- Use `?` operator where appropriate
- Error messages in Chinese (项目代码使用中文注释)

**Imports:**
```rust
use std::collections::HashMap;
use serde::Serialize;
use rusqlite::params;
use crate::db::init_db;
use crate::models::*;
```

**Data Structures (models.rs):**
- Use `#[derive(Debug, Serialize, Deserialize, Clone)]` for shared structs
- Use `#[serde(rename = "name")]` for field name mapping between Rust snake_case and TypeScript camelCase
- Use `#[serde(default)]` for optional fields with defaults

---

## Key Conventions

- All Tauri commands return `Result<T, String>` with `.map_err(|e| format!(...))`
- All database-specific SQL must go through `dialect.*` methods — never hardcode DB-specific logic
- Code comments are in Chinese (中文注释); follow the same style
- When modifying Rust structs in `models.rs`, update the corresponding TypeScript interface in `types/index.ts`
- Frontend uses Ant Design components exclusively — no custom CSS framework
- Column drag-and-drop sorting uses `@dnd-kit`
- Frontend state management: React hooks (useState, useEffect, useContext)
- 使用中文回复我
- 提交代码时需要将openspec同时提交