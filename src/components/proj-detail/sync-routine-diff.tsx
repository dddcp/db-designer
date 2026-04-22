import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Drawer,
  Input,
  message,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CopyOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { Project, RemoteRoutine, RoutineDiff, DatabaseTypeOption } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;

interface SyncRoutineDiffProps {
  project: Project;
  routineDiffs: RoutineDiff[];
  selectedConnectionId: number | undefined;
  dbType: string;
  syncingKeys: Set<string>;
  onSyncingKeysChange: (updater: (prev: Set<string>) => Set<string>) => void;
  onRoutineDiffsChange: (diffs: RoutineDiff[]) => void;
  getStatusTag: (status: string) => React.ReactNode;
}

const SyncRoutineDiff: React.FC<SyncRoutineDiffProps> = ({
  project,
  routineDiffs,
  selectedConnectionId,
  dbType,
  syncingKeys,
  onSyncingKeysChange,
  onRoutineDiffsChange,
  getStatusTag,
}) => {
  const { t } = useTranslation();
  const [routineDiffDrawerVisible, setRoutineDiffDrawerVisible] = useState(false);
  const [selectedRoutineDiff, setSelectedRoutineDiff] = useState<RoutineDiff | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);

  React.useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  const refreshRoutineDiffs = async () => {
    if (!selectedConnectionId) return;
    const remoteRoutines = await invoke<RemoteRoutine[]>('get_remote_routines_cmd', {
      connectionId: selectedConnectionId,
    });
    const routineDiffResult = await invoke<RoutineDiff[]>('compare_routines', {
      projectId: project.id,
      remoteRoutinesJson: JSON.stringify(remoteRoutines),
      dbType,
    });
    onRoutineDiffsChange(routineDiffResult);
  };

  const handleBatchSync = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchSyncing(true);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const rowKey of selectedRowKeys) {
        const diff = routineDiffs.find(d => `${d.name}_${d.type}` === rowKey);
        if (!diff) continue;
        try {
          const remoteRoutine: RemoteRoutine = {
            name: diff.name,
            type: diff.type,
            body: diff.remote_body || '',
          };
          await invoke('sync_remote_routine_to_local', {
            projectId: project.id,
            remoteRoutineJson: JSON.stringify(remoteRoutine),
            dbType,
          });
          successCount++;
        } catch {
          failCount++;
        }
      }
      if (failCount === 0) {
        message.success(t('sync_batch_routine_sync_complete', { count: successCount }));
      } else {
        message.warning(t('sync_batch_routine_sync_partial', { success: successCount, fail: failCount }));
      }
      setSelectedRowKeys([]);
      await refreshRoutineDiffs();
    } catch (error) {
      message.error(t('sync_batch_sync_failed') + ': ' + error);
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleSyncRoutineToLocal = async (diff: RoutineDiff) => {
    const key = `routine_${diff.name}_${diff.type}`;
    onSyncingKeysChange(prev => new Set(prev).add(key));
    try {
      const remoteRoutine: RemoteRoutine = {
        name: diff.name,
        type: diff.type,
        body: diff.remote_body || '',
      };
      await invoke('sync_remote_routine_to_local', {
        projectId: project.id,
        remoteRoutineJson: JSON.stringify(remoteRoutine),
        dbType,
      });
      message.success(t('sync_routine_sync_success', { name: diff.name }));
      await refreshRoutineDiffs();
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

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('sync_copied_to_clipboard'));
    } catch {
      message.error(t('sync_copy_failed'));
    }
  };

  const getRoutineTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      function: t('sync_routine_function'),
      procedure: t('sync_routine_procedure'),
      trigger: t('sync_routine_trigger'),
    };
    return map[type] || type;
  };

  const routineColumns = [
    {
      title: t('sync_name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('sync_type'),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => {
        const colors: Record<string, string> = { function: 'blue', procedure: 'green', trigger: 'orange' };
        return <Tag color={colors[type] || 'default'}>{getRoutineTypeLabel(type)}</Tag>;
      },
    },
    {
      title: t('sync_status'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: t('sync_action'),
      key: 'action',
      width: 200,
      render: (_: any, record: RoutineDiff) => (
        <Space size="small">
          {(record.status === 'different' || record.status === 'only_local' || record.status === 'only_remote') && (
            <Button
              type="link"
              size="small"
              onClick={() => {
                setSelectedRoutineDiff(record);
                setRoutineDiffDrawerVisible(true);
              }}
            >
              {t('sync_view_diff')}
            </Button>
          )}
          {(record.status === 'only_remote' || record.status === 'different') && (
            <Button
              type="link"
              size="small"
              icon={<DownloadOutlined />}
              loading={syncingKeys.has(`routine_${record.name}_${record.type}`)}
              onClick={() => handleSyncRoutineToLocal(record)}
            >
              {t('sync_to_local')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const canSyncStatuses = new Set(['only_remote', 'different']);
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
    getCheckboxProps: (record: RoutineDiff) => ({
      disabled: !canSyncStatuses.has(record.status),
    }),
  };

  return (
    <>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="large">
          <Text>{t('sync_total_routines', { count: routineDiffs.length, dbType: dbTypes.find(t2 => t2.value === dbType)?.label || dbType })}：</Text>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text>{t('sync_same')} {routineDiffs.filter(d => d.status === 'same').length}</Text>
          </Space>
          <Tag color="green">{t('sync_only_local')} {routineDiffs.filter(d => d.status === 'only_local').length}</Tag>
          <Tag color="orange">{t('sync_only_remote')} {routineDiffs.filter(d => d.status === 'only_remote').length}</Tag>
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text>{t('sync_different')} {routineDiffs.filter(d => d.status === 'different').length}</Text>
          </Space>
        </Space>
        <Space>
          {selectedRowKeys.length > 0 && (
            <Text type="secondary">{t('sync_selected_items', { count: selectedRowKeys.length })}</Text>
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={selectedRowKeys.length === 0}
            loading={batchSyncing}
            onClick={handleBatchSync}
          >
            {t('sync_batch_to_local')}
          </Button>
        </Space>
      </div>

      <Table
        dataSource={routineDiffs}
        columns={routineColumns}
        rowKey={(r) => `${r.name}_${r.type}`}
        pagination={false}
        size="small"
        rowSelection={rowSelection}
      />

      <Drawer
        title={selectedRoutineDiff ? `${getRoutineTypeLabel(selectedRoutineDiff.type)}: ${selectedRoutineDiff.name}` : t('sync_diff_compare')}
        open={routineDiffDrawerVisible}
        onClose={() => setRoutineDiffDrawerVisible(false)}
        width={900}
      >
        {selectedRoutineDiff && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>{t('sync_local')}</Text>
                {selectedRoutineDiff.local_body && (
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyText(selectedRoutineDiff.local_body || '')}>{t('sync_copy')}</Button>
                )}
              </div>
              <TextArea
                value={selectedRoutineDiff.local_body || t('sync_none_value')}
                readOnly
                rows={20}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>{t('sync_remote')}</Text>
                {selectedRoutineDiff.remote_body && (
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyText(selectedRoutineDiff.remote_body || '')}>{t('sync_copy')}</Button>
                )}
              </div>
              <TextArea
                value={selectedRoutineDiff.remote_body || t('sync_none_value')}
                readOnly
                rows={20}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
};

export default SyncRoutineDiff;