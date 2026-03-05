import React, { useState } from 'react';
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
import type { Project } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SqlExportTabProps {
  project: Project;
}

const SqlExportTab: React.FC<SqlExportTabProps> = ({ project }) => {
  const [databaseType, setDatabaseType] = useState('mysql');
  const [sqlContent, setSqlContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const sql = await invoke<string>('export_project_sql', {
        projectId: project.id,
        databaseType,
      });
      setSqlContent(sql);
    } catch (error) {
      console.error('导出SQL失败:', error);
      message.error('导出SQL失败: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sqlContent);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>SQL 导出</Title>
          <Space>
            <Select
              value={databaseType}
              onChange={setDatabaseType}
              style={{ width: 150 }}
            >
              <Option value="mysql">MySQL</Option>
              <Option value="postgresql">PostgreSQL</Option>
            </Select>
            <Button
              type="primary"
              icon={<ExportOutlined />}
              loading={loading}
              onClick={handleExport}
            >
              生成 SQL
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={handleCopy}
              disabled={!sqlContent}
            >
              复制
            </Button>
          </Space>
        </div>

        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          导出当前项目所有表的完整 SQL，包含表结构、索引和初始数据。
        </Text>

        <TextArea
          value={sqlContent}
          readOnly
          rows={24}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
          placeholder='选择数据库类型后点击"生成 SQL"...'
        />
      </Card>
    </div>
  );
};

export default SqlExportTab;
