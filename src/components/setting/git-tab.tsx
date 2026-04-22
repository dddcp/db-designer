import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { translateBackendMessage } from '../../i18n/backend-messages';
import {
  Button,
  Form,
  Input,
  message,
  Popconfirm,
  Radio,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  CodeOutlined,
  SaveOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { GitAuthType, GitPlatform, GitRemoteMode } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

interface GitFormValues {
  remoteMode: GitRemoteMode;
  platform: GitPlatform;
  baseUrl?: string;
  repository: string;
  remoteUrl?: string;
  authType: GitAuthType;
  username?: string;
  token?: string;
}

const GIT_SETTING_KEYS = [
  'git_remote_mode',
  'git_platform',
  'git_base_url',
  'git_repository',
  'git_remote_url',
  'git_auth_type',
  'git_username',
  'git_token',
] as const;

const GitTab: React.FC = () => {
  const { t } = useTranslation();
  const [gitForm] = Form.useForm<GitFormValues>();
  const [loading, setLoading] = useState(false);
  const [gitConfigSaved, setGitConfigSaved] = useState(false);

  useEffect(() => {
    loadGitConfig();
  }, []);

  const isGitConfigComplete = (values: Partial<GitFormValues>) => {
    const remoteMode = values.remoteMode || 'preset';
    const authType = values.authType || 'token';
    const platform = values.platform || 'github';
    const repository = values.repository?.trim() || '';
    const baseUrl = values.baseUrl?.trim() || '';
    const remoteUrl = values.remoteUrl?.trim() || '';
    const username = values.username?.trim() || '';
    const token = values.token?.trim() || '';

    const remoteValid = remoteMode === 'preset'
      ? !!repository && (platform !== 'gitea' || /^https?:\/\//.test(baseUrl))
      : authType === 'ssh'
        ? /^(git@|ssh:\/\/)/.test(remoteUrl)
        : /^https?:\/\//.test(remoteUrl);

    const authValid = authType === 'ssh'
      ? true
      : !!token && (remoteMode === 'custom' || platform !== 'gitea' || !!username);

    return remoteValid && authValid;
  };

  const loadGitConfig = async () => {
    try {
      const settings = await invoke<{ [key: string]: string }>('get_local_settings');
      const remoteMode = (settings['git_remote_mode'] || (settings['git_remote_url'] ? 'custom' : 'preset')) as GitRemoteMode;
      const platform = (settings['git_platform'] || 'github') as GitPlatform;
      const authType = (settings['git_auth_type'] || (settings['git_token'] ? 'token' : 'ssh')) as GitAuthType;
      const repository = settings['git_repository'] || '';
      const baseUrl = settings['git_base_url'] || '';
      const remoteUrl = settings['git_remote_url'] || '';
      const username = settings['git_username'] || '';
      const token = settings['git_token'] || '';

      const nextValues: GitFormValues = {
        remoteMode,
        platform,
        authType,
        repository,
        baseUrl,
        remoteUrl,
        username,
        token,
      };

      gitForm.setFieldsValue(nextValues);
      setGitConfigSaved(isGitConfigComplete(nextValues));
    } catch (error) {
      console.error(t('git_config_load_fail'), error);
    }
  };

  const persistGitConfig = async (values: GitFormValues) => {
    const normalizedValues: Record<string, string> = {
      git_remote_mode: values.remoteMode,
      git_platform: values.remoteMode === 'preset' ? values.platform : '',
      git_base_url: values.remoteMode === 'preset' && values.platform === 'gitea' ? (values.baseUrl || '').trim() : '',
      git_repository: values.remoteMode === 'preset' ? values.repository.trim() : '',
      git_remote_url: values.remoteMode === 'custom' ? (values.remoteUrl || '').trim() : '',
      git_auth_type: values.authType,
      git_username: values.authType === 'token' ? (values.username || '').trim() : '',
      git_token: values.authType === 'token' ? (values.token || '').trim() : '',
    };

    for (const [key, value] of Object.entries(normalizedValues)) {
      await invoke('save_local_setting', { key, value });
    }
  };

  const handleSaveGitConfig = async (values: GitFormValues) => {
    setLoading(true);
    try {
      await persistGitConfig(values);
      message.success(t('git_save_success'));
      setGitConfigSaved(isGitConfigComplete(values));
    } catch (error) {
      console.error(t('git_save_fail'), error);
      message.error(`${t('git_save_fail')}: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInitGitRepository = async () => {
    setLoading(true);
    try {
      const values = await gitForm.validateFields();
      await persistGitConfig(values);
      setGitConfigSaved(isGitConfigComplete(values));
      const result = await invoke<string>('init_git_repository');
      message.success(translateBackendMessage(result));
    } catch (error) {
      console.error(t('git_init_repo_fail'), error);
      message.error(`${t('git_init_fail')}: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearGitConfig = async () => {
    setLoading(true);
    try {
      for (const key of GIT_SETTING_KEYS) {
        await invoke('delete_local_setting', { key });
      }
      gitForm.setFieldsValue({
        remoteMode: 'preset',
        platform: 'github',
        authType: 'token',
        repository: '',
        baseUrl: '',
        remoteUrl: '',
        username: '',
        token: '',
      });
      setGitConfigSaved(false);
      message.success(t('git_config_cleared'));
    } catch (error) {
      console.error(t('git_clear_fail'), error);
      message.error(t('git_clear_fail'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form
      form={gitForm}
      layout="vertical"
      onFinish={handleSaveGitConfig}
      initialValues={{
        remoteMode: 'preset',
        platform: 'github',
        authType: 'token',
        repository: '',
      }}
      onValuesChange={(_, allValues) => setGitConfigSaved(isGitConfigComplete(allValues))}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>{t('git_config_title')}</Title>

        <Form.Item
          name="remoteMode"
          label={t('git_remote_mode')}
          rules={[{ required: true, message: t('git_remote_mode_required') }]}
        >
          <Radio.Group>
            <Radio.Button value="preset">{t('git_preset')}</Radio.Button>
            <Radio.Button value="custom">{t('git_custom_url')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item noStyle dependencies={['remoteMode', 'platform']}>
          {({ getFieldValue }) => {
            const remoteMode = getFieldValue('remoteMode') || 'preset';
            const platform = getFieldValue('platform') || 'github';

            if (remoteMode === 'preset') {
              return (
                <>
                  <Form.Item
                    name="platform"
                    label={t('git_platform')}
                    rules={[{ required: true, message: t('git_platform_required') }]}
                  >
                    <Select placeholder={t('git_platform_placeholder')}>
                      <Option value="github">GitHub</Option>
                      <Option value="gitlab">GitLab</Option>
                      <Option value="gitee">Gitee</Option>
                      <Option value="gitea">Gitea</Option>
                    </Select>
                  </Form.Item>

                  {platform === 'gitea' && (
                    <Form.Item
                      name="baseUrl"
                      label={t('git_base_url')}
                      rules={[
                        { required: true, message: t('git_base_url_required') },
                        { pattern: /^https?:\/\//, message: t('git_base_url_invalid') },
                      ]}
                    >
                      <Input placeholder={t('git_base_url_placeholder')} />
                    </Form.Item>
                  )}

                  <Form.Item
                    name="repository"
                    label={t('git_repository')}
                    rules={[
                      { required: true, message: t('git_repository_required') },
                      { pattern: /^[^/\s]+\/[^/\s]+$/, message: t('git_repository_invalid') },
                    ]}
                    extra={t('git_repository_extra')}
                  >
                    <Input placeholder={t('git_repository_placeholder')} />
                  </Form.Item>
                </>
              );
            }

            return (
              <Form.Item
                name="remoteUrl"
                label={t('git_remote_url')}
                rules={[
                  { required: true, message: t('git_remote_url_required') },
                  () => ({
                    validator(_, value) {
                      const authType = getFieldValue('authType') || 'token';
                      const input = (value || '').trim();
                      if (!input) {
                        return Promise.resolve();
                      }
                      if (authType === 'ssh') {
                        return /^(git@|ssh:\/\/)/.test(input)
                          ? Promise.resolve()
                          : Promise.reject(new Error(t('git_ssh_url_error')));
                      }
                      return /^https?:\/\//.test(input)
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('git_token_url_error')));
                    },
                  }),
                ]}
              >
                <Input placeholder={t('git_remote_url_placeholder')} />
              </Form.Item>
            );
          }}
        </Form.Item>

        <Form.Item
          name="authType"
          label={t('git_auth_type')}
          rules={[{ required: true, message: t('git_auth_type_required') }]}
        >
          <Radio.Group>
            <Radio.Button value="token">Token</Radio.Button>
            <Radio.Button value="ssh">SSH</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item noStyle dependencies={['authType', 'remoteMode', 'platform']}>
          {({ getFieldValue }) => {
            const authType = getFieldValue('authType') || 'token';
            const remoteMode = getFieldValue('remoteMode') || 'preset';
            const platform = getFieldValue('platform') || 'github';
            const showUsername = authType === 'token' && (remoteMode === 'custom' || platform === 'gitea');

            if (authType === 'ssh') {
              return (
                <Form.Item>
                  <Text type="secondary">{t('git_ssh_mode_tip')}</Text>
                </Form.Item>
              );
            }

            return (
              <>
                {showUsername && (
                  <Form.Item
                    name="username"
                    label={t('git_username')}
                    rules={[{ required: true, message: t('git_username_placeholder') }]}
                    extra={remoteMode === 'custom' ? t('git_username_custom_tip') : t('git_username_gitea_tip')}
                  >
                    <Input placeholder={t('git_username_placeholder')} />
                  </Form.Item>
                )}

                <Form.Item
                  name="token"
                  label={t('git_token')}
                  rules={[{ required: true, message: t('git_token_required') }]}
                >
                  <Input.Password placeholder={t('git_token_placeholder')} />
                </Form.Item>
              </>
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
              {t('git_save_config')}
            </Button>
            <Button
              type="default"
              icon={<CodeOutlined />}
              onClick={handleInitGitRepository}
              disabled={!gitConfigSaved}
            >
              {t('git_init_repo')}
            </Button>
            <Popconfirm
              title={t('git_clear_confirm')}
              description={t('git_clear_desc')}
              onConfirm={handleClearGitConfig}
              okText={t('confirm')}
              cancelText={t('cancel')}
            >
              <Button
                type="default"
                danger
                icon={<DeleteOutlined />}
                disabled={!gitConfigSaved}
              >
                {t('git_clear_config')}
              </Button>
            </Popconfirm>
          </Space>
        </Form.Item>
      </Space>
    </Form>
  );
};

export default GitTab;