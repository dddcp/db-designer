import React, { useState, useEffect } from 'react';
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

// 表定义
interface TableDef {
  id: string;
  name: string;
  displayName: string;
  columns: Array<{
    id: string;
    name: string;
    displayName: string;
    type: string;
    length?: number;
    nullable: boolean;
    primaryKey: boolean;
    autoIncrement: boolean;
    defaultValue?: string;
    comment?: string;
  }>;
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

  /**
   * 生成SQL代码
   */
  const generateSQL = () => {
    if (!selectedTable) {
      message.warning('请先选择一个表');
      return;
    }

    let sql = '';
    
    if (databaseType === 'mysql') {
      sql = generateMySQLCode();
    } else if (databaseType === 'postgresql') {
      sql = generatePostgreSQLCode();
    }

    setSqlCode(sql);
  };

  /**
   * 生成MySQL代码
   */
  const generateMySQLCode = () => {
    if (!selectedTable) return '';
    
    let sql = `-- ${selectedTable.displayName} (${selectedTable.name})\n`;
    sql += `CREATE TABLE ${selectedTable.name} (\n`;
    
    // 添加列定义
    const columnDefinitions = selectedTable.columns.map(column => {
      let definition = `  ${column.name} ${column.type.toUpperCase()}`;
      
      // 添加长度
      if (column.length && ['varchar', 'char', 'decimal'].includes(column.type)) {
        definition += `(${column.length})`;
      }
      
      // 添加属性
      if (!column.nullable) {
        definition += ' NOT NULL';
      }
      
      if (column.autoIncrement) {
        definition += ' AUTO_INCREMENT';
      }
      
      if (column.defaultValue) {
        definition += ` DEFAULT '${column.defaultValue}'`;
      }
      
      // 添加注释
      if (column.comment) {
        definition += ` COMMENT '${column.comment}'`;
      }
      
      return definition;
    });
    
    sql += columnDefinitions.join(',\n');
    
    // 添加主键
    const primaryKeys = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (${primaryKeys.map(pk => pk.name).join(', ')})`;
    }
    
    sql += '\n);\n\n';
    
    // 添加表注释
    sql += `-- 表注释\n`;
    sql += `ALTER TABLE ${selectedTable.name} COMMENT = '${selectedTable.displayName}';\n\n`;
    
    // 添加索引（这里可以扩展为实际的索引）
    sql += `-- 索引\n`;
    sql += `-- CREATE INDEX idx_${selectedTable.name}_id ON ${selectedTable.name}(id);\n`;
    
    return sql;
  };

  /**
   * 生成PostgreSQL代码
   */
  const generatePostgreSQLCode = () => {
    if (!selectedTable) return '';
    
    let sql = `-- ${selectedTable.displayName} (${selectedTable.name})\n`;
    sql += `CREATE TABLE ${selectedTable.name} (\n`;
    
    // 添加列定义
    const columnDefinitions = selectedTable.columns.map(column => {
      let definition = `  ${column.name} ${column.type.toUpperCase()}`;
      
      // 添加长度
      if (column.length && ['varchar', 'char'].includes(column.type)) {
        definition += `(${column.length})`;
      }
      
      // 添加属性
      if (!column.nullable) {
        definition += ' NOT NULL';
      }
      
      if (column.autoIncrement) {
        definition += ' SERIAL';
      }
      
      if (column.defaultValue) {
        definition += ` DEFAULT '${column.defaultValue}'`;
      }
      
      return definition;
    });
    
    sql += columnDefinitions.join(',\n');
    
    // 添加主键
    const primaryKeys = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeys.length > 0) {
      sql += `,\n  PRIMARY KEY (${primaryKeys.map(pk => pk.name).join(', ')})`;
    }
    
    sql += '\n);\n\n';
    
    // 添加表注释
    sql += `-- 表注释\n`;
    sql += `COMMENT ON TABLE ${selectedTable.name} IS '${selectedTable.displayName}';\n\n`;
    
    // 添加列注释
    sql += `-- 列注释\n`;
    selectedTable.columns.forEach(column => {
      if (column.comment) {
        sql += `COMMENT ON COLUMN ${selectedTable.name}.${column.name} IS '${column.comment}';\n`;
      }
    });
    
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

  // 当表或数据库类型变化时重新生成代码
  useEffect(() => {
    if (selectedTable) {
      generateSQL();
    }
  }, [selectedTable, databaseType]);

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
            提示：此代码基于当前表结构自动生成，支持复制到数据库管理工具中执行。
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default DatabaseCodeTab;
