// 项目类型定义
export interface Project {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// 前端列定义
export interface ColumnDef {
  id: string;
  name: string;        // 字段名（英文）
  displayName: string; // 中文名称
  type: string;        // 数据类型
  length?: number;     // 长度/精度
  scale?: number;      // 小数位数
  nullable: boolean;   // 是否为空
  primaryKey: boolean; // 是否为主键
  autoIncrement: boolean; // 是否自增
  defaultValue?: string;  // 默认值
  defaultNull: boolean;   // 是否 DEFAULT NULL
  comment?: string;    // 说明
  order: number;       // 排序
}

// 前端表定义
export interface TableDef {
  id: string;
  name: string;        // 表名（英文）
  displayName: string; // 中文名
  columns: ColumnDef[];
}

// 后端表定义
export interface BackendTableDef {
  id: string;
  project_id: number;
  name: string;
  display_name: string;
  comment?: string;
  created_at: string;
  updated_at: string;
}

// 后端列定义
export interface BackendColumnDef {
  id: string;
  table_id: string;
  name: string;
  display_name: string;
  data_type: string;
  length?: number;
  scale?: number;
  nullable: boolean;
  primary_key: boolean;
  auto_increment: boolean;
  default_value?: string;
  default_null: boolean;
  comment?: string;
  sort_order: number;
}

// 索引定义
export interface IndexDef {
  id: string;
  name: string;
  type: 'normal' | 'unique' | 'fulltext';
  columns: string[];
  comment?: string;
}

// 数据库连接配置
export interface DatabaseConnection {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  created_at?: string;
  updated_at?: string;
}

// Git信息类型定义
export interface GitInfo {
  branch: string;
  latest_commit: string;
}

// Git远程模式
export type GitRemoteMode = 'preset' | 'custom';

// Git平台类型
export type GitPlatform = 'github' | 'gitlab' | 'gitee' | 'gitea';

// Git认证类型
export type GitAuthType = 'token' | 'ssh';

// Git远程配置
export interface GitRemoteConfig {
  mode: GitRemoteMode;
  platform?: GitPlatform;
  baseUrl?: string;
  repository: string;
  remoteUrl?: string;
}

// Git认证配置
export interface GitAuthConfig {
  authType: GitAuthType;
  username?: string;
  token?: string;
}

// Git配置
export interface GitConfig {
  remote: GitRemoteConfig;
  auth: GitAuthConfig;
  isInitialized: boolean;
}

// 后端返回的数据库类型选项
export interface DatabaseTypeOption {
  value: string;
  label: string;
  color: string;
}

// 编程对象（函数/存储过程/触发器）
export interface RoutineDef {
  id: string;
  project_id: number;
  name: string;
  type: 'function' | 'procedure' | 'trigger';
  body: string;
  comment?: string;
  db_type?: string;
  created_at: string;
  updated_at: string;
}

// 远程编程对象
export interface RemoteRoutine {
  name: string;
  type: 'function' | 'procedure' | 'trigger';
  body: string;
}

// 编程对象差异
export interface RoutineDiff {
  name: string;
  type: 'function' | 'procedure' | 'trigger';
  status: 'only_local' | 'only_remote' | 'different' | 'same';
  local_body?: string;
  remote_body?: string;
}

// 远程索引
export interface RemoteIndex {
  name: string;
  index_type: string;
  column_names: string[];
}

// 远程表
export interface RemoteTable {
  name: string;
  comment: string | null;
  columns: RemoteColumn[];
  indexes: RemoteIndex[];
}

// 远程列
export interface RemoteColumn {
  name: string;
  data_type: string;
  length: number | null;
  nullable: boolean;
  column_key: string;
  extra: string;
  default_value: string | null;
  comment: string | null;
}

// 表差异
export interface TableDiff {
  table_name: string;
  status: string;
  local_display_name: string | null;
  column_diffs: ColumnDiff[];
  index_diffs: IndexDiff[];
}

// 列差异
export interface ColumnDiff {
  column_name: string;
  status: string;
  local_type: string | null;
  remote_type: string | null;
  detail: string | null;
}

// 索引差异
export interface IndexDiff {
  index_name: string;
  status: string;
  local_type: string | null;
  remote_type: string | null;
  local_columns: string | null;
  remote_columns: string | null;
  detail: string | null;
}
