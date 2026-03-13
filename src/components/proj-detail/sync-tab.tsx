import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

  // 编程对象对比
  const [routineDiffs, setRoutineDiffs] = useState<RoutineDiff[]>([]);

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
    setRoutineDiffs([]);
    try {
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

      // 获取远程编程对象并比对
      try {
        const remoteRoutines = await invoke<RemoteRoutine[]>('get_remote_routines_cmd', {
          connectionId: selectedConnectionId,
        });
        const routineDiffResult = await invoke<RoutineDiff[]>('compare_routines', {
          projectId: project.id,
          remoteRoutinesJson: JSON.stringify(remoteRoutines),
        });
        setRoutineDiffs(routineDiffResult);
      } catch (routineError) {
        console.warn('编程对象比对失败（不影响表比对）:', routineError);
        setRoutineDiffs([]);
      }
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

        {/* 比对结果 — 分Tab显示 */}
        {connected && (diffs.length > 0 || routineDiffs.length > 0) && (
          <Tabs items={[
            {
              key: 'table',
              label: `表结构 (${diffs.length})`,
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
                <Empty description="未获取到表结构比对结果" />
              ),
            },
            {
              key: 'routine',
              label: `编程对象 (${routineDiffs.length})`,
              children: routineDiffs.length > 0 ? (
                <SyncRoutineDiff
                  project={project}
                  routineDiffs={routineDiffs}
                  selectedConnectionId={selectedConnectionId}
                  syncingKeys={syncingKeys}
                  onSyncingKeysChange={setSyncingKeys}
                  onRoutineDiffsChange={setRoutineDiffs}
                  getStatusTag={getStatusTag}
                />
              ) : (
                <Empty description="未获取到编程对象比对结果" />
              ),
            },
          ]} />
        )}

        {connected && diffs.length === 0 && routineDiffs.length === 0 && (
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
