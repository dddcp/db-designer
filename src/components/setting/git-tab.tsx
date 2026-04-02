import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
      console.error('加载Git配置失败:', error);
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
      message.success('Git配置保存成功');
      setGitConfigSaved(isGitConfigComplete(values));
    } catch (error) {
      console.error('保存Git配置失败:', error);
      message.error(`保存Git配置失败: ${error}`);
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
      message.success(result);
    } catch (error) {
      console.error('Git仓库初始化失败:', error);
      message.error(`Git仓库初始化失败: ${error}`);
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
      message.success('Git配置已清除');
    } catch (error) {
      console.error('清除Git配置失败:', error);
      message.error('清除Git配置失败');
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
        <Title level={4}>Git仓库配置</Title>

        <Form.Item
          name="remoteMode"
          label="远程配置方式"
          rules={[{ required: true, message: '请选择远程配置方式' }]}
        >
          <Radio.Group>
            <Radio.Button value="preset">平台预设</Radio.Button>
            <Radio.Button value="custom">自定义远程地址</Radio.Button>
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
                    label="Git平台"
                    rules={[{ required: true, message: '请选择Git平台' }]}
                  >
                    <Select placeholder="请选择Git平台">
                      <Option value="github">GitHub</Option>
                      <Option value="gitlab">GitLab</Option>
                      <Option value="gitee">Gitee</Option>
                      <Option value="gitea">Gitea</Option>
                    </Select>
                  </Form.Item>

                  {platform === 'gitea' && (
                    <Form.Item
                      name="baseUrl"
                      label="Gitea服务地址"
                      rules={[
                        { required: true, message: '请输入Gitea服务地址' },
                        { pattern: /^https?:\/\//, message: 'Gitea服务地址必须以 http:// 或 https:// 开头' },
                      ]}
                    >
                      <Input placeholder="例如：http://git.example.com 或 https://git.example.com" />
                    </Form.Item>
                  )}

                  <Form.Item
                    name="repository"
                    label="仓库路径"
                    rules={[
                      { required: true, message: '请输入仓库路径' },
                      { pattern: /^[^/\s]+\/[^/\s]+$/, message: '仓库路径格式必须为 owner/repo' },
                    ]}
                    extra="格式：owner/repo，例如 octocat/hello-world"
                  >
                    <Input placeholder="例如：owner/repo" />
                  </Form.Item>
                </>
              );
            }

            return (
              <Form.Item
                name="remoteUrl"
                label="远程地址"
                rules={[
                  { required: true, message: '请输入远程地址' },
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
                          : Promise.reject(new Error('SSH 认证需要使用 git@ 或 ssh:// 地址'));
                      }
                      return /^https?:\/\//.test(input)
                        ? Promise.resolve()
                        : Promise.reject(new Error('Token 认证仅支持 HTTP/HTTPS 地址'));
                    },
                  }),
                ]}
              >
                <Input placeholder="例如：https://git.example.com/owner/repo.git 或 git@git.example.com:owner/repo.git" />
              </Form.Item>
            );
          }}
        </Form.Item>

        <Form.Item
          name="authType"
          label="认证方式"
          rules={[{ required: true, message: '请选择认证方式' }]}
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
                  <Text type="secondary">SSH 模式将使用系统 Git 的 SSH 配置与密钥。</Text>
                </Form.Item>
              );
            }

            return (
              <>
                {showUsername && (
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[{ required: true, message: '请输入用户名' }]}
                    extra={remoteMode === 'custom' ? '自定义远程在 Token 模式下需要提供用户名。' : 'Gitea Token 模式需要提供用户名。'}
                  >
                    <Input placeholder="请输入用户名" />
                  </Form.Item>
                )}

                <Form.Item
                  name="token"
                  label="访问令牌"
                  rules={[{ required: true, message: '请输入访问令牌' }]}
                >
                  <Input.Password placeholder="请输入Git访问令牌" />
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
            <Popconfirm
              title="确定要清除Git配置吗？"
              description="清除后将无法进行Git同步"
              onConfirm={handleClearGitConfig}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="default"
                danger
                icon={<DeleteOutlined />}
                disabled={!gitConfigSaved}
              >
                清除配置
              </Button>
            </Popconfirm>
          </Space>
        </Form.Item>
      </Space>
    </Form>
  );
};

export default GitTab;
