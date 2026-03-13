import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CopyOutlined,
  ExportOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { Project, RoutineDef } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface RoutineTabProps {
  project: Project;
}

const ROUTINE_TYPE_LABELS: Record<string, string> = {
  function: '函数',
  procedure: '存储过程',
  trigger: '触发器',
};

const ROUTINE_TYPE_COLORS: Record<string, string> = {
  function: 'blue',
  procedure: 'green',
  trigger: 'orange',
};

const RoutineTab: React.FC<RoutineTabProps> = ({ project }) => {
  const [activeTab, setActiveTab] = useState('manage');
  const [routines, setRoutines] = useState<RoutineDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditDrawerVisible, setIsEditDrawerVisible] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Partial<RoutineDef> | null>(null);

  // SQL导出相关
  const [sqlContent, setSqlContent] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    loadRoutines();
  }, [project.id]);

  const loadRoutines = async () => {
    setLoading(true);
    try {
      const result = await invoke<RoutineDef[]>('get_project_routines', { projectId: project.id });
      setRoutines(result);
    } catch (error) {
      console.error('加载编程对象失败:', error);
      message.error('加载编程对象失败');
    } finally {
      setLoading(false);
    }
  };

  // ─── 编程对象维护 ─────────────────────────────────────────────────

  const handleCreate = (type: string) => {
    setEditingRoutine({
      id: Date.now().toString(),
      project_id: project.id,
      name: '',
      type: type as RoutineDef['type'],
      body: '',
      comment: '',
    });
    setIsEditDrawerVisible(true);
  };

  const handleEdit = (routine: RoutineDef) => {
    setEditingRoutine({ ...routine });
    setIsEditDrawerVisible(true);
  };

  const handleSave = async () => {
    if (!editingRoutine) return;
    if (!editingRoutine.name?.trim()) {
      message.warning('请输入名称');
      return;
    }
    if (!editingRoutine.body?.trim()) {
      message.warning('请输入SQL定义');
      return;
    }

    try {
      await invoke('save_routine', {
        routine: {
          id: editingRoutine.id,
          project_id: project.id,
          name: editingRoutine.name,
          type: editingRoutine.type,
          body: editingRoutine.body,
          comment: editingRoutine.comment || null,
          created_at: editingRoutine.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      message.success('保存成功');
      setIsEditDrawerVisible(false);
      await loadRoutines();
    } catch (error) {
      console.error('保存失败:', error);
      message.error('保存失败: ' + error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_routine', { id });
      message.success('删除成功');
      await loadRoutines();
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败: ' + error);
    }
  };

  // ─── SQL导出 ──────────────────────────────────────────────────────

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const sql = await invoke<string>('export_routines_sql', { projectId: project.id });
      setSqlContent(sql);
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败: ' + error);
    } finally {
      setExportLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  // ─── 列定义 ───────────────────────────────────────────────────────

  const manageColumns = [
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
      render: (type: string) => (
        <Tag color={ROUTINE_TYPE_COLORS[type] || 'default'}>
          {ROUTINE_TYPE_LABELS[type] || type}
        </Tag>
      ),
    },
    {
      title: '说明',
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (text: string) => text || <Text type="secondary">-</Text>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: RoutineDef) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // ─── 渲染 ─────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'manage',
            label: '编程对象维护',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text type="secondary">管理项目中的函数、存储过程和触发器。注意：此类结构并没有区分数据库类型，简单维护</Text>
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'function', label: '函数' },
                        { key: 'procedure', label: '存储过程' },
                        { key: 'trigger', label: '触发器' },
                      ],
                      onClick: ({ key }) => handleCreate(key),
                    }}
                  >
                    <Button type="primary" icon={<PlusOutlined />}>
                      新建 <DownOutlined />
                    </Button>
                  </Dropdown>
                </div>
                <Table
                  dataSource={routines}
                  columns={manageColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  locale={{
                    emptyText: (
                      <Empty description="暂无编程对象，点击上方按钮创建" />
                    ),
                  }}
                />
              </div>
            ),
          },
          {
            key: 'export',
            label: 'SQL导出',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text type="secondary">导出当前项目所有编程对象的 SQL</Text>
                  <Space>
                    <Button
                      type="primary"
                      icon={<ExportOutlined />}
                      loading={exportLoading}
                      onClick={handleExport}
                    >
                      生成 SQL
                    </Button>
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(sqlContent)}
                      disabled={!sqlContent}
                    >
                      复制
                    </Button>
                  </Space>
                </div>
                <TextArea
                  value={sqlContent}
                  readOnly
                  rows={20}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                  placeholder='点击"生成 SQL"导出编程对象...'
                />
              </div>
            ),
          },
        ]} />
      </Card>

      {/* 编辑 Drawer */}
      <Drawer
        title={editingRoutine?.created_at ? '编辑编程对象' : '新建编程对象'}
        open={isEditDrawerVisible}
        onClose={() => setIsEditDrawerVisible(false)}
        width={700}
        footer={
          <Space>
            <Button type="primary" onClick={handleSave}>保存</Button>
            <Button onClick={() => setIsEditDrawerVisible(false)}>取消</Button>
          </Space>
        }
      >
        {editingRoutine && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>类型</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={editingRoutine.type}
                onChange={(v) => setEditingRoutine({ ...editingRoutine, type: v })}
              >
                <Option value="function">函数</Option>
                <Option value="procedure">存储过程</Option>
                <Option value="trigger">触发器</Option>
              </Select>
            </div>
            <div>
              <Text strong>名称</Text>
              <Input
                style={{ marginTop: 4 }}
                value={editingRoutine.name}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, name: e.target.value })}
                placeholder="编程对象名称"
              />
            </div>
            <div>
              <Text strong>说明</Text>
              <Input
                style={{ marginTop: 4 }}
                value={editingRoutine.comment || ''}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, comment: e.target.value })}
                placeholder="可选说明"
              />
            </div>
            <div>
              <Text strong>SQL 定义</Text>
              <TextArea
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 13 }}
                value={editingRoutine.body}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, body: e.target.value })}
                rows={16}
                placeholder="CREATE FUNCTION / CREATE PROCEDURE / CREATE TRIGGER ..."
              />
            </div>
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default RoutineTab;
