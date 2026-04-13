use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::dialect::{get_connector, normalize_routine_body};
use crate::models::{RemoteRoutine, RoutineDef, RoutineDiff};
use crate::services::database_connection_service::DatabaseConnectionService;
use crate::storage::sqlite::routine_store::SqliteRoutineStore;
use crate::storage::RoutineStore;

pub struct RoutineService {
    store: Box<dyn RoutineStore>,
    database_connection_service: DatabaseConnectionService,
}

impl RoutineService {
    pub fn new() -> Self {
        Self {
            store: Box::new(SqliteRoutineStore::new()),
            database_connection_service: DatabaseConnectionService::new(),
        }
    }

    pub fn get_project_routines(&self, project_id: i32) -> Result<Vec<RoutineDef>, String> {
        self.store.get_project_routines(project_id)
    }

    pub fn save_routine(&self, routine: RoutineDef) -> Result<String, String> {
        self.store.save_routine(routine)?;
        Ok("编程对象保存成功".to_string())
    }

    pub fn delete_routine(&self, id: String) -> Result<String, String> {
        self.store.delete_routine(&id)?;
        Ok("编程对象删除成功".to_string())
    }

    pub fn get_remote_routines(&self, connection_id: i32) -> Result<Vec<RemoteRoutine>, String> {
        let connection = self
            .database_connection_service
            .get_database_connection_by_id(connection_id)?
            .ok_or_else(|| "连接配置不存在".to_string())?;

        let connector = get_connector(&connection.r#type);
        connector.get_remote_routines(
            &connection.host,
            connection.port,
            &connection.username,
            &connection.password,
            &connection.database,
        )
    }

    pub fn compare_routines(&self, project_id: i32, remote_routines_json: String, db_type: String) -> Result<Vec<RoutineDiff>, String> {
        let remote_routines: Vec<RemoteRoutine> = serde_json::from_str(&remote_routines_json)
            .map_err(|e| format!("解析远程编程对象数据失败: {}", e))?;

        let local_routines = self.store.get_project_routines_by_db_type(project_id, &db_type)?;

        let local_map: HashMap<(String, String), String> = local_routines
            .iter()
            .map(|routine| ((routine.name.clone(), routine.r#type.clone()), routine.body.clone()))
            .collect();
        let remote_map: HashMap<(String, String), String> = remote_routines
            .iter()
            .map(|routine| ((routine.name.clone(), routine.r#type.clone()), routine.body.clone()))
            .collect();

        let mut diffs = Vec::new();

        for routine in &local_routines {
            let key = (routine.name.clone(), routine.r#type.clone());
            if let Some(remote_body) = remote_map.get(&key) {
                let local_normalized = normalize_routine_body(routine.body.trim(), &db_type);
                let remote_normalized = normalize_routine_body(remote_body.trim(), &db_type);
                let status = if local_normalized == remote_normalized {
                    "same"
                } else {
                    "different"
                };

                diffs.push(RoutineDiff {
                    name: routine.name.clone(),
                    r#type: routine.r#type.clone(),
                    status: status.to_string(),
                    local_body: Some(routine.body.clone()),
                    remote_body: Some(remote_body.clone()),
                });
            } else {
                diffs.push(RoutineDiff {
                    name: routine.name.clone(),
                    r#type: routine.r#type.clone(),
                    status: "only_local".to_string(),
                    local_body: Some(routine.body.clone()),
                    remote_body: None,
                });
            }
        }

        for routine in &remote_routines {
            let key = (routine.name.clone(), routine.r#type.clone());
            if !local_map.contains_key(&key) {
                diffs.push(RoutineDiff {
                    name: routine.name.clone(),
                    r#type: routine.r#type.clone(),
                    status: "only_remote".to_string(),
                    local_body: None,
                    remote_body: Some(routine.body.clone()),
                });
            }
        }

        Ok(diffs)
    }

    pub fn sync_remote_routine_to_local(&self, project_id: i32, remote_routine_json: String, db_type: String) -> Result<String, String> {
        let remote: RemoteRoutine = serde_json::from_str(&remote_routine_json)
            .map_err(|e| format!("解析远程编程对象数据失败: {}", e))?;

        let routine_id = self
            .store
            .get_routine_by_signature(project_id, &remote.name, &remote.r#type, &db_type)?
            .map(|routine| routine.id)
            .unwrap_or_else(|| {
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis();
                format!("routine_{}", ts)
            });

        let routine = RoutineDef {
            id: routine_id,
            project_id,
            name: remote.name,
            r#type: remote.r#type,
            body: normalize_routine_body(&remote.body, &db_type),
            comment: None,
            db_type: Some(db_type),
            created_at: String::new(),
            updated_at: String::new(),
        };

        self.store.save_routine(routine)?;
        Ok("同步成功".to_string())
    }

    pub fn export_routines_sql(&self, project_id: i32, database_type: String) -> Result<String, String> {
        let routines = self.store.get_project_routines_by_db_type(project_id, &database_type)?;

        if routines.is_empty() {
            return Ok("-- 项目中暂无编程对象\n".to_string());
        }

        let mut sql = String::new();
        sql.push_str("-- 编程对象\n\n");

        for routine in &routines {
            let type_label = match routine.r#type.as_str() {
                "function" => "函数",
                "procedure" => "存储过程",
                "trigger" => "触发器",
                _ => "编程对象",
            };
            if routine.db_type.is_none() {
                sql.push_str(&format!("-- {} : {} (未指定数据库类型)\n", type_label, routine.name));
            } else {
                sql.push_str(&format!("-- {} : {}\n", type_label, routine.name));
            }
            sql.push_str(normalize_routine_body(routine.body.trim(), &database_type).trim());
            sql.push_str("\n\n");
        }

        Ok(sql)
    }
}
