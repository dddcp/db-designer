import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchSyncing, setBatchSyncing] = useState(false);

  const getIndexTypeLabel = (type: string) => {
    const map: Record<string, string> = { normal: t('idx_type_normal_short'), unique: t('idx_type_unique_short'), fulltext: t('idx_type_fulltext_short') };
    return map[type] || type;
  };

  const handleBatchSync = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchSyncing(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const tableName of selectedRowKeys) {
        const diff = diffs.find(d => d.table_name === tableName);
        if (!diff) continue;
        const remoteTable = remoteTables.find(t => t.name === tableName);
        if (!remoteTable) { failCount++; continue; }
        try {
          if (diff.status === 'only_remote') {
            await invoke('sync_remote_table_to_local', {
              projectId: project.id,
              remoteTableJson: JSON.stringify(remoteTable),
            });
          } else if (diff.status === 'different') {
            const diffCols = diff.column_diffs
              .filter(c => c.status === 'only_remote' || c.status === 'different')
              .map(c => c.column_name);
            const diffIdxs = diff.index_diffs
              .filter(i => i.status === 'only_remote' || i.status === 'different')
              .map(i => i.index_name);
            if (diffCols.length > 0) {
              await invoke('sync_remote_columns_to_local', {
                projectId: project.id,
                tableName,
                remoteColumnsJson: JSON.stringify(remoteTable.columns),
                columnNames: diffCols,
              });
            }
            if (diffIdxs.length > 0) {
              await invoke('sync_remote_indexes_to_local', {
                projectId: project.id,
                tableName,
                remoteIndexesJson: JSON.stringify(remoteTable.indexes),
                indexNames: diffIdxs,
              });
            }
          }
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        message.success(t('sync_batch_done', { count: successCount }));
      } else {
        message.warning(t('sync_batch_partial', { success: successCount, fail: failCount }));
      }
      setSelectedRowKeys([]);
      await onRefreshDiffs();
    } catch (error) {
      message.error(t('sync_batch_fail') + ': ' + error);
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleSyncTable = async (tableName: string) => {
    const key = `table_${tableName}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
    try {
      const remoteTable = remoteTables.find(t => t.name === tableName);
      if (!remoteTable) {
        message.error(t('sync_remote_table_not_found'));
        return;
      }
      await invoke('sync_remote_table_to_local', {
        projectId: project.id,
        remoteTableJson: JSON.stringify(remoteTable),
      });
      message.success(t('sync_table_sync_success', { name: tableName }));
      await onRefreshDiffs();
    } catch (error) {
      message.error(t('sync_sync_failed') + ': ' + error);
    } finally {
      onSyncingKeysChange(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleSyncColumns = async (tableName: string, columnNames: string[]) => {
    const key = `cols_${tableName}_${columnNames.join(',')}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
    try {
      const remoteTable = remoteTables.find(t => t.name === tableName);
      if (!remoteTable) {
        message.error(t('sync_remote_table_not_found'));
        return;
      }
      await invoke('sync_remote_columns_to_local', {
        projectId: project.id,
        tableName,
        remoteColumnsJson: JSON.stringify(remoteTable.columns),
        columnNames,
      });
      message.success(t('sync_column_sync_success'));
      await onRefreshDiffs();
    } catch (error) {
      message.error(t('sync_sync_failed') + ': ' + error);
    } finally {
      onSyncingKeysChange(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleSyncIndexes = async (tableName: string, indexNames: string[]) => {
    const key = `idx_${tableName}_${indexNames.join(',')}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
    try {
      const remoteTable = remoteTables.find(t => t.name === tableName);
      if (!remoteTable) {
        message.error(t('sync_remote_table_not_found'));
        return;
      }
      await invoke('sync_remote_indexes_to_local', {
        projectId: project.id,
        tableName,
        remoteIndexesJson: JSON.stringify(remoteTable.indexes),
        indexNames,
      });
      message.success(t('sync_index_sync_success'));
      await onRefreshDiffs();
    } catch (error) {
      message.error(t('sync_sync_failed') + ': ' + error);
    } finally {
      onSyncingKeysChange(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const diffSummary = {
    total: diffs.length,
    same: diffs.filter(d => d.status === 'same').length,
    onlyLocal: diffs.filter(d => d.status === 'only_local').length,
    onlyRemote: diffs.filter(d => d.status === 'only_remote').length,
    different: diffs.filter(d => d.status === 'different').length,
  };

  const diffColumns = [
    {
      title: t('sync_table_name'),
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
      title: t('sync_status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: t('sync_diff_detail'),
      key: 'detail',
      render: (_: any, record: TableDiff) => {
        if (record.status === 'same') return <Text type="secondary">{t('sync_structure_same')}</Text>;
        if (record.status === 'only_local') return <Text type="success">{t('sync_only_local_create')}</Text>;
        if (record.status === 'only_remote') return <Text type="warning">{t('sync_only_remote_missing')}</Text>;
        const parts = [];
        const colAdded = record.column_diffs.filter(c => c.status === 'only_local').length;
        const colRemoved = record.column_diffs.filter(c => c.status === 'only_remote').length;
        const colChanged = record.column_diffs.filter(c => c.status === 'different').length;
        if (colAdded > 0) parts.push(t('sync_col_added', { count: colAdded }));
        if (colRemoved > 0) parts.push(t('sync_col_remote_more', { count: colRemoved }));
        if (colChanged > 0) parts.push(t('sync_col_diff', { count: colChanged }));
        const idxAdded = record.index_diffs.filter(i => i.status === 'only_local').length;
        const idxRemoved = record.index_diffs.filter(i => i.status === 'only_remote').length;
        const idxChanged = record.index_diffs.filter(i => i.status === 'different').length;
        if (idxAdded > 0) parts.push(t('sync_idx_added', { count: idxAdded }));
        if (idxRemoved > 0) parts.push(t('sync_idx_remote_more', { count: idxRemoved }));
        if (idxChanged > 0) parts.push(t('sync_idx_diff', { count: idxChanged }));
        return <Text>{parts.join(',')}</Text>;
      },
    },
    {
      title: t('sync_action'),
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
              {t('sync_to_model')}
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
                  if (!remoteTable) { message.error(t('sync_remote_table_not_found')); return; }
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
                  message.success(t('sync_sync_success'));
                  await onRefreshDiffs();
                } catch (error) {
                  message.error(t('sync_sync_failed') + ': ' + error);
                } finally {
                  onSyncingKeysChange(prev => { const n = new Set(prev); n.delete(key); return n; });
                }
              }}
            >
              {t('sync_sync_all_diff')}
            </Button>
          );
        }
        return '-';
      },
    },
  ];

  const expandedRowRender = (record: TableDiff) => {
    if (record.column_diffs.length === 0 && record.index_diffs.length === 0) return null;

    const colDiffColumns = [
      { title: t('sync_col_name'), dataIndex: 'column_name', key: 'column_name' },
      {
        title: t('sync_status'),
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => getStatusTag(status),
      },
      { title: t('sync_local_type'), dataIndex: 'local_type', key: 'local_type', render: (v: string | null) => v || '-' },
      { title: t('sync_remote_type'), dataIndex: 'remote_type', key: 'remote_type', render: (v: string | null) => v || '-' },
      { title: t('sync_detail'), dataIndex: 'detail', key: 'detail', render: (v: string | null) => v || '-' },
      {
        title: t('sync_action'),
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
                {t('sync_col_sync')}
              </Button>
            );
          }
          return '-';
        },
      },
    ];

    const idxDiffColumns = [
      { title: t('sync_idx_name'), dataIndex: 'index_name', key: 'index_name' },
      {
        title: t('sync_status'),
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => getStatusTag(status),
      },
      {
        title: t('sync_local'),
        key: 'local_info',
        render: (_: any, idx: IndexDiff) => {
          if (!idx.local_type) return '-';
          return <Text>{getIndexTypeLabel(idx.local_type)} [{idx.local_columns}]</Text>;
        },
      },
      {
        title: t('sync_remote'),
        key: 'remote_info',
        render: (_: any, idx: IndexDiff) => {
          if (!idx.remote_type) return '-';
          return <Text>{getIndexTypeLabel(idx.remote_type)} [{idx.remote_columns}]</Text>;
        },
      },
      { title: t('sync_detail'), dataIndex: 'detail', key: 'detail', render: (v: string | null) => v || '-' },
      {
        title: t('sync_action'),
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
                {t('sync_col_sync')}
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
            <Text strong style={{ marginBottom: 8, display: 'block' }}>{t('sync_column_compare')}</Text>
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
            <Text strong style={{ marginBottom: 8, display: 'block' }}>{t('sync_index_compare')}</Text>
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

  const canSyncStatuses = new Set(['only_remote', 'different']);
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
    getCheckboxProps: (record: TableDiff) => ({
      disabled: !canSyncStatuses.has(record.status),
    }),
  };

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="large">
          <Text>{t('sync_total_tables', { count: diffSummary.total })}：</Text>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text>{t('sync_same')} {diffSummary.same}</Text>
          </Space>
          <Tag color="green">{t('sync_only_local')} {diffSummary.onlyLocal}</Tag>
          <Tag color="orange">{t('sync_only_remote')} {diffSummary.onlyRemote}</Tag>
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text>{t('sync_different')} {diffSummary.different}</Text>
          </Space>
        </Space>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Text type="secondary">{t('sync_selected_count', { count: selectedRowKeys.length })}</Text>
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={batchSyncing}
            onClick={handleBatchSync}
          >
            {t('sync_batch_to_model')}
          </Button>
        </Space>
      </div>

      <Table
        dataSource={diffs}
        columns={diffColumns}
        pagination={false}
        rowKey="table_name"
        size="small"
        rowSelection={rowSelection}
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.status === 'different',
        }}
      />
    </>
  );
};

export default SyncTableDiff;