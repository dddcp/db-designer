import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  List,
  message,
  Drawer,
  Popconfirm,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ExportOutlined,
  DiffOutlined,
  CopyOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { Project, DatabaseTypeOption } from '../../types';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

interface VersionTabProps {
  project: Project;
}

interface Version {
  id: number;
  project_id: number;
  name: string;
  snapshot: string;
  created_at: string;
}

interface SnapshotTable {
  id: string;
  name: string;
  display_name: string;
  columns: any[];
  indexes: any[];
  init_data: string[];
}

interface Snapshot {
  tables: SnapshotTable[];
  routines?: SnapshotRoutine[];
}

interface SnapshotRoutine {
  name: string;
  type: string;
}

const VersionTab: React.FC<VersionTabProps> = ({ project }) => {
  const { t, i18n } = useTranslation();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isSqlModalVisible, setIsSqlModalVisible] = useState(false);
  const [isUpgradeModalVisible, setIsUpgradeModalVisible] = useState(false);
  const [sqlContent, setSqlContent] = useState('');
  const [sqlTitle, setSqlTitle] = useState('');
  const [upgradeOldId, setUpgradeOldId] = useState<number | undefined>();
  const [upgradeNewId, setUpgradeNewId] = useState<number | undefined>();
  const [upgradeDatabaseType, setUpgradeDatabaseType] = useState<string>('mysql');
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    loadVersions();
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, [project.id]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const result = await invoke<Version[]>('get_versions', { projectId: project.id });
      setVersions(result);
    } catch (error) {
      console.error('加载版本列表失败:', error);
      message.error(t('version_load_fail'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async (values: { name: string }) => {
    try {
      await invoke('create_version', { projectId: project.id, name: values.name });
      message.success(t('version_create_success'));
      setIsCreateModalVisible(false);
      form.resetFields();
      await loadVersions();
    } catch (error) {
      console.error('创建版本失败:', error);
      message.error(t('version_create_fail'));
    }
  };

  const handleDeleteVersion = async (id: number) => {
    try {
      await invoke('delete_version', { id });
      message.success(t('version_delete_success'));
      await loadVersions();
    } catch (error) {
      console.error('删除版本失败:', error);
      message.error(t('version_delete_fail'));
    }
  };

  const handleExportSQL = async (version: Version, dbType: string) => {
    try {
      const sql = await invoke<string>('export_version_sql', {
        versionId: version.id,
        databaseType: dbType,
      });
      const typeInfo = dbTypes.find(t => t.value === dbType);
      setSqlTitle(t('version_sql_title', { name: version.name, type: typeInfo?.label || dbType }));
      setSqlContent(sql);
      setIsSqlModalVisible(true);
    } catch (error) {
      console.error('导出SQL失败:', error);
      message.error(t('version_export_fail'));
    }
  };

  const handleOpenUpgradeModal = () => {
    if (versions.length < 2) {
      message.warning(t('version_upgrade_need_two'));
      return;
    }
    setUpgradeOldId(undefined);
    setUpgradeNewId(undefined);
    setIsUpgradeModalVisible(true);
  };

  const handleGenerateUpgradeSQL = async () => {
    if (!upgradeOldId || !upgradeNewId) {
      message.warning(t('version_select_old_new'));
      return;
    }
    if (upgradeOldId === upgradeNewId) {
      message.warning(t('version_same_version'));
      return;
    }
    try {
      const sql = await invoke<string>('export_upgrade_sql', {
        oldVersionId: upgradeOldId,
        newVersionId: upgradeNewId,
        databaseType: upgradeDatabaseType,
      });
      setIsUpgradeModalVisible(false);
      const oldV = versions.find(v => v.id === upgradeOldId);
      const newV = versions.find(v => v.id === upgradeNewId);
      setSqlTitle(t('version_upgrade_title', { old: oldV?.name, new: newV?.name }));
      setSqlContent(sql);
      setIsSqlModalVisible(true);
    } catch (error) {
      console.error('生成升级脚本失败:', error);
      message.error(t('version_upgrade_fail'));
    }
  };

  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(sqlContent);
      message.success(t('copy_success'));
    } catch {
      message.error(t('copy_fail'));
    }
  };

  const getSnapshotSummary = (snapshotJson: string): string => {
    try {
      const snap: Snapshot = JSON.parse(snapshotJson);
      const tableCount = snap.tables.length;
      const colCount = snap.tables.reduce((sum, t) => sum + t.columns.length, 0);
      const dataCount = snap.tables.reduce((sum, t) => sum + t.init_data.length, 0);
      const parts: string[] = [
        t('version_snapshot_tables', { tableCount }),
        t('version_snapshot_columns', { colCount }),
        t('version_snapshot_data', { dataCount }),
      ];
      if (snap.routines && snap.routines.length > 0) {
        const funcCount = snap.routines.filter(r => r.type === 'function').length;
        const procCount = snap.routines.filter(r => r.type === 'procedure').length;
        const trigCount = snap.routines.filter(r => r.type === 'trigger').length;
        if (funcCount > 0) parts.push(t('version_snapshot_functions', { count: funcCount }));
        if (procCount > 0) parts.push(t('version_snapshot_procedures', { count: procCount }));
        if (trigCount > 0) parts.push(t('version_snapshot_triggers', { count: trigCount }));
      }
      return parts.join(', ');
    } catch {
      return t('version_snapshot_fail');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{t('version_title')}</Title>
          <Space>
            <Button
              icon={<DiffOutlined />}
              onClick={handleOpenUpgradeModal}
              disabled={versions.length < 2}
            >
              {t('version_upgrade_script')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setIsCreateModalVisible(true);
              }}
            >
              {t('version_create')}
            </Button>
          </Space>
        </div>

        <List
          loading={loading}
          dataSource={versions}
          renderItem={(version) => (
            <List.Item
              actions={[
                <Dropdown
                  key="export"
                  menu={{
                    items: dbTypes.map(t => ({
                      key: t.value,
                      label: t.label,
                      onClick: () => handleExportSQL(version, t.value),
                    })),
                  }}
                >
                  <Button type="link" icon={<ExportOutlined />}>
                    {t('version_export_sql')} <DownOutlined />
                  </Button>
                </Dropdown>,
                <Popconfirm
                  key="delete"
                  title={t('version_delete_confirm')}
                  okText={t('confirm')}
                  cancelText={t('cancel')}
                  onConfirm={() => handleDeleteVersion(version.id)}
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>
                    {t('delete')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{version.name}</Text>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('version_created_at', { date: formatDate(version.created_at) })}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {getSnapshotSummary(version.snapshot)}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">{t('version_empty')}</Text>
              </div>
            ),
          }}
        />
      </Card>

      <Drawer
        title={t('version_create_drawer')}
        open={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateVersion}>
          <Form.Item
            name="name"
            label={t('version_name')}
            rules={[{ required: true, message: t('version_name_required') }]}
          >
            <Input placeholder="例如: v1.0.0" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">{t('create')}</Button>
              <Button onClick={() => setIsCreateModalVisible(false)}>{t('cancel')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={sqlTitle}
        open={isSqlModalVisible}
        onClose={() => setIsSqlModalVisible(false)}
        width={800}
        footer={
          <Space>
            <Button icon={<CopyOutlined />} onClick={handleCopySQL}>
              {t('copy')}
            </Button>
            <Button onClick={() => setIsSqlModalVisible(false)}>
              {t('close')}
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

      <Drawer
        title={t('version_upgrade_drawer')}
        open={isUpgradeModalVisible}
        onClose={() => setIsUpgradeModalVisible(false)}
        footer={
          <Space>
            <Button type="primary" onClick={handleGenerateUpgradeSQL}>{t('version_generate')}</Button>
            <Button onClick={() => setIsUpgradeModalVisible(false)}>{t('cancel')}</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>{t('version_db_type')}</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={upgradeDatabaseType}
              onChange={setUpgradeDatabaseType}
            >
              {dbTypes.map(t => (
                <Option key={t.value} value={t.value}>{t.label}</Option>
              ))}
            </Select>
          </div>
          <div>
            <Text strong>{t('version_old_version')}</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder={t('version_select_old')}
              value={upgradeOldId}
              onChange={setUpgradeOldId}
            >
              {versions.map(v => (
                <Option key={v.id} value={v.id}>{v.name} ({formatDate(v.created_at)})</Option>
              ))}
            </Select>
          </div>
          <div>
            <Text strong>{t('version_new_version')}</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder={t('version_select_new')}
              value={upgradeNewId}
              onChange={setUpgradeNewId}
            >
              {versions.map(v => (
                <Option key={v.id} value={v.id}>{v.name} ({formatDate(v.created_at)})</Option>
              ))}
            </Select>
          </div>
        </Space>
      </Drawer>
    </div>
  );
};

export default VersionTab;