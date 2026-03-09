import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DatabaseTypeOption } from '../../types';
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

interface DatabaseCodeTabProps {
  selectedTable: TableDef | null;
}

/**
 * 数据库代码生成组件
 */
const DatabaseCodeTab: React.FC<DatabaseCodeTabProps> = ({ selectedTable }) => {
  const [sqlCode, setSqlCode] = useState('');
  const [databaseType, setDatabaseType] = useState('mysql');
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  // 当表或数据库类型变化时重新生成代码
  useEffect(() => {
    if (selectedTable) {
      generateSQL();
    } else {
      setSqlCode('');
    }
  }, [selectedTable, databaseType]);

  /**
   * 调用后台生成SQL代码
   */
  const generateSQL = async () => {
    if (!selectedTable) return;
    try {
      const sql = await invoke<string>('export_table_sql', {
        tableId: selectedTable.id,
        databaseType,
      });
      setSqlCode(sql);
    } catch (error) {
      console.error('生成SQL失败:', error);
      setSqlCode('-- 生成SQL失败');
    }
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
                {dbTypes.map(t => (
                  <Option key={t.value} value={t.value}>{t.label}</Option>
                ))}
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
            提示：此代码基于当前表结构自动生成，包含表结构、索引和元数据。
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default DatabaseCodeTab;
