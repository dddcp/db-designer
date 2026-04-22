import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { Project, RoutineDef, DatabaseTypeOption } from '../../types';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface RoutineTabProps {
  project: Project;
}

const ROUTINE_TYPE_COLORS: Record<string, string> = {
  function: 'blue',
  procedure: 'green',
  trigger: 'orange',
};

const RoutineTab: React.FC<RoutineTabProps> = ({ project }) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('manage');
  const [routines, setRoutines] = useState<RoutineDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditDrawerVisible, setIsEditDrawerVisible] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Partial<RoutineDef> | null>(null);

  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);
  const [filterDbType, setFilterDbType] = useState<string>('');

  const [sqlContent, setSqlContent] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportDbType, setExportDbType] = useState('mysql');

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

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
      message.error(t('routine_load_fail'));
    } finally {
      setLoading(false);
    }
  };

  const filteredRoutines = filterDbType
    ? routines.filter(r => r.db_type === filterDbType)
    : routines;

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
      message.warning(t('routine_name_required'));
      return;
    }
    if (!editingRoutine.body?.trim()) {
      message.warning(t('routine_sql_required'));
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
          db_type: editingRoutine.db_type || null,
          created_at: editingRoutine.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      message.success(t('save_success'));
      setIsEditDrawerVisible(false);
      await loadRoutines();
    } catch (error) {
      console.error('保存失败:', error);
      message.error(t('routine_save_fail') + ': ' + error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_routine', { id });
      message.success(t('delete_success'));
      await loadRoutines();
    } catch (error) {
      console.error('删除失败:', error);
      message.error(t('routine_delete_fail') + ': ' + error);
    }
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const sql = await invoke<string>('export_routines_sql', {
        projectId: project.id,
        databaseType: exportDbType,
      });
      setSqlContent(sql);
    } catch (error) {
      console.error('导出失败:', error);
      message.error(t('routine_export_fail') + ': ' + error);
    } finally {
      setExportLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('copy_success'));
    } catch {
      message.error(t('copy_fail'));
    }
  };

  const getDbTypeTag = (dbType?: string) => {
    if (!dbType) {
      return <Tag color="default">{t('sync_routine_unspecified')}</Tag>;
    }
    const info = dbTypes.find(t => t.value === dbType);
    return <Tag color={info?.color || 'default'}>{info?.label || dbType}</Tag>;
  };

  const manageColumns = [
    {
      title: t('routine_name_col'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('routine_type_col'),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => {
        const labelMap: Record<string, string> = {
          function: t('routine_function'),
          procedure: t('routine_procedure'),
          trigger: t('routine_trigger'),
        };
        return (
          <Tag color={ROUTINE_TYPE_COLORS[type] || 'default'}>
            {labelMap[type] || type}
          </Tag>
        );
      },
    },
    {
      title: t('routine_db_type_col'),
      dataIndex: 'db_type',
      key: 'db_type',
      width: 120,
      render: (db_type: string) => getDbTypeTag(db_type),
    },
    {
      title: t('routine_comment_col'),
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (text: string) => text || <Text type="secondary">-</Text>,
    },
    {
      title: t('routine_updated_col'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (text: string) => new Date(text).toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN'),
    },
    {
      title: t('routine_action_col'),
      key: 'action',
      width: 200,
      render: (_: unknown, record: RoutineDef) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            {t('edit')}
          </Button>
          <Popconfirm title={t('routine_delete_confirm')} okText={t('confirm')} cancelText={t('cancel')} onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              {t('delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          {
            key: 'manage',
            label: t('routine_maintenance'),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Space>
                    <Text type="secondary">{t('routine_manage_desc')}</Text>
                    <Select
                      style={{ width: 140 }}
                      value={filterDbType}
                      onChange={setFilterDbType}
                      placeholder={t('routine_db_type')}
                      allowClear
                    >
                      <Option value="">{t('routine_all')}</Option>
                      {dbTypes.map(t => (
                        <Option key={t.value} value={t.value}>{t.label}</Option>
                      ))}
                    </Select>
                  </Space>
                  <Dropdown
                    menu={{
                      items: [
                        { key: 'function', label: t('routine_function') },
                        { key: 'procedure', label: t('routine_procedure') },
                        { key: 'trigger', label: t('routine_trigger') },
                      ],
                      onClick: ({ key }) => handleCreate(key),
                    }}
                  >
                    <Button type="primary" icon={<PlusOutlined />}>
                      {t('routine_new')} <DownOutlined />
                    </Button>
                  </Dropdown>
                </div>
                <Table
                  dataSource={filteredRoutines}
                  columns={manageColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={false}
                  locale={{
                    emptyText: (
                      <Empty description={t('routine_empty')} />
                    ),
                  }}
                />
              </div>
            ),
          },
          {
            key: 'export',
            label: t('routine_sql_export'),
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text type="secondary">{t('routine_export_desc')}</Text>
                  <Space>
                    <Select
                      style={{ width: 140 }}
                      value={exportDbType}
                      onChange={setExportDbType}
                    >
                      {dbTypes.map(t => (
                        <Option key={t.value} value={t.value}>{t.label}</Option>
                      ))}
                    </Select>
                    <Button
                      type="primary"
                      icon={<ExportOutlined />}
                      loading={exportLoading}
                      onClick={handleExport}
                    >
                      {t('routine_generate_sql')}
                    </Button>
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => handleCopy(sqlContent)}
                      disabled={!sqlContent}
                    >
                      {t('copy')}
                    </Button>
                  </Space>
                </div>
                <TextArea
                  value={sqlContent}
                  readOnly
                  rows={20}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                  placeholder={t('routine_sql_placeholder')}
                />
              </div>
            ),
          },
        ]} />
      </Card>

      <Drawer
        title={editingRoutine?.created_at ? t('routine_edit') : t('routine_create')}
        open={isEditDrawerVisible}
        onClose={() => setIsEditDrawerVisible(false)}
        width={700}
        footer={
          <Space>
            <Button type="primary" onClick={handleSave}>{t('save')}</Button>
            <Button onClick={() => setIsEditDrawerVisible(false)}>{t('cancel')}</Button>
          </Space>
        }
      >
        {editingRoutine && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>{t('routine_type_label')}</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={editingRoutine.type}
                onChange={(v) => setEditingRoutine({ ...editingRoutine, type: v })}
              >
                <Option value="function">{t('routine_function')}</Option>
                <Option value="procedure">{t('routine_procedure')}</Option>
                <Option value="trigger">{t('routine_trigger')}</Option>
              </Select>
            </div>
            <div>
              <Text strong>{t('routine_db_type_label')}</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                value={editingRoutine.db_type || undefined}
                onChange={(v) => setEditingRoutine({ ...editingRoutine, db_type: v || undefined })}
                placeholder={t('sync_routine_unspecified')}
                allowClear
              >
                {dbTypes.map(t => (
                  <Option key={t.value} value={t.value}>{t.label}</Option>
                ))}
              </Select>
            </div>
            <div>
              <Text strong>{t('routine_name_label')}</Text>
              <Input
                style={{ marginTop: 4 }}
                value={editingRoutine.name}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, name: e.target.value })}
                placeholder={t('routine_name_placeholder')}
              />
            </div>
            <div>
              <Text strong>{t('routine_comment_label')}</Text>
              <Input
                style={{ marginTop: 4 }}
                value={editingRoutine.comment || ''}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, comment: e.target.value })}
                placeholder={t('routine_comment_placeholder')}
              />
            </div>
            <div>
              <Text strong>{t('routine_sql_label')}</Text>
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