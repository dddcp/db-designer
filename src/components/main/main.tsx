import {
  ClockCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  PlusOutlined,
  RightOutlined,
  RocketOutlined,
  SettingOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Button,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Row,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { translateBackendMessage } from '../../i18n/backend-messages';
import { useTheme } from '../../store/theme-context';
import type { Project } from '../../types';
import styles from './main.module.css';

const { Header, Content } = Layout;
const { Text } = Typography;
const { useToken } = theme;

/** 项目卡片渐变色板（按 id 稳定取色） */
const CARD_GRADIENTS: [string, string][] = [
  ['#1677ff', '#0958d9'],
  ['#722ed1', '#531dab'],
  ['#13c2c2', '#08979c'],
  ['#52c41a', '#389e0d'],
  ['#fa8c16', '#d46b08'],
  ['#eb2f96', '#c41d7f'],
];

const pickGradient = (id: number): [string, string] => {
  const idx = Math.abs(id) % CARD_GRADIENTS.length;
  return CARD_GRADIENTS[idx];
};

const getInitial = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
};

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
      await invoke('init_database');
      await loadProjects();
      await checkGitConfig();
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

  /**
   * 打开新建项目抽屉
   */
  const handleOpenCreate = () => {
    setIsModalVisible(true);
  };

  return (
    <Layout style={{ height: '100vh' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={styles.brandLogo}>
            <DatabaseOutlined />
          </div>
          <Text
            strong
            style={{
              fontSize: 17,
              color: isDarkMode ? '#fff' : '#1f1f1f',
              letterSpacing: 0.3
            }}
          >
            {t('app_title')}
          </Text>
        </div>

        <Space size={4}>
          {gitConfigSaved && (
            <Space.Compact>
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
            </Space.Compact>
          )}
          {updateAvailable && (
            <>
              <Tooltip title={t('main_new_version_found', { version: updateAvailable.version })}>
                <Button
                  type="primary"
                  size="small"
                  onClick={handleInstallUpdate}
                  loading={updateLoading}
                >
                  {t('main_new_version')}
                </Button>
              </Tooltip>
              <Divider type="vertical" style={{ margin: '0 4px' }} />
            </>
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
      <Content
        className={isDarkMode ? 'theme-dark' : ''}
        style={{
          padding: '20px 24px',
          background: isDarkMode ? '#000' : '#f5f5f5',
          overflow: 'auto'
        }}
      >
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {/* Hero Banner */}
          <div className={`${styles.hero} ${isDarkMode ? styles.dark : ''}`}>
            <div className={`${styles.heroOrb} ${styles.heroOrb1}`} />
            <div className={`${styles.heroOrb} ${styles.heroOrb2}`} />
            <div className={`${styles.heroOrb} ${styles.heroOrb3}`} />

            <div className={styles.heroInner}>
              <div className={styles.heroText}>
                <div className={styles.heroBadge}>
                  <RocketOutlined />
                  <span>{t('main_hero_badge')}</span>
                </div>
                <p className={styles.heroSubtitle}>{t('main_hero_subtitle')}</p>

                <div className={styles.heroFeatures}>
                  <span className={styles.heroFeature}>{t('main_hero_feature_visual')}</span>
                  <span className={styles.heroFeature}>{t('main_hero_feature_dialect')}</span>
                  <span className={styles.heroFeature}>{t('main_hero_feature_version')}</span>
                  <span className={styles.heroFeature}>{t('main_hero_feature_ai')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 章节标题 */}
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <h2>{t('main_project_list')}</h2>
              <span className={styles.sectionCount}>
                {t('main_total_projects', { count: projects.length })}
              </span>
            </div>
            <Button
              className={styles.newButton}
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              {t('main_new_project')}
            </Button>
          </div>

          {/* 项目卡片网格 / 空状态 */}
          {projects.length === 0 ? (
            <div className={styles.emptyWrap}>
              <div className={styles.emptyIcon}>
                <DatabaseOutlined />
              </div>
              <p className={styles.emptyTitle}>{t('main_empty_title')}</p>
              <p className={styles.emptyHint}>{t('main_empty')}</p>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={handleOpenCreate}
              >
                {t('main_new_project')}
              </Button>
            </div>
          ) : (
            <Row gutter={[16, 16]}>
              {projects.map((project) => {
                const [colorStart, colorEnd] = pickGradient(project.id);
                return (
                  <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={6} key={project.id}>
                    <div
                      className={styles.projectCard}
                      onClick={() => handleProjectClick(project.id)}
                    >
                      <div
                        className={styles.projectCardStripe}
                        style={{ background: `linear-gradient(90deg, ${colorStart}, ${colorEnd})` }}
                      />
                      <div className={styles.projectCardBody}>
                        <div className={styles.projectCardHeader}>
                          <div
                            className={styles.projectAvatar}
                            style={{ background: `linear-gradient(135deg, ${colorStart}, ${colorEnd})` }}
                          >
                            {getInitial(project.name)}
                          </div>
                          <div className={styles.projectTitleArea}>
                            <div className={styles.projectTitle}>{project.name}</div>
                            <Tag
                              className={styles.projectTag}
                              color={colorStart}
                              bordered={false}
                            >
                              {t('main_project')}
                            </Tag>
                          </div>
                        </div>

                        <p className={styles.projectDescription}>
                          {project.description || t('main_no_description')}
                        </p>

                        <div className={styles.projectFooter}>
                          <span className={styles.projectDate}>
                            <ClockCircleOutlined />
                            <span>{formatDate(project.created_at)}</span>
                          </span>
                          <Space size={2} className={styles.projectActions} onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="text"
                              size="small"
                              className={styles.projectActionBtn}
                              icon={<RightOutlined />}
                              onClick={() => handleProjectClick(project.id)}
                            >
                              {t('main_view_detail')}
                            </Button>
                            <Popconfirm
                              title={t('main_confirm_delete_project')}
                              description={t('main_delete_project_desc')}
                              onConfirm={() => handleDeleteProject(project.id)}
                              onCancel={(e) => e?.stopPropagation()}
                              okText={t('confirm')}
                              cancelText={t('cancel')}
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                className={styles.projectActionBtn}
                                icon={<DeleteOutlined />}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Popconfirm>
                          </Space>
                        </div>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          )}
        </div>
      </Content>

      {/* 创建项目抽屉 */}
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