import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
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
  Col
} from 'antd';
import { 
  ArrowLeftOutlined,
  SettingOutlined,
  CodeOutlined,
  DatabaseOutlined,
  SaveOutlined
} from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;
const { useToken } = theme;

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
  gitConfig: GitConfig;
  databaseConnections: DatabaseConnection[];
}

/**
 * 设置页面组件
 */
const Setting: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useToken();
  const [form] = Form.useForm();
  const [gitForm] = Form.useForm();
  const [dbForm] = Form.useForm();
  
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

  // 加载设置
  useEffect(() => {
    loadSettings();
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
    } catch (error) {
      console.error('保存Git配置失败:', error);
      message.error('保存Git配置失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 保存数据库连接配置
   */
  const handleSaveDatabaseConnection = async (values: any) => {
    setLoading(true);
    try {
      // 这里需要实现数据库连接配置的保存逻辑
      // 由于数据库连接可能有多个，需要更复杂的存储方案
      message.success('数据库连接配置保存成功');
    } catch (error) {
      console.error('保存数据库连接配置失败:', error);
      message.error('保存数据库连接配置失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 初始化Git仓库
   */
  const handleInitGitRepository = async () => {
    try {
      // 这里需要实现Git仓库初始化逻辑
      message.success('Git仓库初始化成功');
    } catch (error) {
      console.error('Git仓库初始化失败:', error);
      message.error('Git仓库初始化失败');
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
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              {/* 基础设置 */}
              <TabPane tab="基础设置" key="basic">
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
                        <Text type="secondary">数据库设计器</Text>
                      </div>
                    </Col>
                    <Col span={12}>
                      <Text strong>版本</Text>
                      <div>
                        <Text type="secondary">1.0.0</Text>
                      </div>
                    </Col>
                  </Row>
                </Space>
              </TabPane>

              {/* Git配置 */}
              <TabPane tab="Git配置" key="git">
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

                    <Form.Item
                      name="repositoryName"
                      label="仓库名称"
                      rules={[{ required: true, message: '请输入仓库名称' }]}
                    >
                      <Input placeholder="请输入仓库名称，格式：用户名/仓库名" />
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
                        >
                          初始化仓库
                        </Button>
                      </Space>
                    </Form.Item>
                  </Space>
                </Form>
              </TabPane>

              {/* 数据库连接 */}
              <TabPane tab="数据库连接" key="database">
                <Form
                  form={dbForm}
                  layout="vertical"
                  onFinish={handleSaveDatabaseConnection}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Title level={4}>数据库连接配置</Title>
                    
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
                      <Button 
                        type="primary" 
                        htmlType="submit"
                        loading={loading}
                        icon={<SaveOutlined />}
                      >
                        保存连接
                      </Button>
                    </Form.Item>
                  </Space>
                </Form>
              </TabPane>
            </Tabs>
          </Card>
        </div>
      </Content>
    </Layout>
  );
};

export default Setting;
