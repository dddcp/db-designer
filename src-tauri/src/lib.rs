mod db;
mod models;
mod project;
mod table;
mod setting;
mod git;
mod db_connection;
mod version;
mod sync;
mod routine;
pub mod dialect;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            db::init_database,
            project::get_projects,
            project::create_project,
            project::delete_project,
            git::get_git_info,
            git::sync_git_repository,
            git::init_git_repository,
            table::get_project_tables,
            table::save_table_structure,
            table::get_table_columns,
            table::save_table_indexes,
            table::get_table_indexes,
            table::get_init_data,
            table::save_init_data,
            table::delete_init_data,
            table::delete_table,
            setting::get_local_settings,
            setting::save_local_setting,
            setting::delete_local_setting,
            setting::get_setting,
            setting::save_setting,
            setting::delete_setting,
            setting::get_all_settings,
            db_connection::get_database_connections,
            db_connection::create_database_connection,
            db_connection::update_database_connection,
            db_connection::delete_database_connection,
            version::get_versions,
            version::create_version,
            version::delete_version,
            version::export_version_sql,
            version::export_upgrade_sql,
            version::export_project_sql,
            version::export_table_sql,
            sync::connect_database,
            sync::get_remote_tables,
            sync::compare_tables,
            sync::generate_sync_sql,
            sync::sync_remote_table_to_local,
            sync::sync_remote_columns_to_local,
            sync::sync_remote_indexes_to_local,
            dialect::get_supported_database_types,
            dialect::get_type_mappings,
            routine::get_project_routines,
            routine::save_routine,
            routine::delete_routine,
            routine::get_remote_routines_cmd,
            routine::compare_routines,
            routine::sync_remote_routine_to_local,
            routine::export_routines_sql
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
