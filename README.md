<div align="center">

# DB Designer

**轻量级数据库模型设计工具**

AI 智能设计表结构 / 多数据库支持 / 版本管理 / 结构同步

[![Release](https://img.shields.io/github/v/release/dddcp/db-designer?style=flat-square)](https://github.com/dddcp/db-designer/releases)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](https://github.com/dddcp/db-designer?tab=MIT-1-ov-file#readme)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square)](https://github.com/dddcp/db-designer/releases)

</div>

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 表结构设计 | 可视化设计表、列、索引，支持拖拽排序 |
| AI 智能建表 | 接入 AI 大模型，自然语言描述即可生成表结构 |
| 元数据管理 | 为表配置元数据，支持导出 INSERT 语句 |
| 版本管理 | 对项目结构打快照，支持版本间差异对比和 SQL 导出 |
| 数据库比对 | 连接远程 MySQL / PostgreSQL，对比本地设计与线上结构差异 |
| 数据库同步 | 对比线上，生成增量脚本；一键同步线上到模型库 |
| SQL 导出 | 一键导出完整 SQL（表结构 + 索引 + 元数据），支持 MySQL / PostgreSQL |
| Git 数据同步 | 通过 Git 管理设计数据，适配 GitHub / GitLab / Gitee |
| 本地存储 | 基于 SQLite 本地存储，无需联网、无需服务端 |

## 截图预览

### AI 设计表结构

<p align="center">
  <img src="./doc/images/setting_ai.png" width="80%" />
</p>
<p align="center">
  <img src="./doc/images/ai_design.png" width="80%" />
</p>

### SQL 导出

<p align="center">
  <img src="./doc/images/export_sql.png" width="80%" />
</p>

### 数据库对比与同步

<p align="center">
  <img src="./doc/images/sync_db.png" width="80%" />
</p>

## 安装

前往 [Releases](https://github.com/dddcp/db-designer/releases) 下载对应平台安装包：

| 平台 | 格式 |
|------|------|
| Windows | `.msi` / `.exe` |
| macOS | `.dmg` |
| Linux | `.deb` / `.AppImage` |

## 本地开发

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) >= 1.70
- [Yarn](https://yarnpkg.com/)

### 启动开发环境

```bash
# 安装前端依赖
yarn install

# 启动开发模式
yarn tauri dev
```

### 构建生产包

```bash
yarn tauri build
```

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | [Tauri 2](https://tauri.app/) |
| 前端 | React 18 + TypeScript + Ant Design 5 |
| 后端 | Rust + SQLite (rusqlite) |
| 数据库连接 | mysql / postgres crate |
| 构建工具 | Vite |
