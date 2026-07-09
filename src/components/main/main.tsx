import {
  BulbOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  MoonOutlined,
  PlusOutlined,
  SettingOutlined,
  SunOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Button,
  Col,
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
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { translateBackendMessage } from '../../i18n/backend-messages';
import { useTheme } from '../../store/theme-context';
import { getThemedBg } from '../../theme/dark-colors';
import type { Project } from '../../types';
import styles from './main.module.css';

const { Content } = Layout;
const { Text } = Typography;

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
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [pullModalVisible, setPullModalVisible] = useState(false);
  const [pullLoading, setPullLoading] = useState(false);
  const [gitConfigSaved, setGitConfigSaved] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<any>(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();

  // 初始化数据库和加载数据
  useEffect(() => {
    initializeApp();
    getVersion().then((v) => setAppVersion(v)).catch(() => setAppVersion(''));
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
      closeProjectModal();
      await loadProjects();
    } catch (error) {
      console.error(t('main_create_fail'), error);
      message.error(t('main_create_fail'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 更新项目
   */
  const handleUpdateProject = async (values: { name: string; description?: string }) => {
    if (!editingProject) return;
    setLoading(true);
    try {
      const description = values.description?.trim() || null;
      const projectData = {
        id: editingProject.id,
        name: values.name,
        description,
      };
      await invoke('update_project', { project: projectData });
      message.success(t('main_update_success'));
      closeProjectModal();
      await loadProjects();
    } catch (error) {
      console.error(t('main_update_fail'), error);
      message.error(t('main_update_fail'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 关闭项目表单弹窗
   */
  const closeProjectModal = () => {
    setIsModalVisible(false);
    setEditingProject(null);
    form.resetFields();
  };

  /**
   * 提交项目表单（按 mode 分发到创建或更新）
   */
  const handleProjectModalFinish = (values: { name: string; description?: string }) => {
    if (modalMode === 'edit') {
      handleUpdateProject(values);
    } else {
      handleCreateProject(values);
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
   * 打开新建项目弹窗
   */
  const openCreateModal = () => {
    setModalMode('create');
    setEditingProject(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  /**
   * 切换深浅模式
   */
  const handleToggleTheme = () => {
    toggleTheme(!isDarkMode);
  };

  /**
   * 打开编辑项目弹窗
   */
  const openEditModal = (project: Project) => {
    setModalMode('edit');
    setEditingProject(project);
    form.setFieldsValue({
      name: project.name,
      description: project.description ?? '',
    });
    setIsModalVisible(true);
  };

  return (
    <Layout style={{ height: '100vh' }}>
      {/* 顶部 Aurora 风格导航条（已合并原 Hero Banner 内容） */}
      <div className={`${styles.header} ${isDarkMode ? styles.dark : ''}`}>
        <div className={styles.signatureLine} />

        {/* 左侧：品牌 + 版本/项目数副标识 */}
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <DatabaseOutlined />
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandTitle}>{t('app_title')}</span>
            <span className={styles.brandSubtitle}>v{appVersion}</span>
          </div>
        </div>

        {/* 中段：产品能力徽章（吸收自原 Hero Banner） */}
        <div className={styles.features}>
          <span className={styles.featurePill}>
            <span className={`${styles.featureDot} ${styles.dotVisual}`} />
            {t('main_hero_feature_visual')}
          </span>
          <span className={styles.featurePill}>
            <span className={`${styles.featureDot} ${styles.dotDialect}`} />
            {t('main_hero_feature_dialect')}
          </span>
          <span className={styles.featurePill}>
            <span className={`${styles.featureDot} ${styles.dotVersion}`} />
            {t('main_hero_feature_version')}
          </span>
          <span className={styles.featurePill}>
            <span className={`${styles.featureDot} ${styles.dotAi}`} />
            {t('main_hero_feature_ai')}
          </span>
        </div>

        {/* 右侧：主操作 + 工具图标 */}
        <div className={styles.actions}>
          <Button
            className={styles.createBtn}
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
          >
            {t('main_new_project')}
          </Button>

          <div className={styles.actionDivider} />

          {gitConfigSaved && (
            <>
              <Tooltip title={t('main_pull_data')}>
                <Button
                  className={styles.actionBtn}
                  type="text"
                  icon={<DownloadOutlined />}
                  onClick={handlePull}
                />
              </Tooltip>
              <Tooltip title={t('main_sync_data')}>
                <Button
                  className={styles.actionBtn}
                  type="text"
                  icon={<SyncOutlined />}
                  onClick={handleSync}
                />
              </Tooltip>
            </>
          )}

          {updateAvailable && (
            <Tooltip title={t('main_new_version_found', { version: updateAvailable.version })}>
              <Button
                className={styles.actionBtn}
                type="text"
                icon={<BulbOutlined style={{ color: '#faad14' }} />}
                onClick={handleInstallUpdate}
                loading={updateLoading}
              />
            </Tooltip>
          )}

          <Tooltip title={t('main_settings')}>
            <Button
              className={styles.actionBtn}
              type="text"
              icon={<SettingOutlined />}
              onClick={() => navigate('/setting')}
            />
          </Tooltip>

          <Tooltip title={isDarkMode ? t('basic_dark_on') : t('basic_dark_off')}>
            <Button
              className={styles.actionBtn}
              type="text"
              icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
              onClick={handleToggleTheme}
            />
          </Tooltip>
        </div>
      </div>

      {/* 主要内容区域 */}
      <Content
        className={isDarkMode ? 'theme-dark' : ''}
        style={{
          padding: '20px 24px',
          background: getThemedBg(isDarkMode, 'page'),
          overflow: 'auto'
        }}
      >
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {/* 章节标题（"+ 新建项目"已上移到顶栏，项目数保留在标题旁） */}
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <h2>{t('main_project_list')}</h2>
              <span className={styles.sectionCount}>
                {t('main_total_projects', { count: projects.length })}
              </span>
            </div>
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
                onClick={openCreateModal}
              >
                {t('main_new_project')}
              </Button>
            </div>
          ) : (
            <Row gutter={[16, 16]}>
              {projects.map((project) => {
                const [colorStart, colorEnd] = pickGradient(project.id);
                // 边框颜色与卡片自身配色保持一致
                const cardBorderStyle = {
                  '--project-card-border': colorStart,
                } as React.CSSProperties;
                return (
                  <Col xs={24} sm={12} md={12} lg={8} xl={8} xxl={6} key={project.id}>
                    <div
                      className={styles.projectCard}
                      onClick={() => handleProjectClick(project.id)}
                      style={cardBorderStyle}
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
                              {t('main_table_count', { count: project.table_count ?? 0 })}
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
                            <Tooltip title={t('main_view_detail')}>
                              <Button
                                type="text"
                                size="small"
                                className={styles.projectActionBtn}
                                icon={<EyeOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleProjectClick(project.id);
                                }}
                              />
                            </Tooltip>
                            <Tooltip title={t('main_edit')}>
                              <Button
                                type="text"
                                size="small"
                                className={styles.projectActionBtn}
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(project);
                                }}
                              />
                            </Tooltip>
                            <Popconfirm
                              title={t('main_confirm_delete_project')}
                              description={t('main_delete_project_desc')}
                              onConfirm={() => handleDeleteProject(project.id)}
                              onCancel={(e) => e?.stopPropagation()}
                              okText={t('confirm')}
                              cancelText={t('cancel')}
                            >
                              <Tooltip title={t('main_delete')}>
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  className={styles.projectActionBtn}
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </Tooltip>
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

      {/* 创建/编辑项目弹窗 */}
      <Modal
        title={modalMode === 'edit' ? t('main_edit_project') : t('main_create_project')}
        open={isModalVisible}
        onCancel={closeProjectModal}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleProjectModalFinish}
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
                {modalMode === 'edit' ? t('save') : t('create')}
              </Button>
              <Button onClick={closeProjectModal}>
                {t('cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

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