import {
  DatabaseOutlined,
  DownloadOutlined,
  PlusOutlined,
  SettingOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Avatar,
  Button,
  Card,
  Form,
  Input,
  Layout,
  List,
  Drawer,
  Modal,
  Popconfirm,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  theme
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { translateBackendMessage } from '../../i18n/backend-messages';
import { useTheme } from '../../store/theme-context';
import type { Project } from '../../types';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;

/**
 * 主页面组件
 */
const Main: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [pullModalVisible, setPullModalVisible] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [gitConfigSaved, setGitConfigSaved] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
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
      
      // 检查Git配置
      await checkGitConfig();
      
      // 检查应用更新
      await checkForUpdates();
    } catch (error) {
      console.error(t('main_init_fail'), error);
      message.error(t('main_init_fail'));
    }
  };

  /**
   * 检查Git配置状态
   */
  const checkGitConfig = async () => {
    try {
      const settings = await invoke<{ [key: string]: string }>('get_local_settings');
      const remoteMode = settings['git_remote_mode'] || (settings['git_remote_url'] ? 'custom' : 'preset');
      const authType = settings['git_auth_type'] || (settings['git_token'] ? 'token' : 'ssh');
      const platform = settings['git_platform'] || 'github';
      const repository = settings['git_repository'] || '';
      const baseUrl = settings['git_base_url'] || '';
      const remoteUrl = settings['git_remote_url'] || '';
      const username = settings['git_username'] || '';
      const token = settings['git_token'] || '';

      const hasRemote = remoteMode === 'custom'
        ? (authType === 'ssh' ? /^(git@|ssh:\/\/)/.test(remoteUrl) : /^https?:\/\//.test(remoteUrl))
        : !!repository && (platform !== 'gitea' || /^https?:\/\//.test(baseUrl));

      const hasAuth = authType === 'ssh'
        ? true
        : !!token && (remoteMode !== 'custom' ? (platform !== 'gitea' || !!username) : !!username);

      setGitConfigSaved(hasRemote && hasAuth);
    } catch (error) {
      console.error('checkGitConfig failed:', error);
      setGitConfigSaved(false);
    }
  };

  /**
   * 检查应用更新
   */
  const checkForUpdates = async () => {
    setUpdateLoading(true);
    try {
      const update = await check();
      if (update) {
        setUpdateAvailable(update);
      }
    } catch (error) {
      console.error('checkForUpdates failed:', error);
    } finally {
      setUpdateLoading(false);
    }
  };

  /**
   * 下载并安装更新
   */
  const handleInstallUpdate = async () => {
    if (!updateAvailable) return;
    try {
      await updateAvailable.downloadAndInstall();
      message.success(t('basic_update_done'));
      await relaunch();
    } catch (error) {
      console.error('installUpdate failed:', error);
      message.error(`${t('update_fail')}: ${error}`);
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
      console.error(t('main_load_projects_fail'), error);
      message.error(t('main_load_projects_fail'));
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
      };
      await invoke('create_project', { project: projectData });
      message.success(t('main_create_success'));
      setIsModalVisible(false);
      form.resetFields();
      await loadProjects();
    } catch (error) {
      console.error(t('main_create_fail'), error);
      message.error(t('main_create_fail'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 打开同步弹窗
   */
  const handleSync = () => {
    setCommitMessage('');
    setSyncModalVisible(true);
  };

  /**
   * 执行Git同步
   */
  const handleConfirmSync = async () => {
    setSyncLoading(true);
    try {
      const result = await invoke<string>('sync_git_repository', {
        commitMessage: commitMessage || 'Auto sync: database changes'
      });
      message.success(translateBackendMessage(result));
      setSyncModalVisible(false);
    } catch (error) {
      console.error(t('main_sync_fail'), error);
      message.error(`${t('main_sync_fail')}: ${error}`);
    } finally {
      setSyncLoading(false);
    }
  };

  /**
   * 打开拉取确认弹窗
   */
  const handlePull = () => {
    setPullModalVisible(true);
  };

  /**
   * 执行Git拉取
   */
  const handleConfirmPull = async () => {
    setPullLoading(true);
    try {
      const result = await invoke<string>('pull_git_repository');
      message.success(translateBackendMessage(result));
      setPullModalVisible(false);
    } catch (error) {
      console.error(t('main_pull_fail'), error);
      message.error(`${t('main_pull_fail')}: ${error}`);
    } finally {
      setPullLoading(false);
    }
  };

  /**
   * 删除项目
   */
  const handleDeleteProject = async (projectId: number) => {
    try {
      await invoke('delete_project', { id: projectId });
      message.success(t('main_delete_success'));
      await loadProjects();
    } catch (error) {
      console.error(t('main_delete_fail'), error);
      message.error(t('main_delete_fail'));
    }
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN', {
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
              {t('app_title')}
            </Title>
          </Space>
          
          <Space>
            {gitConfigSaved && (
              <>
                <Tooltip title={t('main_pull_data')}>
                  <Button
                    type="text"
                    icon={<DownloadOutlined />}
                    onClick={handlePull}
                  >
                    {t('main_pull')}
                  </Button>
                </Tooltip>
                <Tooltip title={t('main_sync_data')}>
                  <Button
                    type="text"
                    icon={<SyncOutlined />}
                    onClick={handleSync}
                  >
                    {t('main_sync')}
                  </Button>
                </Tooltip>
              </>
            )}
            {updateAvailable && (
              <Tooltip title={t('main_new_version_found', { version: updateAvailable.version })}>
                <Button
                  type="primary"
                  onClick={handleInstallUpdate}
                  loading={updateLoading}
                >
                  {t('main_new_version')}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={t('main_settings')}>
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => navigate('/setting')}
              >
                {t('main_settings')}
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
                    {t('main_project_list')}
                  </Title>
                  <Text type="secondary">
                    {t('main_total_projects', { count: projects.length })}
                  </Text>
                </Space>
                
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  onClick={() => setIsModalVisible(true)}
                >
                  {t('main_new_project')}
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
                        {t('main_view_detail')}
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title={t('main_confirm_delete_project')}
                        description={t('main_delete_project_desc')}
                        onConfirm={() => handleDeleteProject(project.id)}
                        okText={t('confirm')}
                        cancelText={t('cancel')}
                      >
                        <Button type="link" danger>{t('delete')}</Button>
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
                          <Tag color="blue">{t('main_project')}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">
                            {project.description || t('main_no_description')}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {t('main_created_at', { date: formatDate(project.created_at) })}
                          </Text>
                          {/*<Text type="secondary" style={{ fontSize: 12 }}>*/}
                          {/*  更新于: {formatDate(project.updated_at)}*/}
                          {/*</Text>*/}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
                locale={{
                  emptyText: (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <DatabaseOutlined style={{ fontSize: 48, color: token.colorTextDisabled, marginBottom: 16 }} />
                      <div style={{ color: token.colorTextDisabled }}>{t('main_empty')}</div>
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
          title={t('main_create_project')}
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
              label={t('main_project_name')}
              rules={[{ required: true, message: t('main_project_name_required') }]}
            >
              <Input placeholder={t('main_project_name_required')} />
            </Form.Item>
            
            <Form.Item
              name="description"
              label={t('main_project_desc')}
            >
              <Input.TextArea 
                placeholder={t('main_project_desc_placeholder')} 
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
                  {t('create')}
                </Button>
                <Button 
                  onClick={() => {
                    setIsModalVisible(false);
                    form.resetFields();
                  }}
                >
                  {t('cancel')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Drawer>

        {/* 同步提交信息弹窗 */}
        <Modal
          title={t('main_git_sync')}
          open={syncModalVisible}
          onOk={handleConfirmSync}
          onCancel={() => setSyncModalVisible(false)}
          confirmLoading={syncLoading}
          okText={t('main_sync')}
          cancelText={t('cancel')}
        >
          <div style={{ marginBottom: 8 }}>
            <Text type="warning" strong>{t('main_git_sync_warning')}</Text>
            <br/>
            <Text type="secondary">{t('main_git_commit_msg')}</Text>
          </div>
          <Input.TextArea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Auto sync: database changes"
            rows={3}
          />
        </Modal>

        {/* 拉取确认弹窗 */}
        <Modal
          title={t('main_git_pull')}
          open={pullModalVisible}
          onOk={handleConfirmPull}
          onCancel={() => setPullModalVisible(false)}
          confirmLoading={pullLoading}
          okText={t('main_git_pull_confirm')}
          cancelText={t('cancel')}
          okButtonProps={{ danger: true }}
        >
          <div>
            <Text type="warning" strong>{t('main_git_pull_warning')}</Text>
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">
                {t('main_git_pull_desc')}
              </Text>
            </div>
          </div>
        </Modal>
      </Layout>
  );
};

export default Main;
