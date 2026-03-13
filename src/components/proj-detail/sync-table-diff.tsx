import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  message,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { Project, RemoteTable, TableDiff, ColumnDiff, IndexDiff } from '../../types';

const { Text } = Typography;

interface SyncTableDiffProps {
  project: Project;
  diffs: TableDiff[];
  remoteTables: RemoteTable[];
  syncingKeys: Set<string>;
  onSyncingKeysChange: (updater: (prev: Set<string>) => Set<string>) => void;
  onRefreshDiffs: () => Promise<void>;
  getStatusTag: (status: string) => React.ReactNode;
}

const SyncTableDiff: React.FC<SyncTableDiffProps> = ({
  project,
  diffs,
  remoteTables,
  syncingKeys,
  onSyncingKeysChange,
  onRefreshDiffs,
  getStatusTag,
}) => {
  const getIndexTypeLabel = (type: string) => {
    const map: Record<string, string> = { normal: '普通', unique: '唯一', fulltext: '全文' };
    return map[type] || type;
  };

  // 同步整张远程表到本地
  const handleSyncTable = async (tableName: string) => {
    const key = `table_${tableName}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
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
      await onRefreshDiffs();
    } catch (error) {
      message.error('同步失败: ' + error);
    } finally {
      onSyncingKeysChange(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 同步差异字段到本地
  const handleSyncColumns = async (tableName: string, columnNames: string[]) => {
    const key = `cols_${tableName}_${columnNames.join(',')}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
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
      await onRefreshDiffs();
    } catch (error) {
      message.error('同步失败: ' + error);
    } finally {
      onSyncingKeysChange(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 同步差异索引到本地
  const handleSyncIndexes = async (tableName: string, indexNames: string[]) => {
    const key = `idx_${tableName}_${indexNames.join(',')}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
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
      await onRefreshDiffs();
    } catch (error) {
      message.error('同步失败: ' + error);
    } finally {
      onSyncingKeysChange(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
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
        const parts = [];
        const colAdded = record.column_diffs.filter(c => c.status === 'only_local').length;
        const colRemoved = record.column_diffs.filter(c => c.status === 'only_remote').length;
        const colChanged = record.column_diffs.filter(c => c.status === 'different').length;
        if (colAdded > 0) parts.push(`新增 ${colAdded} 列`);
        if (colRemoved > 0) parts.push(`远程多 ${colRemoved} 列`);
        if (colChanged > 0) parts.push(`${colChanged} 列有差异`);
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
                onSyncingKeysChange(prev => new Set(prev).add(key));
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
                  await onRefreshDiffs();
                } catch (error) {
                  message.error('同步失败: ' + error);
                } finally {
                  onSyncingKeysChange(prev => { const n = new Set(prev); n.delete(key); return n; });
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
  );
};

export default SyncTableDiff;
