import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

const DatabaseCodeTab: React.FC<DatabaseCodeTabProps> = ({ selectedTable }) => {
  const { t } = useTranslation();
  const [sqlCode, setSqlCode] = useState('');
  const [databaseType, setDatabaseType] = useState('mysql');
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  useEffect(() => {
    if (selectedTable) {
      generateSQL();
    } else {
      setSqlCode('');
    }
  }, [selectedTable, databaseType]);

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
      setSqlCode(`-- ${t('db_code_generate_fail')}`);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(sqlCode);
      message.success(t('copy_success'));
    } catch (error) {
      message.error(t('copy_fail_manual'));
    }
  };

  if (!selectedTable) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">{t('db_code_select_table')}</Text>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Row gutter={16} align="middle">
            <Col>
              <Title level={4} style={{ margin: 0 }}>{t('db_code_title')}</Title>
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
                  {t('db_code_copy')}
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
          placeholder={t('db_code_placeholder')}
        />

        <div style={{ marginTop: 16 }}>
          <Text type="secondary">
            {t('db_code_tip')}
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default DatabaseCodeTab;