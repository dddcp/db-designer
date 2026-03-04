import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  SyncOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CopyOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { Project, DatabaseConnection } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SyncTabProps {
  project: Project;
}

interface RemoteTable {
  name: string;
  comment: string | null;
  columns: RemoteColumn[];
}

interface RemoteColumn {
  name: string;
  data_type: string;
  length: number | null;
  nullable: boolean;
  column_key: string;
  extra: string;
  default_value: string | null;
  comment: string | null;
}

interface TableDiff {
  table_name: string;
  status: string;
  local_display_name: string | null;
  column_diffs: ColumnDiff[];
}

interface ColumnDiff {
  column_name: string;
  status: string;
  local_type: string | null;
  remote_type: string | null;
  detail: string | null;
}

const SyncTab: React.FC<SyncTabProps> = ({ project }) => {
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | undefined>();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [remoteTables, setRemoteTables] = useState<RemoteTable[]>([]);
  const [diffs, setDiffs] = useState<TableDiff[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSqlModalVisible, setIsSqlModalVisible] = useState(false);
  const [sqlContent, setSqlContent] = useState('');

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const result = await invoke<DatabaseConnection[]>('get_database_connections');
      // 过滤出与项目数据库类型匹配的连接
      const filtered = result.filter(c => c.type === project.database_type);
      setConnections(filtered);
    } catch (error) {
      console.error('加载连接配置失败:', error);
    }
  };

  // 测试连接并获取远程表
  const handleConnect = async () => {
    if (!selectedConnectionId) {
      message.warning('请先选择一个数据库连接');
      return;
    }
    setConnecting(true);
    setConnected(false);
    setDiffs([]);
    try {
      // 先测试连接
      await invoke('connect_database', { connectionId: selectedConnectionId });
      message.success('连接成功');
      setConnected(true);

      // 获取远程表结构
      const tables = await invoke<RemoteTable[]>('get_remote_tables', {
        connectionId: selectedConnectionId,
      });
      setRemoteTables(tables);

      // 自动比对
      const diffResult = await invoke<TableDiff[]>('compare_tables', {
        projectId: project.id,
        remoteTablesJson: JSON.stringify(tables),
      });
      setDiffs(diffResult);
    } catch (error) {
      console.error('连接失败:', error);
      message.error('连接失败: ' + error);
    } finally {
      setConnecting(false);
    }
  };

  // 生成同步 SQL
  const handleGenerateSyncSQL = async () => {
    if (remoteTables.length === 0) {
      message.warning('请先连接数据库并获取远程表');
      return;
    }
    setLoading(true);
    try {
      const sql = await invoke<string>('generate_sync_sql', {
        projectId: project.id,
        remoteTablesJson: JSON.stringify(remoteTables),
        databaseType: project.database_type,
      });
      setSqlContent(sql);
      setIsSqlModalVisible(true);
    } catch (error) {
      console.error('生成同步SQL失败:', error);
      message.error('生成同步SQL失败: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(sqlContent);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'only_local':
        return <Tag color="green">仅本地</Tag>;
      case 'only_remote':
        return <Tag color="orange">仅远程</Tag>;
      case 'different':
        return <Tag color="red">有差异</Tag>;
      case 'same':
        return <Tag color="blue">一致</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  // 表差异汇总
  const diffSummary = {
    total: diffs.length,
    same: diffs.filter(d => d.status === 'same').length,
    onlyLocal: diffs.filter(d => d.status === 'only_local').length,
    onlyRemote: diffs.filter(d => d.status === 'only_remote').length,
    different: diffs.filter(d => d.status === 'different').length,
  };

  const diffColumns = [
    {
      title: '表名',
      dataIndex: 'table_name',
      key: 'table_name',
      render: (name: string, record: TableDiff) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {record.local_display_name && (
            <Text type="secondary" style={{ fontSize: 12 }}>{record.local_display_name}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '差异详情',
      key: 'detail',
      render: (_: any, record: TableDiff) => {
        if (record.status === 'same') return <Text type="secondary">结构一致</Text>;
        if (record.status === 'only_local') return <Text type="success">远程库中不存在，需创建</Text>;
        if (record.status === 'only_remote') return <Text type="warning">本地设计中不存在</Text>;
        // different
        const added = record.column_diffs.filter(c => c.status === 'only_local').length;
        const removed = record.column_diffs.filter(c => c.status === 'only_remote').length;
        const changed = record.column_diffs.filter(c => c.status === 'different').length;
        const parts = [];
        if (added > 0) parts.push(`新增 ${added} 列`);
        if (removed > 0) parts.push(`远程多 ${removed} 列`);
        if (changed > 0) parts.push(`${changed} 列有差异`);
        return <Text>{parts.join('，')}</Text>;
      },
    },
  ];

  // 展开行：列差异详情
  const expandedRowRender = (record: TableDiff) => {
    if (record.column_diffs.length === 0) return null;
    const colDiffColumns = [
      { title: '列名', dataIndex: 'column_name', key: 'column_name' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => getStatusTag(status),
      },
      { title: '本地类型', dataIndex: 'local_type', key: 'local_type', render: (v: string | null) => v || '-' },
      { title: '远程类型', dataIndex: 'remote_type', key: 'remote_type', render: (v: string | null) => v || '-' },
      { title: '说明', dataIndex: 'detail', key: 'detail', render: (v: string | null) => v || '-' },
    ];
    return (
      <Table
        dataSource={record.column_diffs}
        columns={colDiffColumns}
        pagination={false}
        rowKey="column_name"
        size="small"
      />
    );
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>数据库比对与同步</Title>
        </div>

        {/* 连接选择 */}
        <Space style={{ marginBottom: 24 }} size="middle">
          <Select
            style={{ width: 300 }}
            placeholder="选择数据库连接"
            value={selectedConnectionId}
            onChange={(v) => { setSelectedConnectionId(v); setConnected(false); setDiffs([]); }}
          >
            {connections.map(c => (
              <Option key={c.id} value={c.id}>
                <DatabaseOutlined /> {c.name} ({c.host}:{c.port}/{c.database})
              </Option>
            ))}
          </Select>
          <Button
            type="primary"
            icon={<LinkOutlined />}
            loading={connecting}
            onClick={handleConnect}
          >
            连接并比对
          </Button>
          {connected && (
            <Button
              icon={<SyncOutlined />}
              loading={loading}
              onClick={handleGenerateSyncSQL}
              disabled={diffs.length === 0}
            >
              生成同步脚本
            </Button>
          )}
        </Space>

        {connections.length === 0 && (
          <Alert
            message="暂无匹配的数据库连接"
            description={`请先在设置页面添加 ${project.database_type === 'mysql' ? 'MySQL' : 'PostgreSQL'} 类型的数据库连接配置`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 比对结果 */}
        {connected && diffs.length > 0 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Space size="large">
                <Text>共 {diffSummary.total} 张表：</Text>
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <Text>一致 {diffSummary.same}</Text>
                </Space>
                <Space>
                  <Tag color="green">仅本地 {diffSummary.onlyLocal}</Tag>
                </Space>
                <Space>
                  <Tag color="orange">仅远程 {diffSummary.onlyRemote}</Tag>
                </Space>
                <Space>
                  <WarningOutlined style={{ color: '#ff4d4f' }} />
                  <Text>有差异 {diffSummary.different}</Text>
                </Space>
              </Space>
            </div>

            <Table
              dataSource={diffs}
              columns={diffColumns}
              pagination={false}
              rowKey="table_name"
              size="small"
              expandable={{
                expandedRowRender,
                rowExpandable: (record) => record.status === 'different',
              }}
            />
          </>
        )}

        {connected && diffs.length === 0 && (
          <Empty description="未获取到比对结果" />
        )}
      </Card>

      {/* SQL 查看弹窗 */}
      <Modal
        title="同步脚本"
        open={isSqlModalVisible}
        onCancel={() => setIsSqlModalVisible(false)}
        width={800}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopySQL}>
            复制
          </Button>,
          <Button key="close" onClick={() => setIsSqlModalVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        <TextArea
          value={sqlContent}
          readOnly
          rows={20}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Modal>
    </div>
  );
};

export default SyncTab;
