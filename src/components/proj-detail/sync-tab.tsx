import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  message,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  SyncOutlined,
  LinkOutlined,
  CopyOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { Project, DatabaseConnection, RemoteRoutine, RemoteTable, RoutineDiff, TableDiff } from '../../types';
import SyncTableDiff from './sync-table-diff';
import SyncRoutineDiff from './sync-routine-diff';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface SyncTabProps {
  project: Project;
}

const SyncTab: React.FC<SyncTabProps> = ({ project }) => {
  const { t } = useTranslation();
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

  const [routineDiffs, setRoutineDiffs] = useState<RoutineDiff[]>([]);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const result = await invoke<DatabaseConnection[]>('get_database_connections');
      setConnections(result);
    } catch (error) {
      console.error(t('sync_load_connection_failed') + ':', error);
    }
  };

  const handleConnect = async () => {
    if (!selectedConnectionId) {
      message.warning(t('sync_select_connection_first'));
      return;
    }
    setConnecting(true);
    setConnected(false);
    setDiffs([]);
    setRoutineDiffs([]);
    try {
      await invoke('connect_database', { connectionId: selectedConnectionId });
      message.success(t('sync_connect_success'));
      setConnected(true);

      const tables = await invoke<RemoteTable[]>('get_remote_tables', {
        connectionId: selectedConnectionId,
      });
      setRemoteTables(tables);

      const diffResult = await invoke<TableDiff[]>('compare_tables', {
        projectId: project.id,
        remoteTablesJson: JSON.stringify(tables),
      });
      setDiffs(diffResult);

      try {
        const remoteRoutines = await invoke<RemoteRoutine[]>('get_remote_routines_cmd', {
          connectionId: selectedConnectionId,
        });
        const routineDiffResult = await invoke<RoutineDiff[]>('compare_routines', {
          projectId: project.id,
          remoteRoutinesJson: JSON.stringify(remoteRoutines),
          dbType: connections.find(c => c.id === selectedConnectionId)?.type || 'mysql',
        });
        setRoutineDiffs(routineDiffResult);
      } catch (routineError) {
        console.warn(t('sync_routine_compare_failed') + ':', routineError);
        setRoutineDiffs([]);
      }
    } catch (error) {
      console.error(t('sync_connect_failed') + ':', error);
      message.error(t('sync_connect_failed') + ': ' + error);
    } finally {
      setConnecting(false);
    }
  };

  const handleGenerateSyncSQL = async () => {
    if (remoteTables.length === 0) {
      message.warning(t('sync_connect_first'));
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
      console.error(t('sync_generate_sql_failed') + ':', error);
      message.error(t('sync_generate_sql_failed') + ': ' + error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(sqlContent);
      message.success(t('sync_copied_to_clipboard'));
    } catch {
      message.error(t('sync_copy_failed'));
    }
  };

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
      message.error(t('sync_refresh_diff_failed') + ': ' + error);
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'only_local':
        return <Tag color="green">{t('sync_only_local')}</Tag>;
      case 'only_remote':
        return <Tag color="orange">{t('sync_only_remote')}</Tag>;
      case 'different':
        return <Tag color="red">{t('sync_different')}</Tag>;
      case 'same':
        return <Tag color="blue">{t('sync_same')}</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{t('sync_title')}</Title>
        </div>

        <Space style={{ marginBottom: 24 }} size="middle">
          <Select
            style={{ width: 500 }}
            placeholder={t('sync_select_connection')}
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
            {t('sync_connect_compare')}
          </Button>
          {connected && (
            <Button
              icon={<SyncOutlined />}
              loading={loading}
              onClick={handleGenerateSyncSQL}
              disabled={diffs.length === 0}
            >
              {t('sync_generate_script')}
            </Button>
          )}
        </Space>

        {connections.length === 0 && (
          <Alert
            message={t('sync_no_matching_connection')}
            description={t('sync_add_connection_first')}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {connected && (diffs.length > 0 || routineDiffs.length > 0) && (
          <Tabs items={[
            {
              key: 'table',
              label: t('sync_table_structure', { count: diffs.length }),
              children: diffs.length > 0 ? (
                <SyncTableDiff
                  project={project}
                  diffs={diffs}
                  remoteTables={remoteTables}
                  syncingKeys={syncingKeys}
                  onSyncingKeysChange={setSyncingKeys}
                  onRefreshDiffs={refreshDiffs}
                  getStatusTag={getStatusTag}
                />
              ) : (
                <Empty description={t('sync_no_table_diff_result')} />
              ),
            },
            {
              key: 'routine',
              label: t('sync_routine_objects', { count: routineDiffs.length }),
              children: routineDiffs.length > 0 ? (
                <SyncRoutineDiff
                  project={project}
                  routineDiffs={routineDiffs}
                  selectedConnectionId={selectedConnectionId}
                  dbType={connections.find(c => c.id === selectedConnectionId)?.type || 'mysql'}
                  syncingKeys={syncingKeys}
                  onSyncingKeysChange={setSyncingKeys}
                  onRoutineDiffsChange={setRoutineDiffs}
                  getStatusTag={getStatusTag}
                />
              ) : (
                <Empty description={t('sync_no_routine_diff_result')} />
              ),
            },
          ]} />
        )}

        {connected && diffs.length === 0 && routineDiffs.length === 0 && (
          <Empty description={t('sync_no_diff_result')} />
        )}
      </Card>

      <Drawer
        title={t('sync_script')}
        open={isSqlModalVisible}
        onClose={() => setIsSqlModalVisible(false)}
        width={800}
        footer={
          <Space>
            <Button icon={<CopyOutlined />} onClick={handleCopySQL}>
              {t('sync_copy')}
            </Button>
            <Button onClick={() => setIsSqlModalVisible(false)}>
              {t('sync_close')}
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