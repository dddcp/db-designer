# db-designer

数据库模型设计工具，AI智能设计表结构，与数据库对比模型

![](https://img.shields.io/badge/free-pricing?logo=free&color=%20%23155EEF&label=pricing&labelColor=%20%23528bff)


## Features

* 设计数据库✅
* 初始数据管理✅
* 版本管理✅
* 数据库比对✅
* AI自动设计数据表✅
* 通过SQLite和Json本地存储✅
* 通过git管理数据（适配GitHub/GitLab/Gitee）✅

## Planned features

* 导出项目/表的初始数据的sql✅
* 版本管理导出sql和初始数据✅
* 数据库比对，不同的可以一键导入到设计模型中


# 项目截图

## AI设计表结构

![alt title](./doc/images/setting_ai.png)
![alt title](./doc/images/ai_design.png)

## 导出SQL
![alt title](./doc/images/export_sql.png)

## 数据库对比和同步

![alt title](./doc/images/sync_db.png)




# 项目打包

```bash
yarn tauri build
```

# 后台模块

┌──────────────────┬─────────────────────────────────────────────────────────────────────────────┐
│      Module      │                                   Content                                   │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ db.rs            │ get_data_dir, get_database_path, init_db, init_database                     │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ models.rs        │ All struct definitions (Project, TableDef, ColumnDef, IndexDef, etc.)       │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ project.rs       │ project CRUD + delete_table                                                 │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ table.rs         │ table/column/index CRUD, init_data CRUD                                     │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ setting.rs       │ setting CRUD                                                                │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ git.rs           │ git info/init/sync                                                          │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ version.rs       │ version CRUD + export_version_sql + export_upgrade_sql + export_project_sql │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ db_connection.rs │ database connection CRUD                                                    │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ sync.rs          │ remote tables, compare, generate_sync_sql + related structs                 │
├──────────────────┼─────────────────────────────────────────────────────────────────────────────┤
│ lib.rs           │ mod declarations + run()                                                    │
└──────────────────┴─────────────────────────────────────────────────────────────────────────────┘