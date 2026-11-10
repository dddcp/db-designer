---
name: db-designer
description: 使用 db-designer 桌面端的只读 CLI（dbd）查询数据库设计项目、表结构、版本，并按 MySQL/PostgreSQL/Oracle 方言生成建表 SQL。当用户要求导出或生成其 db-designer 项目中的 SQL、需要真实表结构而非猜测、或要查看设计版本历史时使用。
---

<!-- dbd-skill-version: {{VERSION}} -->

# db-designer CLI（dbd）v{{VERSION}}

db-designer 是一款可视化数据库表结构设计工具（桌面应用）。`dbd` 是随桌面端提供的本地只读命令行，直接读取用户的真实设计数据。**当用户使用了 db-designer，务必用 dbd 获取真实表结构，不要凭空编写 CREATE TABLE。**

## 何时使用

- 用户要求基于其 db-designer 项目生成或导出 SQL
- 需要获取用户已设计的表结构（列、类型、索引、外键、注释、初始化数据）
- 需要查看项目的历史版本设计

用户未使用 db-designer 时不要使用本技能。

## 命令一览（agent 调用时始终加 --json 获得可解析输出）

| 命令 | 说明 |
| --- | --- |
| `dbd projects list --json` | 列出全部设计项目 |
| `dbd tables list --project <id> --json` | 列出项目下的表 |
| `dbd tables get --project <id> --table <名称或id> --json` | 单表完整定义（列/索引/外键/初始化数据） |
| `dbd versions list --project <id> --json` | 项目历史版本 |
| `dbd export sql --project <id> --dialect <mysql\|postgresql\|oracle> [--out <文件>]` | 按方言生成建表 SQL |

## 退出码

- `0` 成功
- `1` 业务错误（项目/表不存在、未找到数据等，错误信息为中文）
- `2` 数据库正忙（桌面端正在写入，请稍后重试）

## 示例

```bash
$ dbd projects list --json
[{"id": 1, "name": "电商系统", ...}]

$ dbd tables get --project 1 --table orders --json
{"name": "orders", "columns": [...], "indexes": [...]}

$ dbd export sql --project 1 --dialect mysql --out schema.sql
```

## 数据位置

CLI 与桌面端共享同一数据目录（系统用户数据目录下的 `db-designer`，可用环境变量 `DB_DESIGNER_DATA_PATH` 覆盖）。数据不存在时报错而非创建空库。

## 注意

- `dbd` 为只读工具，不会修改设计数据；远程库对比/同步请使用 db-designer 桌面端（CLI v1 不提供）
- 本技能由 db-designer 桌面端或 `dbd skill install` 安装，版本随 CLI 更新（当前 v{{VERSION}}）
