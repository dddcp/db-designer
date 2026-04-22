import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  Input,
  message,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import type { Project, DatabaseTypeOption } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SqlExportTabProps {
  project: Project;
}

const SqlExportTab: React.FC<SqlExportTabProps> = ({ project }) => {
  const { t } = useTranslation();
  const [databaseType, setDatabaseType] = useState('mysql');
  const [sqlContent, setSqlContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  const handleExport = async () => {
    setLoading(true);
    try {
      const [tableSql, routineSql] = await Promise.all([
        invoke<string>('export_project_sql', {
          projectId: project.id,
          databaseType,
        }),
        invoke<string>('export_routines_sql', {
          projectId: project.id,
          databaseType,
        }),
      ]);
      setSqlContent(tableSql + '\n' + routineSql);
    } catch (error) {
      console.error('导出SQL失败:', error);
      message.error(t('sql_export_fail') + ': ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sqlContent);
      message.success(t('copy_success'));
    } catch {
      message.error(t('copy_fail'));
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{t('sql_export_title')}</Title>
          <Space>
            <Select
              value={databaseType}
              onChange={setDatabaseType}
              style={{ width: 150 }}
            >
              {dbTypes.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              loading={loading}
              onClick={handleExport}
            >
              {t('sql_export_generate')}
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={handleCopy}
              disabled={!sqlContent}
            >
              {t('copy')}
            </Button>
          </Space>
        </div>

        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {t('sql_export_desc')}
        </Text>

        <TextArea
          value={sqlContent}
          readOnly
          rows={24}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
          placeholder={t('sql_export_placeholder')}
        />
      </Card>
    </div>
  );
};

export default SqlExportTab;