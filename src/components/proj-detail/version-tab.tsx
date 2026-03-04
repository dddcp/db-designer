import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  Form,
  Input,
  List,
  message,
  Drawer,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ExportOutlined,
  DiffOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import type { Project } from '../../types';

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
}

const VersionTab: React.FC<VersionTabProps> = ({ project }) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isSqlModalVisible, setIsSqlModalVisible] = useState(false);
  const [isUpgradeModalVisible, setIsUpgradeModalVisible] = useState(false);
  const [sqlContent, setSqlContent] = useState('');
  const [sqlTitle, setSqlTitle] = useState('');
  const [upgradeOldId, setUpgradeOldId] = useState<number | undefined>();
  const [upgradeNewId, setUpgradeNewId] = useState<number | undefined>();
  const [form] = Form.useForm();

  useEffect(() => {
    loadVersions();
  }, [project.id]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const result = await invoke<Version[]>('get_versions', { projectId: project.id });
      setVersions(result);
    } catch (error) {
      console.error('加载版本列表失败:', error);
      message.error('加载版本列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建版本
  const handleCreateVersion = async (values: { name: string }) => {
    try {
      await invoke('create_version', { projectId: project.id, name: values.name });
      message.success('版本创建成功');
      setIsCreateModalVisible(false);
      form.resetFields();
      await loadVersions();
    } catch (error) {
      console.error('创建版本失败:', error);
      message.error('创建版本失败');
    }
  };

  // 删除版本
  const handleDeleteVersion = async (id: number) => {
    try {
      await invoke('delete_version', { id });
      message.success('版本删除成功');
      await loadVersions();
    } catch (error) {
      console.error('删除版本失败:', error);
      message.error('删除版本失败');
    }
  };

  // 导出版本 SQL
  const handleExportSQL = async (version: Version) => {
    try {
      const sql = await invoke<string>('export_version_sql', {
        versionId: version.id,
        databaseType: project.database_type,
      });
      setSqlTitle(`版本 "${version.name}" 完整 SQL`);
      setSqlContent(sql);
      setIsSqlModalVisible(true);
    } catch (error) {
      console.error('导出SQL失败:', error);
      message.error('导出SQL失败');
    }
  };

  // 打开升级脚本对话框
  const handleOpenUpgradeModal = () => {
    if (versions.length < 2) {
      message.warning('至少需要 2 个版本才能生成升级脚本');
      return;
    }
    setUpgradeOldId(undefined);
    setUpgradeNewId(undefined);
    setIsUpgradeModalVisible(true);
  };

  // 生成升级 SQL
  const handleGenerateUpgradeSQL = async () => {
    if (!upgradeOldId || !upgradeNewId) {
      message.warning('请选择旧版本和新版本');
      return;
    }
    if (upgradeOldId === upgradeNewId) {
      message.warning('旧版本和新版本不能相同');
      return;
    }
    try {
      const sql = await invoke<string>('export_upgrade_sql', {
        oldVersionId: upgradeOldId,
        newVersionId: upgradeNewId,
        databaseType: project.database_type,
      });
      setIsUpgradeModalVisible(false);
      const oldV = versions.find(v => v.id === upgradeOldId);
      const newV = versions.find(v => v.id === upgradeNewId);
      setSqlTitle(`升级脚本: ${oldV?.name} -> ${newV?.name}`);
      setSqlContent(sql);
      setIsSqlModalVisible(true);
    } catch (error) {
      console.error('生成升级脚本失败:', error);
      message.error('生成升级脚本失败');
    }
  };

  // 复制 SQL
  const handleCopySQL = async () => {
    try {
      await navigator.clipboard.writeText(sqlContent);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败');
    }
  };

  // 解析快照摘要
  const getSnapshotSummary = (snapshotJson: string): string => {
    try {
      const snap: Snapshot = JSON.parse(snapshotJson);
      const tableCount = snap.tables.length;
      const colCount = snap.tables.reduce((sum, t) => sum + t.columns.length, 0);
      const dataCount = snap.tables.reduce((sum, t) => sum + t.init_data.length, 0);
      return `${tableCount} 张表, ${colCount} 个字段, ${dataCount} 条初始数据`;
    } catch {
      return '快照解析失败';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
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
          <Title level={4} style={{ margin: 0 }}>版本管理</Title>
          <Space>
            <Button
              icon={<DiffOutlined />}
              onClick={handleOpenUpgradeModal}
              disabled={versions.length < 2}
            >
              生成升级脚本
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setIsCreateModalVisible(true);
              }}
            >
              创建版本
            </Button>
          </Space>
        </div>

        <List
          loading={loading}
          dataSource={versions}
          renderItem={(version) => (
            <List.Item
              actions={[
                <Button
                  type="link"
                  key="export"
                  icon={<ExportOutlined />}
                  onClick={() => handleExportSQL(version)}
                >
                  导出SQL
                </Button>,
                <Popconfirm
                  key="delete"
                  title="确定删除此版本吗？"
                  onConfirm={() => handleDeleteVersion(version.id)}
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{version.name}</Text>
                    <Tag color="blue">v{version.id}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      创建于: {formatDate(version.created_at)}
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
                <Text type="secondary">暂无版本，点击"创建版本"快照当前表结构</Text>
              </div>
            ),
          }}
        />
      </Card>

      {/* 创建版本弹窗 */}
      <Drawer
        title="创建版本"
        open={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateVersion}>
          <Form.Item
            name="name"
            label="版本名称"
            rules={[{ required: true, message: '请输入版本名称' }]}
          >
            <Input placeholder="例如: v1.0.0" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setIsCreateModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      {/* SQL 查看弹窗 */}
      <Drawer
        title={sqlTitle}
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

      {/* 升级脚本弹窗 */}
      <Drawer
        title="生成升级脚本"
        open={isUpgradeModalVisible}
        onClose={() => setIsUpgradeModalVisible(false)}
        footer={
          <Space>
            <Button type="primary" onClick={handleGenerateUpgradeSQL}>生成</Button>
            <Button onClick={() => setIsUpgradeModalVisible(false)}>取消</Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>旧版本（基准）</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择旧版本"
              value={upgradeOldId}
              onChange={setUpgradeOldId}
            >
              {versions.map(v => (
                <Option key={v.id} value={v.id}>{v.name} ({formatDate(v.created_at)})</Option>
              ))}
            </Select>
          </div>
          <div>
            <Text strong>新版本（目标）</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder="选择新版本"
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
