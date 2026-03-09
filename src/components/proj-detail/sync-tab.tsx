import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  message,
  Drawer,
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
  DownloadOutlined,
} from '@ant-design/icons';
import type { Project, DatabaseConnection } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SyncTabProps {
  project: Project;
}

interface RemoteIndex {
  name: string;
  index_type: string;
  column_names: string[];
}

interface RemoteTable {
  name: string;
  comment: string | null;
  columns: RemoteColumn[];
  indexes: RemoteIndex[];
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
  index_diffs: IndexDiff[];
}

interface ColumnDiff {
  column_name: string;
  status: string;
  local_type: string | null;
  remote_type: string | null;
  detail: string | null;
}

interface IndexDiff {
  index_name: string;
  status: string;
  local_type: string | null;
  remote_type: string | null;
  local_columns: string | null;
  remote_columns: string | null;
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
  const [syncingKeys, setSyncingKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const result = await invoke<DatabaseConnection[]>('get_database_connections');
      setConnections(result);
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
      const selectedConnection = connections.find(c => c.id === selectedConnectionId);
      const sql = await invoke<string>('generate_sync_sql', {
        projectId: project.id,
        remoteTablesJson: JSON.stringify(remoteTables),
        databaseType: selectedConnection?.type || 'mysql',
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

  // 重新比对
  const refreshDiffs = async () => {
    if (!selectedConnectionId) return;
    try {
      const tables = await invoke<RemoteTable[]>('get_remote_tables', {
        connectionId: selectedConnectionId,
      });
      setRemoteTables(tables);
      const diffResult = await invoke<TableDiff[]>('compare_tables', {
        projectId: project.id,
        remoteTablesJson: JSON.stringify(tables),
      });
      setDiffs(diffResult);
    } catch (error) {
      message.error('刷新比对失败: ' + error);
    }
  };

  // 同步整张远程表到本地
  const handleSyncTable = async (tableName: string) => {
    const key = `table_${tableName}`;
    setSyncingKeys(prev => new Set(prev).add(key));
    try {
      const remoteTable = remoteTables.find(t => t.name === tableName);
      if (!remoteTable) {
        message.error('未找到远程表数据');
        return;
      }
      await invoke('sync_remote_table_to_local', {
        projectId: project.id,
        remoteTableJson: JSON.stringify(remoteTable),
      });
      message.success(`表 ${tableName} 同步成功`);
      await refreshDiffs();
    } catch (error) {
      message.error('同步失败: ' + error);
    } finally {
      setSyncingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 同步差异字段到本地
  const handleSyncColumns = async (tableName: string, columnNames: string[]) => {
    const key = `cols_${tableName}_${columnNames.join(',')}`;
    setSyncingKeys(prev => new Set(prev).add(key));
    try {
      const remoteTable = remoteTables.find(t => t.name === tableName);
      if (!remoteTable) {
        message.error('未找到远程表数据');
        return;
      }
      await invoke('sync_remote_columns_to_local', {
        projectId: project.id,
        tableName,
        remoteColumnsJson: JSON.stringify(remoteTable.columns),
        columnNames,
      });
      message.success('字段同步成功');
      await refreshDiffs();
    } catch (error) {
      message.error('同步失败: ' + error);
    } finally {
      setSyncingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 同步差异索引到本地
  const handleSyncIndexes = async (tableName: string, indexNames: string[]) => {
    const key = `idx_${tableName}_${indexNames.join(',')}`;
    setSyncingKeys(prev => new Set(prev).add(key));
    try {
      const remoteTable = remoteTables.find(t => t.name === tableName);
      if (!remoteTable) {
        message.error('未找到远程表数据');
        return;
      }
      await invoke('sync_remote_indexes_to_local', {
        projectId: project.id,
        tableName,
        remoteIndexesJson: JSON.stringify(remoteTable.indexes),
        indexNames,
      });
      message.success('索引同步成功');
      await refreshDiffs();
    } catch (error) {
      message.error('同步失败: ' + error);
    } finally {
      setSyncingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
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

  const getIndexTypeLabel = (type: string) => {
    const map: Record<string, string> = { normal: '普通', unique: '唯一', fulltext: '全文' };
    return map[type] || type;
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
        // different — 字段差异
        const parts = [];
        const colAdded = record.column_diffs.filter(c => c.status === 'only_local').length;
        const colRemoved = record.column_diffs.filter(c => c.status === 'only_remote').length;
        const colChanged = record.column_diffs.filter(c => c.status === 'different').length;
        if (colAdded > 0) parts.push(`新增 ${colAdded} 列`);
        if (colRemoved > 0) parts.push(`远程多 ${colRemoved} 列`);
        if (colChanged > 0) parts.push(`${colChanged} 列有差异`);
        // 索引差异
        const idxAdded = record.index_diffs.filter(i => i.status === 'only_local').length;
        const idxRemoved = record.index_diffs.filter(i => i.status === 'only_remote').length;
        const idxChanged = record.index_diffs.filter(i => i.status === 'different').length;
        if (idxAdded > 0) parts.push(`新增 ${idxAdded} 索引`);
        if (idxRemoved > 0) parts.push(`远程多 ${idxRemoved} 索引`);
        if (idxChanged > 0) parts.push(`${idxChanged} 索引有差异`);
        return <Text>{parts.join('，')}</Text>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: TableDiff) => {
        if (record.status === 'only_remote') {
          const key = `table_${record.table_name}`;
          return (
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              loading={syncingKeys.has(key)}
              onClick={() => handleSyncTable(record.table_name)}
            >
              同步到模型
            </Button>
          );
        }
        if (record.status === 'different') {
          const diffCols = record.column_diffs
            .filter(c => c.status === 'only_remote' || c.status === 'different')
            .map(c => c.column_name);
          const diffIdxs = record.index_diffs
            .filter(i => i.status === 'only_remote' || i.status === 'different')
            .map(i => i.index_name);
          if (diffCols.length === 0 && diffIdxs.length === 0) return '-';
          const key = `all_${record.table_name}`;
          return (
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              loading={syncingKeys.has(key)}
              onClick={async () => {
                setSyncingKeys(prev => new Set(prev).add(key));
                try {
                  const remoteTable = remoteTables.find(t => t.name === record.table_name);
                  if (!remoteTable) { message.error('未找到远程表数据'); return; }
                  if (diffCols.length > 0) {
                    await invoke('sync_remote_columns_to_local', {
                      projectId: project.id,
                      tableName: record.table_name,
                      remoteColumnsJson: JSON.stringify(remoteTable.columns),
                      columnNames: diffCols,
                    });
                  }
                  if (diffIdxs.length > 0) {
                    await invoke('sync_remote_indexes_to_local', {
                      projectId: project.id,
                      tableName: record.table_name,
                      remoteIndexesJson: JSON.stringify(remoteTable.indexes),
                      indexNames: diffIdxs,
                    });
                  }
                  message.success('同步成功');
                  await refreshDiffs();
                } catch (error) {
                  message.error('同步失败: ' + error);
                } finally {
                  setSyncingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
                }
              }}
            >
              同步全部差异
            </Button>
          );
        }
        return '-';
      },
    },
  ];

  // 展开行：列差异 + 索引差异
  const expandedRowRender = (record: TableDiff) => {
    if (record.column_diffs.length === 0 && record.index_diffs.length === 0) return null;

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
      {
        title: '操作',
        key: 'action',
        width: 100,
        render: (_: any, col: ColumnDiff) => {
          if (col.status === 'only_remote' || col.status === 'different') {
            const key = `cols_${record.table_name}_${col.column_name}`;
            return (
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                loading={syncingKeys.has(key)}
                onClick={() => handleSyncColumns(record.table_name, [col.column_name])}
              >
                同步
              </Button>
            );
          }
          return '-';
        },
      },
    ];

    const idxDiffColumns = [
      { title: '索引名', dataIndex: 'index_name', key: 'index_name' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => getStatusTag(status),
      },
      {
        title: '本地',
        key: 'local_info',
        render: (_: any, idx: IndexDiff) => {
          if (!idx.local_type) return '-';
          return <Text>{getIndexTypeLabel(idx.local_type)} [{idx.local_columns}]</Text>;
        },
      },
      {
        title: '远程',
        key: 'remote_info',
        render: (_: any, idx: IndexDiff) => {
          if (!idx.remote_type) return '-';
          return <Text>{getIndexTypeLabel(idx.remote_type)} [{idx.remote_columns}]</Text>;
        },
      },
      { title: '说明', dataIndex: 'detail', key: 'detail', render: (v: string | null) => v || '-' },
      {
        title: '操作',
        key: 'action',
        width: 100,
        render: (_: any, idx: IndexDiff) => {
          if (idx.status === 'only_remote' || idx.status === 'different') {
            const key = `idx_${record.table_name}_${idx.index_name}`;
            return (
              <Button
                type="link"
                size="small"
                icon={<DownloadOutlined />}
                loading={syncingKeys.has(key)}
                onClick={() => handleSyncIndexes(record.table_name, [idx.index_name])}
              >
                同步
              </Button>
            );
          }
          return '-';
        },
      },
    ];

    return (
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {record.column_diffs.length > 0 && (
          <div>
            <Text strong style={{ marginBottom: 8, display: 'block' }}>字段对比</Text>
            <Table
              dataSource={record.column_diffs}
              columns={colDiffColumns}
              pagination={false}
              rowKey="column_name"
              size="small"
            />
          </div>
        )}
        {record.index_diffs.length > 0 && (
          <div>
            <Text strong style={{ marginBottom: 8, display: 'block' }}>索引对比</Text>
            <Table
              dataSource={record.index_diffs}
              columns={idxDiffColumns}
              pagination={false}
              rowKey="index_name"
              size="small"
            />
          </div>
        )}
      </Space>
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
            style={{ width: 500 }}
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
            description="请先在设置页面添加数据库连接配置"
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
      <Drawer
        title="同步脚本"
        open={isSqlModalVisible}
        onClose={() => setIsSqlModalVisible(false)}
        width={800}
        footer={
          <Space>
            <Button icon={<CopyOutlined />} onClick={handleCopySQL}>
              复制
            </Button>
            <Button onClick={() => setIsSqlModalVisible(false)}>
              关闭
            </Button>
          </Space>
        }
      >
        <TextArea
          value={sqlContent}
          readOnly
          rows={20}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
      </Drawer>
    </div>
  );
};

export default SyncTab;
