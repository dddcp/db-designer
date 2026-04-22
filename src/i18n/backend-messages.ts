import i18n from '../i18n';

const backendMessageMap: Record<string, string> = {
  save_success: 'save_success',
  delete_success: 'delete_success',
  project_not_found: 'proj_not_exist',
  project_delete_success: 'main_delete_success',
  project_delete_failed: 'main_delete_fail',
  local_setting_save_success: 'save_success',
  local_setting_delete_success: 'delete_success',
  setting_save_success: 'save_success',
  setting_delete_success: 'delete_success',
  db_connection_save_success: 'db_conn_save_success',
  db_connection_delete_success: 'db_conn_delete_success',
  table_structure_save_success: 'save_success',
  index_save_success: 'save_success',
  init_data_save_success: 'save_success',
  init_data_delete_success: 'delete_success',
  table_delete_success: 'table_delete_success',
  routine_save_success: 'routine_save_success',
  routine_delete_success: 'routine_delete_success',
  git_init_success: 'git_init_success',
  git_sync_success: 'git_sync_success',
  git_nothing_to_commit: 'git_nothing_to_commit',
  git_pull_success: 'git_pull_success',
  sync_connect_success: 'sync_connect_success',
  sync_success: 'sync_sync_success',
  version_delete_success: 'version_delete_success',
};

export function translateBackendMessage(msg: string): string {
  if (!msg) return msg;
  const key = backendMessageMap[msg];
  if (key && i18n.exists(key)) {
    return i18n.t(key);
  }
  return msg;
}