import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Form,
  Input,
  message,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  CodeOutlined,
  SaveOutlined,
} from '@ant-design/icons';

const { Title } = Typography;
const { Option } = Select;

const GitTab: React.FC = () => {
  const [gitForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [gitConfigSaved, setGitConfigSaved] = useState(false);

  useEffect(() => {
    loadGitConfig();
  }, []);

  const loadGitConfig = async () => {
    try {
      const settings = await invoke<{ [key: string]: string }>('get_all_settings');
      const gitPlatform = settings['git_platform'] || 'github';
      const gitToken = settings['git_token'] || '';
      const gitRepo = settings['git_repository'] || '';

      gitForm.setFieldsValue({
        platform: gitPlatform,
        token: gitToken,
        repositoryName: gitRepo,
      });

      if (gitToken && gitRepo) {
        setGitConfigSaved(true);
      }
    } catch (error) {
      console.error('加载Git配置失败:', error);
    }
  };

  const handleSaveGitConfig = async (values: any) => {
    setLoading(true);
    try {
      await invoke('save_setting', { key: 'git_platform', value: values.platform });
      await invoke('save_setting', { key: 'git_token', value: values.token });
      await invoke('save_setting', { key: 'git_repository', value: values.repositoryName });
      message.success('Git配置保存成功');
      setGitConfigSaved(true);
    } catch (error) {
      console.error('保存Git配置失败:', error);
      message.error('保存Git配置失败');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <Form form={gitForm} layout="vertical" onFinish={handleSaveGitConfig}>
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
          <Input.Password placeholder="请输入Git访问令牌" />
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
  );
};

export default GitTab;
