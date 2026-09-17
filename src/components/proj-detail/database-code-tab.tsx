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
  isActive?: boolean;
}

const DatabaseCodeTab: React.FC<DatabaseCodeTabProps> = ({ selectedTable, isActive }) => {
  const { t } = useTranslation();
  const [sqlCode, setSqlCode] = useState('');
  const [databaseType, setDatabaseType] = useState('mysql');
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  // 只依赖表 id 而非整个 selectedTable 对象：编辑字段时每击键都会生成新的
  // selectedTable 引用，若依赖整个对象，本 Tab 挂载期间每击键都会触发一次
  // export_table_sql IPC；而 SQL 本就由后端按已保存的结构生成，与未保存的编辑无关。
  useEffect(() => {
    if (selectedTable) {
      generateSQL();
    } else {
      setSqlCode('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable?.id, databaseType]);

  // 每次切到「SQL」tab 时强制重新生成，确保展示的是保存后的最新结构
  useEffect(() => {
    if (isActive && selectedTable) {
      generateSQL();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

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