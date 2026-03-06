import { invoke } from '@tauri-apps/api/core';

export interface DataTypeOption {
  value: string;      // 存储值，如 "varchar"
  label: string;      // 显示名，如 "VARCHAR"
  hasLength: boolean;  // 是否显示长度输入
  hasScale: boolean;   // 是否显示精度/小数位输入
  builtIn: boolean;    // 是否内置类型
}

// 19 种内置类型
export const BUILT_IN_DATA_TYPES: DataTypeOption[] = [
  // 整数
  { value: 'int', label: 'INT', hasLength: false, hasScale: false, builtIn: true },
  { value: 'bigint', label: 'BIGINT', hasLength: false, hasScale: false, builtIn: true },
  { value: 'smallint', label: 'SMALLINT', hasLength: false, hasScale: false, builtIn: true },
  { value: 'tinyint', label: 'TINYINT', hasLength: false, hasScale: false, builtIn: true },
  // 字符串
  { value: 'varchar', label: 'VARCHAR', hasLength: true, hasScale: false, builtIn: true },
  { value: 'char', label: 'CHAR', hasLength: true, hasScale: false, builtIn: true },
  { value: 'text', label: 'TEXT', hasLength: false, hasScale: false, builtIn: true },
  { value: 'longtext', label: 'LONGTEXT', hasLength: false, hasScale: false, builtIn: true },
  { value: 'mediumtext', label: 'MEDIUMTEXT', hasLength: false, hasScale: false, builtIn: true },
  // 小数
  { value: 'decimal', label: 'DECIMAL', hasLength: true, hasScale: true, builtIn: true },
  { value: 'float', label: 'FLOAT', hasLength: false, hasScale: false, builtIn: true },
  { value: 'double', label: 'DOUBLE', hasLength: false, hasScale: false, builtIn: true },
  // 日期时间
  { value: 'date', label: 'DATE', hasLength: false, hasScale: false, builtIn: true },
  { value: 'time', label: 'TIME', hasLength: false, hasScale: false, builtIn: true },
  { value: 'datetime', label: 'DATETIME', hasLength: false, hasScale: false, builtIn: true },
  { value: 'timestamp', label: 'TIMESTAMP', hasLength: false, hasScale: false, builtIn: true },
  // 其他
  { value: 'boolean', label: 'BOOLEAN', hasLength: false, hasScale: false, builtIn: true },
  { value: 'blob', label: 'BLOB', hasLength: false, hasScale: false, builtIn: true },
  { value: 'json', label: 'JSON', hasLength: false, hasScale: false, builtIn: true },
];

const SETTING_KEY = 'custom_data_types';

/**
 * 从 t_setting 加载自定义数据类型
 */
export async function loadCustomDataTypes(): Promise<DataTypeOption[]> {
  try {
    const allSettings = await invoke<{ [key: string]: string }>('get_all_settings');
    const json = allSettings[SETTING_KEY];
    if (!json) return [];
    const items: DataTypeOption[] = JSON.parse(json);
    return items.map(item => ({ ...item, builtIn: false }));
  } catch {
    return [];
  }
}

/**
 * 保存自定义数据类型到 t_setting
 */
export async function saveCustomDataTypes(types: DataTypeOption[]): Promise<void> {
  const data = types.map(({ value, label, hasLength, hasScale }) => ({
    value,
    label,
    hasLength,
    hasScale,
    builtIn: false,
  }));
  await invoke('save_setting', { key: SETTING_KEY, value: JSON.stringify(data) });
}

/**
 * 获取所有数据类型（内置 + 自定义）
 */
export async function getAllDataTypes(): Promise<DataTypeOption[]> {
  const custom = await loadCustomDataTypes();
  return [...BUILT_IN_DATA_TYPES, ...custom];
}

/**
 * 在给定列表中查找数据类型
 */
export function findDataType(types: DataTypeOption[], value: string): DataTypeOption | undefined {
  return types.find(t => t.value.toLowerCase() === value.toLowerCase());
}
