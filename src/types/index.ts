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

// Git平台类型
export type GitPlatform = 'github' | 'gitlab' | 'gitee';

// Git配置
export interface GitConfig {
  platform: GitPlatform;
  token: string;
  repositoryName: string;
  isInitialized: boolean;
}

// 后端返回的数据库类型选项
export interface DatabaseTypeOption {
  value: string;
  label: string;
  color: string;
}
