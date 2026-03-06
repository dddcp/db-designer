import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Layout,
  Card,
  Button,
  Space,
  Typography,
  theme,
  Tabs,
  Form,
  Input,
  Select,
  Switch,
  message,
  Tooltip,
  Divider,
  Row,
  Col,
  List,
  Tag,
  Drawer,
  Popconfirm,
  Progress,
  Modal
} from 'antd';
import {
  ArrowLeftOutlined,
  SettingOutlined,
  CodeOutlined,
  SaveOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SyncOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { Option } = Select;
const { useToken } = theme;

import type { GitPlatform, DatabaseConnection, GitConfig } from '../../types';

// 设置项类型定义
interface Settings {
  isDarkMode: boolean;
  gitConfig: GitConfig;
  databaseConnections: DatabaseConnection[];
}

/**
 * 设置页面组件
 */
const Setting: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useToken();
  const [gitForm] = Form.useForm();
  const [dbForm] = Form.useForm();
  const [aiForm] = Form.useForm();
  
  const [settings, setSettings] = useState<Settings>({
    isDarkMode: false,
    gitConfig: {
      platform: 'github',
      token: '',
      repositoryName: '',
      isInitialized: false
    },
    databaseConnections: []
  });
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [dbConnections, setDbConnections] = useState<DatabaseConnection[]>([]);
  const [isDbModalVisible, setIsDbModalVisible] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | null>(null);
  const [gitConfigSaved, setGitConfigSaved] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadDatabaseConnections();
    getVersion().then(v => setAppVersion(v));
  }, []);

  /**
   * 加载设置
   */
  const loadSettings = async () => {
    try {
      // 加载主题设置
      const themeSetting = await invoke<{ [key: string]: string }>('get_all_settings');
      const isDarkMode = themeSetting['theme'] === 'dark';
      
      setSettings(prev => ({
        ...prev,
        isDarkMode
      }));

      // 加载Git配置
      const gitPlatform = themeSetting['git_platform'] as GitPlatform || 'github';
      const gitToken = themeSetting['git_token'] || '';
      const gitRepo = themeSetting['git_repository'] || '';
      
      gitForm.setFieldsValue({
        platform: gitPlatform,
        token: gitToken,
        repositoryName: gitRepo
      });

      // 如果已有完整的 git 配置，标记为已保存
      if (gitToken && gitRepo) {
        setGitConfigSaved(true);
      }

      // 加载AI配置
      aiForm.setFieldsValue({
        ai_base_url: themeSetting['ai_base_url'] || '',
        ai_api_key: themeSetting['ai_api_key'] || '',
        ai_model: themeSetting['ai_model'] || ''
      });

    } catch (error) {
      console.error('加载设置失败:', error);
      message.error('加载设置失败');
    }
  };

  /**
   * 返回主页
   */
  const handleBack = () => {
    navigate('/');
  };

  /**
   * 保存主题设置
   */
  const handleSaveTheme = async (isDarkMode: boolean) => {
    try {
      await invoke('save_setting', { 
        key: 'theme', 
        value: isDarkMode ? 'dark' : 'light' 
      });
      
      // 更新localStorage
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
      
      // 重新加载页面以应用主题
      window.location.reload();
    } catch (error) {
      console.error('保存主题设置失败:', error);
      message.error('保存主题设置失败');
    }
  };

  /**
   * 保存Git配置
   */
  const handleSaveGitConfig = async (values: any) => {
    setLoading(true);
    try {
      // 保存Git平台
      await invoke('save_setting', { 
        key: 'git_platform', 
        value: values.platform 
      });
      
      // 保存Git Token
      await invoke('save_setting', { 
        key: 'git_token', 
        value: values.token 
      });
      
      // 保存仓库名称
      await invoke('save_setting', { 
        key: 'git_repository', 
        value: values.repositoryName 
      });
      
      message.success('Git配置保存成功');
      setGitConfigSaved(true);
    } catch (error) {
      console.error('保存Git配置失败:', error);
      message.error('保存Git配置失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 保存AI配置
   */
  const handleSaveAiConfig = async (values: any) => {
    setLoading(true);
    try {
      await invoke('save_setting', { key: 'ai_base_url', value: values.ai_base_url });
      await invoke('save_setting', { key: 'ai_api_key', value: values.ai_api_key });
      await invoke('save_setting', { key: 'ai_model', value: values.ai_model });
      message.success('AI配置保存成功');
    } catch (error) {
      console.error('保存AI配置失败:', error);
      message.error('保存AI配置失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载数据库连接配置
   */
  const loadDatabaseConnections = async () => {
    try {
      const connections = await invoke<DatabaseConnection[]>('get_database_connections');
      setDbConnections(connections);
      setSettings(prev => ({
        ...prev,
        databaseConnections: connections
      }));
    } catch (error) {
      console.error('加载数据库连接配置失败:', error);
      message.error('加载数据库连接配置失败');
    }
  };

  /**
   * 打开添加数据库连接弹框
   */
  const handleAddDatabaseConnection = () => {
    setEditingConnection(null);
    dbForm.resetFields();
    setIsDbModalVisible(true);
  };

  /**
   * 打开编辑数据库连接弹框
   */
  const handleEditDatabaseConnection = (connection: DatabaseConnection) => {
    setEditingConnection(connection);
    dbForm.setFieldsValue({
      name: connection.name,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database
    });
    setIsDbModalVisible(true);
  };

  /**
   * 保存数据库连接配置
   */
  const handleSaveDatabaseConnection = async (values: any) => {
    setLoading(true);
    try {
      if (editingConnection) {
        // 更新
        await invoke('update_database_connection', {
          connection: {
            id: editingConnection.id,
            name: values.name,
            type: values.type,
            host: values.host,
            port: Number(values.port),
            username: values.username,
            password: values.password,
            database: values.database
          }
        });
        message.success('数据库连接配置更新成功');
      } else {
        // 创建
        await invoke('create_database_connection', {
          connection: {
            name: values.name,
            type: values.type,
            host: values.host,
            port: Number(values.port),
            username: values.username,
            password: values.password,
            database: values.database
          }
        });
        message.success('数据库连接配置创建成功');
      }
      setIsDbModalVisible(false);
      dbForm.resetFields();
      setEditingConnection(null);
      await loadDatabaseConnections();
    } catch (error) {
      console.error('保存数据库连接配置失败:', error);
      message.error('保存数据库连接配置失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 删除数据库连接配置
   */
  const handleDeleteDatabaseConnection = async (id: number) => {
    try {
      await invoke('delete_database_connection', { id });
      message.success('数据库连接配置删除成功');
      await loadDatabaseConnections();
    } catch (error) {
      console.error('删除数据库连接配置失败:', error);
      message.error('删除数据库连接配置失败');
    }
  };

  /**
   * 初始化Git仓库
   */
  const handleInitGitRepository = async () => {
    setLoading(true);
    try {
      const result = await invoke<string>('init_git_repository');
      message.success(result);
    } catch (error) {
      console.error('Git仓库初始化失败:', error);
      message.error(`Git仓库初始化失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 检查更新
   */
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await check();
      if (update) {
        Modal.confirm({
          title: '发现新版本',
          content: (
            <div>
              <p>最新版本: <strong>{update.version}</strong></p>
              <p>当前版本: {appVersion}</p>
              {update.body && (
                <div>
                  <p>更新说明:</p>
                  <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                    {update.body}
                  </div>
                </div>
              )}
            </div>
          ),
          okText: '下载并安装',
          cancelText: '稍后再说',
          onOk: async () => {
            setUpdating(true);
            setUpdateProgress(0);
            try {
              let totalSize = 0;
              let downloaded = 0;
              await update.downloadAndInstall((event) => {
                switch (event.event) {
                  case 'Started':
                    totalSize = event.data.contentLength ?? 0;
                    break;
                  case 'Progress':
                    downloaded += event.data.chunkLength;
                    if (totalSize > 0) {
                      setUpdateProgress(Math.round((downloaded / totalSize) * 100));
                    }
                    break;
                  case 'Finished':
                    setUpdateProgress(100);
                    break;
                }
              });
              message.success('更新下载完成，即将重启应用...');
              await relaunch();
            } catch (err) {
              console.error('更新失败:', err);
              message.error(`更新失败: ${err}`);
            } finally {
              setUpdating(false);
              setUpdateProgress(null);
            }
          }
        });
      } else {
        message.success('当前已是最新版本');
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      message.error(`检查更新失败: ${error}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 头部 */}
      <Header 
        style={{ 
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Space>
          <Tooltip title="返回主页">
            <Button 
              type="text" 
              icon={<ArrowLeftOutlined />}
              onClick={handleBack}
            >
              返回
            </Button>
          </Tooltip>
          <SettingOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          <Title level={3} style={{ margin: 0 }}>
            设置
          </Title>
        </Space>
      </Header>

      {/* 主要内容区域 */}
      <Content style={{ padding: '24px', background: token.colorBgLayout }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Card>
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
              {
                key: 'basic',
                label: '基础设置',
                children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Title level={4}>主题设置</Title>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text>深色模式</Text>
                    <Switch
                      checked={settings.isDarkMode}
                      onChange={(checked) => {
                        setSettings(prev => ({ ...prev, isDarkMode: checked }));
                        handleSaveTheme(checked);
                      }}
                      checkedChildren="开启"
                      unCheckedChildren="关闭"
                    />
                  </div>

                  <Divider />

                  <Title level={4}>应用信息</Title>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Text strong>应用名称</Text>
                      <div>
                        <Text type="secondary">数据库模型设计器</Text>
                      </div>
                    </Col>
                    <Col span={12}>
                      <Text strong>版本</Text>
                      <div>
                        <Text type="secondary">{appVersion || '加载中...'}</Text>
                      </div>
                    </Col>
                  </Row>

                  <Divider />

                  <Title level={4}>版本更新</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Button
                        type="primary"
                        icon={checkingUpdate ? <SyncOutlined spin /> : <CheckCircleOutlined />}
                        onClick={handleCheckUpdate}
                        loading={checkingUpdate}
                        disabled={updating}
                      >
                        检查更新
                      </Button>
                      {updating && <Text type="secondary">正在下载更新...</Text>}
                    </div>
                    {updateProgress !== null && (
                      <Progress percent={updateProgress} status={updateProgress < 100 ? 'active' : 'success'} />
                    )}
                  </Space>
                </Space>
                )
              },
              {
                key: 'git',
                label: 'Git配置',
                children: (
                <Form
                  form={gitForm}
                  layout="vertical"
                  onFinish={handleSaveGitConfig}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Title level={4}>Git仓库配置</Title>

                    <Form.Item
                      name="platform"
                      label="Git平台"
                      rules={[{ required: true, message: '请选择Git平台' }]}
                    >
                      <Select placeholder="请选择Git平台">
                        <Option value="github">GitHub</Option>
                        <Option value="gitlab">GitLab</Option>
                        <Option value="gitee">Gitee</Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      name="token"
                      label="访问令牌"
                      rules={[{ required: true, message: '请输入访问令牌' }]}
                    >
                      <Input.Password
                        placeholder="请输入Git访问令牌"
                      />
                    </Form.Item>

                    <Form.Item noStyle dependencies={['platform']}>
                      {({ getFieldValue }) => {
                        const platform = getFieldValue('platform') || 'github';
                        const placeholderMap: Record<string, string> = {
                          github: '例如：octocat/my-repo',
                          gitlab: '例如：myuser/my-project',
                          gitee: '例如：myuser/my-repo',
                        };
                        const extraMap: Record<string, string> = {
                          github: '格式：用户名/仓库名，如 octocat/hello-world',
                          gitlab: '格式：用户名/仓库名，如 myuser/my-project',
                          gitee: '格式：用户名/仓库名，如 myuser/my-repo',
                        };
                        return (
                          <Form.Item
                            name="repositoryName"
                            label="仓库名称"
                            rules={[{ required: true, message: '请输入仓库名称' }]}
                            extra={extraMap[platform]}
                          >
                            <Input placeholder={placeholderMap[platform]} />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>

                    <Form.Item>
                      <Space>
                        <Button
                          type="primary"
                          htmlType="submit"
                          loading={loading}
                          icon={<SaveOutlined />}
                        >
                          保存配置
                        </Button>
                        <Button
                          type="default"
                          icon={<CodeOutlined />}
                          onClick={handleInitGitRepository}
                          disabled={!gitConfigSaved}
                        >
                          初始化仓库
                        </Button>
                      </Space>
                    </Form.Item>
                  </Space>
                </Form>
                )
              },
              {
                key: 'database',
                label: '数据库连接',
                children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Title level={4} style={{ margin: 0 }}>数据库连接配置</Title>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={handleAddDatabaseConnection}
                    >
                      添加连接
                    </Button>
                  </div>

                  <List
                    dataSource={dbConnections}
                    locale={{
                      emptyText: (
                        <div style={{ textAlign: 'center', padding: 40 }}>
                          <Text type="secondary">暂无数据库连接配置，点击上方按钮添加</Text>
                        </div>
                      )
                    }}
                    renderItem={(connection) => (
                      <List.Item
                        actions={[
                          <Button
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => handleEditDatabaseConnection(connection)}
                          >
                            编辑
                          </Button>,
                          <Popconfirm
                            title="确定要删除这个数据库连接配置吗？"
                            onConfirm={() => handleDeleteDatabaseConnection(connection.id)}
                            okText="确定"
                            cancelText="取消"
                          >
                            <Button
                              type="link"
                              danger
                              icon={<DeleteOutlined />}
                            >
                              删除
                            </Button>
                          </Popconfirm>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text strong>{connection.name}</Text>
                              <Tag color={connection.type === 'mysql' ? 'green' : 'purple'}>
                                {connection.type === 'mysql' ? 'MySQL' : 'PostgreSQL'}
                              </Tag>
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size={0}>
                              <Text type="secondary">
                                {connection.host}:{connection.port} / {connection.database}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                用户: {connection.username}
                              </Text>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </Space>
                )
              },
              {
                key: 'ai',
                label: 'AI配置',
                children: (
                <Form
                  form={aiForm}
                  layout="vertical"
                  onFinish={handleSaveAiConfig}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Title level={4}>AI配置</Title>
                    <Text type="secondary">
                      兼容所有 OpenAI 格式的 API（通义千问、Deepseek、文心等均可使用）
                    </Text>

                    <Form.Item
                      name="ai_base_url"
                      label="API 地址"
                      rules={[{ required: true, message: '请输入API地址' }]}
                    >
                      <Input placeholder="https://api.openai.com" />
                    </Form.Item>

                    <Form.Item
                      name="ai_api_key"
                      label="API Key"
                      rules={[{ required: true, message: '请输入API Key' }]}
                    >
                      <Input.Password placeholder="请输入API Key" />
                    </Form.Item>

                    <Form.Item
                      name="ai_model"
                      label="模型名称"
                      rules={[{ required: true, message: '请输入模型名称' }]}
                    >
                      <Input placeholder="gpt-4o" />
                    </Form.Item>

                    <Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        icon={<SaveOutlined />}
                      >
                        保存配置
                      </Button>
                    </Form.Item>
                  </Space>
                </Form>
                )
              }
            ]} />
          </Card>
        </div>
      </Content>

      {/* 数据库连接配置弹框 */}
      <Drawer
        title={editingConnection ? '编辑数据库连接' : '添加数据库连接'}
        open={isDbModalVisible}
        onClose={() => {
          setIsDbModalVisible(false);
          dbForm.resetFields();
          setEditingConnection(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={dbForm}
          layout="vertical"
          onFinish={handleSaveDatabaseConnection}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="连接名称"
                rules={[{ required: true, message: '请输入连接名称' }]}
              >
                <Input placeholder="请输入连接名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label="数据库类型"
                rules={[{ required: true, message: '请选择数据库类型' }]}
              >
                <Select placeholder="请选择数据库类型">
                  <Option value="mysql">MySQL</Option>
                  <Option value="postgresql">PostgreSQL</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="host"
                label="主机地址"
                rules={[{ required: true, message: '请输入主机地址' }]}
              >
                <Input placeholder="请输入主机地址" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="port"
                label="端口"
                rules={[{ required: true, message: '请输入端口' }]}
              >
                <Input type="number" placeholder="请输入端口" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="password"
                label="密码"
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="database"
            label="数据库名"
            rules={[{ required: true, message: '请输入数据库名' }]}
          >
            <Input placeholder="请输入数据库名" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit"
                loading={loading}
                icon={<SaveOutlined />}
              >
                {editingConnection ? '更新' : '创建'}
              </Button>
              <Button 
                onClick={() => {
                  setIsDbModalVisible(false);
                  dbForm.resetFields();
                  setEditingConnection(null);
                }}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </Layout>
  );
};

export default Setting;
