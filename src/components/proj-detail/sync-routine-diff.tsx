import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import type { Project, RemoteRoutine, RoutineDiff } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;

interface SyncRoutineDiffProps {
  project: Project;
  routineDiffs: RoutineDiff[];
  selectedConnectionId: number | undefined;
  syncingKeys: Set<string>;
  onSyncingKeysChange: (updater: (prev: Set<string>) => Set<string>) => void;
  onRoutineDiffsChange: (diffs: RoutineDiff[]) => void;
  getStatusTag: (status: string) => React.ReactNode;
}

const SyncRoutineDiff: React.FC<SyncRoutineDiffProps> = ({
  project,
  routineDiffs,
  selectedConnectionId,
  syncingKeys,
  onSyncingKeysChange,
  onRoutineDiffsChange,
  getStatusTag,
}) => {
  const [routineDiffDrawerVisible, setRoutineDiffDrawerVisible] = useState(false);
  const [selectedRoutineDiff, setSelectedRoutineDiff] = useState<RoutineDiff | null>(null);

  // 同步远程编程对象到本地
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
      });
      message.success(`${diff.name} 同步成功`);
      // 重新比对编程对象
      if (selectedConnectionId) {
        const remoteRoutines = await invoke<RemoteRoutine[]>('get_remote_routines_cmd', {
          connectionId: selectedConnectionId,
        });
        const routineDiffResult = await invoke<RoutineDiff[]>('compare_routines', {
          projectId: project.id,
          remoteRoutinesJson: JSON.stringify(remoteRoutines),
        });
        onRoutineDiffsChange(routineDiffResult);
      }
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

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  const routineColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => {
        const labels: Record<string, string> = { function: '函数', procedure: '存储过程', trigger: '触发器' };
        const colors: Record<string, string> = { function: 'blue', procedure: 'green', trigger: 'orange' };
        return <Tag color={colors[type] || 'default'}>{labels[type] || type}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '操作',
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
              查看差异
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
              同步到本地
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Space size="large">
          <Text>共 {routineDiffs.length} 个编程对象：</Text>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text>一致 {routineDiffs.filter(d => d.status === 'same').length}</Text>
          </Space>
          <Tag color="green">仅本地 {routineDiffs.filter(d => d.status === 'only_local').length}</Tag>
          <Tag color="orange">仅远程 {routineDiffs.filter(d => d.status === 'only_remote').length}</Tag>
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text>有差异 {routineDiffs.filter(d => d.status === 'different').length}</Text>
          </Space>
        </Space>
      </div>

      <Table
        dataSource={routineDiffs}
        columns={routineColumns}
        rowKey={(r) => `${r.name}_${r.type}`}
        pagination={false}
        size="small"
      />

      {/* 编程对象差异查看弹窗 */}
      <Drawer
        title={selectedRoutineDiff ? `${({function: '函数', procedure: '存储过程', trigger: '触发器'} as Record<string,string>)[selectedRoutineDiff.type] || selectedRoutineDiff.type}: ${selectedRoutineDiff.name}` : '差异对比'}
        open={routineDiffDrawerVisible}
        onClose={() => setRoutineDiffDrawerVisible(false)}
        width={900}
      >
        {selectedRoutineDiff && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>本地</Text>
                {selectedRoutineDiff.local_body && (
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyText(selectedRoutineDiff.local_body || '')}>复制</Button>
                )}
              </div>
              <TextArea
                value={selectedRoutineDiff.local_body || '(无)'}
                readOnly
                rows={20}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong>远程</Text>
                {selectedRoutineDiff.remote_body && (
                  <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyText(selectedRoutineDiff.remote_body || '')}>复制</Button>
                )}
              </div>
              <TextArea
                value={selectedRoutineDiff.remote_body || '(无)'}
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
