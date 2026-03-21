use rusqlite::params;

use crate::db::init_db;
use crate::dialect::get_connector;
use crate::models::*;

// 获取项目下的所有编程对象
#[tauri::command]
pub fn get_project_routines(project_id: i32) -> Result<Vec<RoutineDef>, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, type, body, comment, created_at, updated_at, db_type FROM t_routine WHERE project_id = ?1 ORDER BY type, name"
    ).map_err(|e| format!("Error preparing statement: {}", e))?;

    let iter = stmt.query_map(params![project_id], |row| {
        Ok(RoutineDef {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            r#type: row.get(3)?,
            body: row.get(4)?,
            comment: row.get(5)?,
            db_type: row.get(8)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    }).map_err(|e| format!("Error querying routines: {}", e))?;

    let mut results = Vec::new();
    for item in iter {
        results.push(item.map_err(|e| format!("Error reading routine: {}", e))?);
    }

    Ok(results)
}

// 保存编程对象（UPSERT）
#[tauri::command]
pub fn save_routine(routine: RoutineDef) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute(
        "INSERT INTO t_routine (id, project_id, name, type, body, comment, db_type, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now')) \
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, body=excluded.body, comment=excluded.comment, db_type=excluded.db_type, updated_at=datetime('now')",
        params![routine.id, routine.project_id, routine.name, routine.r#type, routine.body, routine.comment, routine.db_type],
    ).map_err(|e| format!("Error saving routine: {}", e))?;

    Ok("编程对象保存成功".to_string())
}

// 删除编程对象
#[tauri::command]
pub fn delete_routine(id: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error connecting to database: {}", e))?;

    conn.execute("DELETE FROM t_routine WHERE id = ?1", params![id])
        .map_err(|e| format!("Error deleting routine: {}", e))?;

    Ok("编程对象删除成功".to_string())
}

// 获取远程数据库的编程对象
#[tauri::command]
pub fn get_remote_routines_cmd(connection_id: i32) -> Result<Vec<RemoteRoutine>, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;
    let mut stmt = conn.prepare("SELECT type, host, port, username, password, database FROM t_database_connection WHERE id = ?1")
        .map_err(|e| format!("Error: {}", e))?;
    let (db_type, host, port, username, password, database): (String, String, i32, String, String, String) =
        stmt.query_row(params![connection_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        }).map_err(|e| format!("连接配置不存在: {}", e))?;

    let connector = get_connector(&db_type);
    connector.get_remote_routines(&host, port, &username, &password, &database)
}

// 比较本地和远程编程对象
#[tauri::command]
pub fn compare_routines(project_id: i32, remote_routines_json: String, db_type: String) -> Result<Vec<RoutineDiff>, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let remote_routines: Vec<RemoteRoutine> = serde_json::from_str(&remote_routines_json)
        .map_err(|e| format!("解析远程编程对象数据失败: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT name, type, body FROM t_routine WHERE project_id = ?1 AND (db_type = ?2 OR db_type IS NULL)"
    ).map_err(|e| format!("Error: {}", e))?;
    let local_routines: Vec<(String, String, String)> = stmt.query_map(params![project_id, db_type], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).map_err(|e| format!("Error: {}", e))?
      .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    // 按 name+type 建立映射
    use std::collections::HashMap;
    let local_map: HashMap<(String, String), String> = local_routines.iter()
        .map(|(n, t, b)| ((n.clone(), t.clone()), b.clone()))
        .collect();
    let remote_map: HashMap<(String, String), String> = remote_routines.iter()
        .map(|r| ((r.name.clone(), r.r#type.clone()), r.body.clone()))
        .collect();

    let mut diffs = Vec::new();

    // 本地有、远程没有
    for (name, rtype, body) in &local_routines {
        let key = (name.clone(), rtype.clone());
        if let Some(remote_body) = remote_map.get(&key) {
            // 都有，比较 body
            let local_trimmed = body.trim();
            let remote_trimmed = remote_body.trim();
            if local_trimmed == remote_trimmed {
                diffs.push(RoutineDiff {
                    name: name.clone(),
                    r#type: rtype.clone(),
                    status: "same".to_string(),
                    local_body: Some(body.clone()),
                    remote_body: Some(remote_body.clone()),
                });
            } else {
                diffs.push(RoutineDiff {
                    name: name.clone(),
                    r#type: rtype.clone(),
                    status: "different".to_string(),
                    local_body: Some(body.clone()),
                    remote_body: Some(remote_body.clone()),
                });
            }
        } else {
            diffs.push(RoutineDiff {
                name: name.clone(),
                r#type: rtype.clone(),
                status: "only_local".to_string(),
                local_body: Some(body.clone()),
                remote_body: None,
            });
        }
    }

    // 远程有、本地没有
    for r in &remote_routines {
        let key = (r.name.clone(), r.r#type.clone());
        if !local_map.contains_key(&key) {
            diffs.push(RoutineDiff {
                name: r.name.clone(),
                r#type: r.r#type.clone(),
                status: "only_remote".to_string(),
                local_body: None,
                remote_body: Some(r.body.clone()),
            });
        }
    }

    Ok(diffs)
}

// 将远程编程对象同步到本地
#[tauri::command]
pub fn sync_remote_routine_to_local(project_id: i32, remote_routine_json: String, db_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let remote: RemoteRoutine = serde_json::from_str(&remote_routine_json)
        .map_err(|e| format!("解析远程编程对象数据失败: {}", e))?;

    // 检查本地是否已有同 name+type+db_type 的记录
    let existing_id: Option<String> = conn.query_row(
        "SELECT id FROM t_routine WHERE project_id = ?1 AND name = ?2 AND type = ?3 AND db_type = ?4",
        params![project_id, remote.name, remote.r#type, db_type],
        |row| row.get(0),
    ).ok();

    if let Some(id) = existing_id {
        // 更新
        conn.execute(
            "UPDATE t_routine SET body = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![remote.body, id],
        ).map_err(|e| format!("更新编程对象失败: {}", e))?;
    } else {
        // 新建
        use std::time::{SystemTime, UNIX_EPOCH};
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let new_id = format!("routine_{}", ts);
        conn.execute(
            "INSERT INTO t_routine (id, project_id, name, type, body, comment, db_type, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, datetime('now'), datetime('now'))",
            params![new_id, project_id, remote.name, remote.r#type, remote.body, db_type],
        ).map_err(|e| format!("创建编程对象失败: {}", e))?;
    }

    Ok("同步成功".to_string())
}

// 导出项目所有编程对象的 SQL
#[tauri::command]
pub fn export_routines_sql(project_id: i32, database_type: String) -> Result<String, String> {
    let conn = init_db().map_err(|e| format!("Error: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT name, type, body, db_type FROM t_routine WHERE project_id = ?1 AND (db_type = ?2 OR db_type IS NULL) ORDER BY CASE type WHEN 'function' THEN 1 WHEN 'procedure' THEN 2 WHEN 'trigger' THEN 3 END, name"
    ).map_err(|e| format!("Error: {}", e))?;

    let routines: Vec<(String, String, String, Option<String>)> = stmt.query_map(params![project_id, database_type], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
    }).map_err(|e| format!("Error: {}", e))?
      .collect::<Result<Vec<_>, _>>().map_err(|e| format!("Error: {}", e))?;

    if routines.is_empty() {
        return Ok("-- 项目中暂无编程对象\n".to_string());
    }

    let mut sql = String::new();
    sql.push_str("-- 编程对象\n\n");

    for (name, rtype, body, db_type) in &routines {
        let type_label = match rtype.as_str() {
            "function" => "函数",
            "procedure" => "存储过程",
            "trigger" => "触发器",
            _ => "编程对象",
        };
        if db_type.is_none() {
            sql.push_str(&format!("-- {} : {} (未指定数据库类型)\n", type_label, name));
        } else {
            sql.push_str(&format!("-- {} : {}\n", type_label, name));
        }
        sql.push_str(body.trim());
        sql.push_str("\n\n");
    }

    Ok(sql)
}
