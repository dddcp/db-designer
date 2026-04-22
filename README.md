<div align="center">

# DB Designer

**AI-Powered Database Schema Design Tool**

Natural Language Table Design / AI Index Optimization / AI Table Refactoring / Multi-Database Support / Version Management / Schema Sync

[🇺🇸 English](#) | [🇨🇳 简体中文](README.zh-CN.md)

[![Release](https://img.shields.io/github/v/release/dddcp/db-designer?style=flat-square)](https://github.com/dddcp/db-designer/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/dddcp/db-designer?tab=MIT-1-ov-file#readme)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/dddcp/db-designer/releases)

</div>

---

## AI Capabilities

DB Designer deeply integrates large language models to cover the core aspects of database design:

| Capability | Description |
|------------|-------------|
| **Natural Language Table Design** | Describe your business needs in a sentence, and AI generates the complete table structure, columns, types, and constraints automatically. |
| **Project Context Awareness** | When designing new tables, AI automatically injects existing table structures, indexes, and metadata to understand the full business context, ensuring consistent naming conventions and reasonable relationships. |
| **AI Table Refactoring** | Select any table, describe your modification intent in natural language, and AI generates the adjusted complete structure. |
| **AI Design Preference Reuse** | Save reusable AI design prompts (e.g., primary key types, naming habits, audit fields) in the settings page. These are automatically injected into subsequent table generation. |
| **AI Index Recommendation** | Provide slow query SQL or business characteristics (data volume, read/write ratio, performance pain points), and AI analyzes and recommends optimal index schemes with one-click creation. |

> Compatible with all OpenAI API format model services (OpenAI / DeepSeek / Tongyi Qianwen / Local Ollama, etc.). Configure in the settings page.

## Features

| Feature | Description |
|---------|-------------|
| Table Structure Design | Visually design tables, columns, and indexes with drag-and-drop sorting support. |
| Metadata Management | Configure metadata for tables, support Excel import and INSERT statement export. |
| Version Management | Take snapshots of project structures, support version diff comparison and SQL export. |
| Database Comparison | Connect to remote MySQL / PostgreSQL / Oracle, compare differences between local design and online structure. |
| Database Sync | Compare with online databases to generate incremental scripts; one-click sync of online table structures and programmable objects to the model library. |
| Programmable Object Management | Supports CRUD, remote comparison, one-click sync, and SQL export for functions, stored procedures, and triggers. |
| SQL Export | One-click export of complete SQL (table structure + indexes + metadata + programmable objects), supporting MySQL / PostgreSQL / Oracle. |
| Git Data Sync | Manage design data through Git, support push and pull from remote (dangerous operations come with confirmation prompts). |
| Local Config & Storage | Based on SQLite local storage, no internet required, no server needed. |

## Screenshots

### AI Table Design

<p align="center">
  <img src="./doc/images/setting_ai.png" width="80%" />
</p>
<p align="center">
  <img src="./doc/images/ai_design.png" width="80%" />
</p>
<p align="center">
  <img src="./doc/images/ai_index_design.png" width="80%" />
</p>

### SQL Export

<p align="center">
  <img src="./doc/images/export_sql.png" width="80%" />
</p>

### Programmable Object Management & Sync

Supports unified management of functions, stored procedures, and triggers. Filter by database type for export and sync, suitable for projects with many database objects.

### Database Comparison & Sync

<p align="center">
  <img src="./doc/images/sync_db.png" width="80%" />
</p>

## Installation

Download the installer for your platform from [Releases](https://github.com/dddcp/db-designer/releases):

| Platform | Format |
|----------|--------|
| Windows | `.msi` / `.exe` |
| macOS | `.dmg` |
| Linux | `.deb` / `.AppImage` |

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.70
- [Yarn](https://yarnpkg.com/)

### Start Development

```bash
# Install frontend dependencies
yarn install

# Start development mode
yarn tauri dev
```

### Build Production

```bash
yarn tauri build
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Tauri 2](https://tauri.app/) |
| Frontend | React 18 + TypeScript + Ant Design 5 |
| Backend | Rust + SQLite (rusqlite) |
| Database Connections | mysql / postgres / Oracle adapters |
| Build Tool | Vite |

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
