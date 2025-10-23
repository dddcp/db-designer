import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { 
  Layout, 
  Card, 
  Button, 
  Space, 
  Typography, 
  theme, 
  ConfigProvider, 
  List, 
  Avatar, 
  Tag,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tooltip,
  Divider
} from 'antd';
import { 
  SettingOutlined, 
  SyncOutlined, 
  PlusOutlined,
  CodeOutlined,
  DatabaseOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;

// 项目类型定义
interface Project {
  id: number;
  name: string;
  description?: string;
  database_type: string;
  created_at: string;
  updated_at: string;
}

// Git信息类型定义
interface GitInfo {
  branch: string;
  latest_commit: string;
}

// Git平台类型
type GitPlatform = 'github' | 'gitlab' | 'gitee';

// 数据库连接配置
interface DatabaseConnection {
  id: string;
  name: string;
  type: 'mysql' | 'postgresql';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

// Git配置
interface GitConfig {
  platform: GitPlatform;
  token: string;
  repositoryName: string;
  isInitialized: boolean;
}

// 设置项类型定义
interface Settings {
  isDarkMode: boolean;
  storagePath: string;
  gitConfig: GitConfig;
  databaseConnections: DatabaseConnection[];
}

/**
 * 主页面组件
 */
const Main: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  // 移除设置模态框状态
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { token } = useToken();
  const navigate = useNavigate();

  // 默认设置
  const [settings, setSettings] = useState<Settings>({
    isDarkMode: false,
    storagePath: './data', // 固定使用默认路径
    gitConfig: {
      platform: 'github',
      token: '',
      repositoryName: '',
      isInitialized: false
    },
    databaseConnections: []
  });

  // 初始化数据库和加载数据
  useEffect(() => {
    initializeApp();
  }, []);

  /**
   * 初始化应用
   */
  const initializeApp = async () => {
    try {
      // 初始化数据库
      await invoke('init_database');
      
      // 加载项目列表
      await loadProjects();
      
      // 加载Git信息
      await loadGitInfo();
    } catch (error) {
      console.error('初始化失败:', error);
      message.error('应用初始化失败');
    }
  };

  /**
   * 加载项目列表
   */
  const loadProjects = async () => {
    try {
      const result = await invoke<Project[]>('get_projects');
      setProjects(result);
    } catch (error) {
      console.error('加载项目失败:', error);
      message.error('加载项目列表失败');
    }
  };

  /**
   * 加载Git信息
   */
  const loadGitInfo = async () => {
    try {
      const result = await invoke<GitInfo>('get_git_info');
      setGitInfo(result);
    } catch (error) {
      console.error('加载Git信息失败:', error);
    }
  };

  /**
   * 创建新项目
   */
  const handleCreateProject = async (values: { name: string; description?: string; databaseType: 'mysql' | 'postgresql' }) => {
    setLoading(true);
    try {
      // 转换字段名以匹配后端期望的格式
      const projectData = {
        name: values.name,
        description: values.description,
        database_type: values.databaseType
      };
      await invoke('create_project', { project: projectData });
      message.success('项目创建成功');
      setIsModalVisible(false);
      form.resetFields();
      await loadProjects();
    } catch (error) {
      console.error('创建项目失败:', error);
      message.error('创建项目失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 同步数据
   */
  const handleSync = async () => {
    message.loading({ content: '同步中...', key: 'sync', duration: 0 });
    try {
      await loadProjects();
      await loadGitInfo();
      message.success({ content: '同步完成', key: 'sync' });
    } catch (error) {
      message.error({ content: '同步失败', key: 'sync' });
    }
  };

  // 移除设置变更处理函数

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  /**
   * 跳转到项目详情页面
   */
  const handleProjectClick = (projectId: number) => {
    navigate(`/project/${projectId}`);
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: settings.isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        {/* 头部 */}
        <Header 
          style={{ 
            background: settings.isDarkMode ? '#141414' : '#fff',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Space>
            <DatabaseOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
            <Title level={3} style={{ margin: 0, color: settings.isDarkMode ? '#fff' : '#000' }}>
              数据库设计器
            </Title>
          </Space>
          
          <Space>
            <Tooltip title="同步数据">
              <Button 
                type="text" 
                icon={<SyncOutlined />}
                onClick={handleSync}
              >
                同步
              </Button>
            </Tooltip>
            <Tooltip title="设置">
              <Button 
                type="text" 
                icon={<SettingOutlined />}
                onClick={() => navigate('/setting')}
              >
                设置
              </Button>
            </Tooltip>
          </Space>
        </Header>

        {/* 主要内容区域 */}
        <Content style={{ padding: '24px', background: settings.isDarkMode ? '#000' : '#f5f5f5' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            {/* 操作栏 */}
            <Card 
              style={{ marginBottom: 24 }}
              bodyStyle={{ padding: '16px 24px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Title level={4} style={{ margin: 0 }}>
                    项目列表
                  </Title>
                  <Text type="secondary">
                    共 {projects.length} 个项目
                  </Text>
                </Space>
                
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => setIsModalVisible(true)}
                >
                  新建项目
                </Button>
              </div>
            </Card>

            {/* 项目列表 */}
            <Card>
              <List
                dataSource={projects}
                renderItem={(project) => (
                  <List.Item
                    actions={[
                      <Button 
                        type="link" 
                        key="view"
                        onClick={() => handleProjectClick(project.id)}
                      >
                        查看详情
                      </Button>,
                      <Button type="link" danger key="delete">删除</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <Avatar 
                          style={{ backgroundColor: token.colorPrimary }}
                          icon={<DatabaseOutlined />}
                        />
                      }
                      title={
                        <Space>
                          <Text strong>{project.name}</Text>
                          <Tag color="blue">项目</Tag>
                          <Tag color={project.database_type === 'mysql' ? 'green' : 'purple'}>
                            {project.database_type === 'mysql' ? 'MySQL' : 'PostgreSQL'}
                          </Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">
                            {project.description || '暂无描述'}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            创建于: {formatDate(project.created_at)}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            更新于: {formatDate(project.updated_at)}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
                locale={{
                  emptyText: (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <DatabaseOutlined style={{ fontSize: 48, color: token.colorTextDisabled, marginBottom: 16 }} />
                      <div style={{ color: token.colorTextDisabled }}>暂无项目，点击上方按钮创建第一个项目</div>
                    </div>
                  )
                }}
              />
            </Card>
          </div>
        </Content>

        {/* 底部 */}
        <Footer style={{ 
          textAlign: 'center', 
          background: settings.isDarkMode ? '#141414' : '#fafafa',
          borderTop: `1px solid ${token.colorBorderSecondary}`,
          padding: '16px 24px'
        }}>
          <Space split={<Divider type="vertical" />}>
            <Text type="secondary">
              Database Designer ©2025
            </Text>
            {gitInfo && (
              <>
                <Space>
                  <CodeOutlined />
                  <Text type="secondary">分支: {gitInfo.branch || 'main'}</Text>
                </Space>
                <Text type="secondary" style={{ maxWidth: 300, textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  最新提交: {gitInfo.latest_commit}
                </Text>
              </>
            )}
          </Space>
        </Footer>

        {/* 移除设置模态框 */}

        {/* 创建项目模态框 */}
        <Modal
          title="创建新项目"
          open={isModalVisible}
          onCancel={() => {
            setIsModalVisible(false);
            form.resetFields();
          }}
          footer={null}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleCreateProject}
          >
            <Form.Item
              name="name"
              label="项目名称"
              rules={[{ required: true, message: '请输入项目名称' }]}
            >
              <Input placeholder="请输入项目名称" />
            </Form.Item>
            
            <Form.Item
              name="description"
              label="项目描述"
            >
              <Input.TextArea 
                placeholder="请输入项目描述（可选）" 
                rows={4}
              />
            </Form.Item>

            <Form.Item
              name="databaseType"
              label="数据库类型"
              rules={[{ required: true, message: '请选择数据库类型' }]}
            >
              <Select placeholder="请选择数据库类型">
                <Select.Option value="mysql">MySQL</Select.Option>
                <Select.Option value="postgresql">PostgreSQL</Select.Option>
              </Select>
            </Form.Item>
            
            <Form.Item>
              <Space>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                >
                  创建
                </Button>
                <Button 
                  onClick={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                  }}
                >
                  取消
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </Layout>
    </ConfigProvider>
  );
};

export default Main;
