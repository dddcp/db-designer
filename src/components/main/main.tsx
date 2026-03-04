import {
  DatabaseOutlined,
  PlusOutlined,
  SettingOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Layout,
  List,
  Drawer,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  theme
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../store/theme-context';
import type { Project } from '../../types';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;

/**
 * 主页面组件
 */
const Main: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { token } = useToken();
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

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
   * 创建新项目
   */
  const handleCreateProject = async (values: { name: string; description?: string }) => {
    setLoading(true);
    try {
      const projectData = {
        name: values.name,
        description: values.description,
        database_type: 'mysql'
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
      message.success({ content: '同步完成', key: 'sync' });
    } catch (error) {
      message.error({ content: '同步失败', key: 'sync' });
    }
  };

  /**
   * 删除项目
   */
  const handleDeleteProject = async (projectId: number) => {
    try {
      await invoke('delete_project', { id: projectId });
      message.success('项目删除成功');
      await loadProjects();
    } catch (error) {
      console.error('删除项目失败:', error);
      message.error('删除项目失败');
    }
  };

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
      <Layout style={{ minHeight: '100vh' }}>
        {/* 头部 */}
        <Header 
          style={{ 
            background: isDarkMode ? '#141414' : '#fff',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Space>
            <DatabaseOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
            <Title level={3} style={{ margin: 0, color: isDarkMode ? '#fff' : '#000' }}>
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
        <Content style={{ padding: '24px', background: isDarkMode ? '#000' : '#f5f5f5' }}>
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
                      <Button type="link" key="view" onClick={() => handleProjectClick(project.id)}>
                        查看详情
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title="确定删除此项目吗？"
                        description="删除后将同时删除项目下的所有表和索引数据"
                        onConfirm={() => handleDeleteProject(project.id)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button type="link" danger>删除</Button>
                      </Popconfirm>,
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
    

        {/* 移除设置模态框 */}

        {/* 创建项目模态框 */}
        <Drawer
          title="创建新项目"
          open={isModalVisible}
          onClose={() => {
            setIsModalVisible(false);
            form.resetFields();
          }}
          footer={null}
          width={520}
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
        </Drawer>
      </Layout>
  );
};

export default Main;
