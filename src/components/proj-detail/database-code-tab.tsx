import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getAllDataTypes, findDataType } from '../../data-types';
import type { DataTypeOption } from '../../data-types';
import {
  Card,
  Button,
  Space,
  Typography,
  Input,
  message,
  Select,
  Row,
  Col
} from 'antd';
import {
  CopyOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

import type { TableDef } from '../../types';

interface IndexField {
  column_id: string;
  sort_order: number;
}

interface IndexInfo {
  id: string;
  table_id: string;
  name: string;
  index_type: string;
  comment: string | null;
  fields: IndexField[];
}

interface InitData {
  id: number;
  table_id: string;
  data: string;
  created_at: string;
}

interface DatabaseCodeTabProps {
  selectedTable: TableDef | null;
}

/**
 * 数据库代码生成组件
 */
const DatabaseCodeTab: React.FC<DatabaseCodeTabProps> = ({ selectedTable }) => {
  const [sqlCode, setSqlCode] = useState('');
  const [databaseType, setDatabaseType] = useState('mysql');
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [initData, setInitData] = useState<InitData[]>([]);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);

  // 加载数据类型
  useEffect(() => {
    getAllDataTypes().then(setDataTypes);
  }, []);

  // 加载索引和初始数据
  const loadExtraData = async (tableId: string) => {
    try {
      const [idxResult, dataResult] = await Promise.all([
        invoke<IndexInfo[]>('get_table_indexes', { tableId }),
        invoke<InitData[]>('get_init_data', { tableId }),
      ]);
      setIndexes(idxResult);
      setInitData(dataResult);
    } catch (error) {
      console.error('加载索引/初始数据失败:', error);
      setIndexes([]);
      setInitData([]);
    }
  };

  // 当表变化时加载额外数据
  useEffect(() => {
    if (selectedTable) {
      loadExtraData(selectedTable.id);
    } else {
      setIndexes([]);
      setInitData([]);
    }
  }, [selectedTable?.id]);

  // 当表、数据库类型、索引、初始数据或数据类型变化时重新生成代码
  useEffect(() => {
    if (selectedTable && dataTypes.length > 0) {
      generateSQL();
    }
  }, [selectedTable, databaseType, indexes, initData, dataTypes]);

  /**
   * 根据 column_id 查找列名
   */
  const resolveColumnName = (columnId: string): string => {
    if (!selectedTable) return '?';
    const col = selectedTable.columns.find(c => c.id === columnId);
    return col ? col.name : '?';
  };

  /**
   * 生成SQL代码
   */
  const generateSQL = () => {
    if (!selectedTable) return;
    const sql = databaseType === 'mysql' ? generateMySQLCode() : generatePostgreSQLCode();
    setSqlCode(sql);
  };

  /**
   * 生成MySQL代码
   */
  const generateMySQLCode = () => {
    if (!selectedTable) return '';

    let sql = `-- ${selectedTable.displayName} (${selectedTable.name})\n`;
    sql += `CREATE TABLE ${selectedTable.name} (\n`;

    const columnDefinitions = selectedTable.columns.map(column => {
      let definition = `  ${column.name} ${column.type.toUpperCase()}`;
      const dt = findDataType(dataTypes, column.type);

      if (column.length && dt?.hasScale) {
        definition += `(${column.length},${column.scale || 0})`;
      } else if (column.length && dt?.hasLength) {
        definition += `(${column.length})`;
      }
      if (!column.nullable) {
        definition += ' NOT NULL';
      }
      if (column.autoIncrement) {
        definition += ' AUTO_INCREMENT';
      }
      if (column.defaultValue) {
        definition += ` DEFAULT '${column.defaultValue}'`;
      }
      // 注释：优先 comment，回退 displayName
      const commentText = column.comment || column.displayName;
      if (commentText) {
        definition += ` COMMENT '${commentText}'`;
      }

      return definition;
    });

    sql += columnDefinitions.join(',\n');

    const primaryKeys = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (${primaryKeys.map(pk => pk.name).join(', ')})`;
    }

    sql += '\n);\n\n';
    sql += `ALTER TABLE ${selectedTable.name} COMMENT = '${selectedTable.displayName}';\n`;

    // 索引
    if (indexes.length > 0) {
      sql += '\n';
      for (const idx of indexes) {
        const colNames = idx.fields.map(f => resolveColumnName(f.column_id));
        const uniqueStr = idx.index_type === 'unique' ? 'UNIQUE ' : '';
        sql += `CREATE ${uniqueStr}INDEX ${idx.name} ON ${selectedTable.name} (${colNames.join(', ')});\n`;
      }
    }

    // 初始数据
    if (initData.length > 0 && selectedTable.columns.length > 0) {
      sql += '\n';
      const colNames = selectedTable.columns.map(c => c.name);
      sql += `-- ${selectedTable.displayName} 初始数据\n`;
      for (const item of initData) {
        try {
          const data = JSON.parse(item.data);
          const values = colNames.map(cn => {
            const v = data[cn];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return String(v);
            if (typeof v === 'boolean') return v ? '1' : '0';
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sql += `INSERT INTO ${selectedTable.name} (${colNames.join(', ')}) VALUES (${values.join(', ')});\n`;
        } catch { /* skip invalid JSON */ }
      }
    }

    return sql;
  };

  /**
   * 生成PostgreSQL代码
   */
  const generatePostgreSQLCode = () => {
    if (!selectedTable) return '';

    let sql = `-- ${selectedTable.displayName} (${selectedTable.name})\n`;
    sql += `CREATE TABLE ${selectedTable.name} (\n`;

    const columnDefinitions = selectedTable.columns.map(column => {
      let definition = `  ${column.name} ${column.type.toUpperCase()}`;
      const dt = findDataType(dataTypes, column.type);

      if (column.length && dt?.hasScale) {
        definition += `(${column.length},${column.scale || 0})`;
      } else if (column.length && dt?.hasLength) {
        definition += `(${column.length})`;
      }
      if (!column.nullable) {
        definition += ' NOT NULL';
      }
      if (column.autoIncrement) {
        definition += ' GENERATED ALWAYS AS IDENTITY';
      }
      if (column.defaultValue) {
        definition += ` DEFAULT '${column.defaultValue}'`;
      }

      return definition;
    });

    sql += columnDefinitions.join(',\n');

    const primaryKeys = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (${primaryKeys.map(pk => pk.name).join(', ')})`;
    }

    sql += '\n);\n\n';

    // 表注释
    sql += `COMMENT ON TABLE ${selectedTable.name} IS '${selectedTable.displayName}';\n`;

    // 列注释：优先 comment，回退 displayName
    selectedTable.columns.forEach(column => {
      const commentText = column.comment || column.displayName;
      if (commentText) {
        sql += `COMMENT ON COLUMN ${selectedTable.name}.${column.name} IS '${commentText}';\n`;
      }
    });

    // 索引
    if (indexes.length > 0) {
      sql += '\n';
      for (const idx of indexes) {
        const colNames = idx.fields.map(f => resolveColumnName(f.column_id));
        const uniqueStr = idx.index_type === 'unique' ? 'UNIQUE ' : '';
        sql += `CREATE ${uniqueStr}INDEX ${idx.name} ON ${selectedTable.name} (${colNames.join(', ')});\n`;
      }
    }

    // 初始数据
    if (initData.length > 0 && selectedTable.columns.length > 0) {
      sql += '\n';
      const colNames = selectedTable.columns.map(c => c.name);
      sql += `-- ${selectedTable.displayName} 初始数据\n`;
      for (const item of initData) {
        try {
          const data = JSON.parse(item.data);
          const values = colNames.map(cn => {
            const v = data[cn];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return String(v);
            if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sql += `INSERT INTO ${selectedTable.name} (${colNames.join(', ')}) VALUES (${values.join(', ')});\n`;
        } catch { /* skip invalid JSON */ }
      }
    }

    return sql;
  };

  /**
   * 复制SQL代码
   */
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(sqlCode);
      message.success('SQL代码已复制到剪贴板');
    } catch (error) {
      message.error('复制失败，请手动复制');
    }
  };

  if (!selectedTable) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">请从左侧选择一个表生成数据库代码</Text>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col>
              <Title level={4} style={{ margin: 0 }}>数据库代码</Title>
            </Col>
            <Col>
              <Select
                value={databaseType}
                onChange={setDatabaseType}
                style={{ width: 120 }}
              >
                <Option value="mysql">MySQL</Option>
                <Option value="postgresql">PostgreSQL</Option>
              </Select>
            </Col>
            <Col flex="auto">
              <Space style={{ float: 'right' }}>
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={handleCopyCode}
                  disabled={!sqlCode}
                >
                  复制代码
                </Button>
              </Space>
            </Col>
          </Row>
        </div>

        <TextArea
          value={sqlCode}
          readOnly
          rows={20}
          style={{
            fontFamily: 'monospace',
            fontSize: '14px',
            resize: 'none'
          }}
          placeholder="选择表后自动生成数据库代码..."
        />

        <div style={{ marginTop: 16 }}>
          <Text type="secondary">
            提示：此代码基于当前表结构自动生成，包含表结构、索引和初始数据。
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default DatabaseCodeTab;
