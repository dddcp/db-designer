import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  AutoComplete,
  Button,
  Form,
  Input,
  message,
  Select,
  Space,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { AI_PROVIDER_PRESETS, getPresetById } from '../../data/ai-providers';

const { Title, Text } = Typography;
const { Option } = Select;

const AiTab: React.FC = () => {
  const { t } = useTranslation();
  const [aiForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [providerId, setProviderId] = useState<string>('custom');

  useEffect(() => {
    loadAiConfig();
  }, []);

  const loadAiConfig = async () => {
    try {
      const settings = await invoke<{ [key: string]: string }>('get_local_settings');
      const savedProvider = settings['ai_provider'];
      setProviderId(savedProvider ?? 'custom');
      aiForm.setFieldsValue({
        ai_provider: savedProvider ?? 'custom',
        ai_base_url: settings['ai_base_url'] || '',
        ai_api_key: settings['ai_api_key'] || '',
        ai_model: settings['ai_model'] || '',
        ai_design_common_prompt: settings['ai_design_common_prompt'] || '',
      });
    } catch (error) {
      console.error(t('ai_config_load_fail'), error);
    }
  };

  const handleProviderChange = (nextId: string) => {
    setProviderId(nextId);
    const preset = getPresetById(nextId);
    if (nextId === 'custom') {
      aiForm.setFieldsValue({ ai_base_url: '' });
    } else {
      aiForm.setFieldsValue({ ai_base_url: preset.defaultBaseUrl });
    }
  };

  const handleGetModels = async () => {
    const values = aiForm.getFieldsValue(['ai_base_url', 'ai_api_key']) as {
      ai_base_url?: string;
      ai_api_key?: string;
    };
    if (!values.ai_base_url) {
      message.warning(t('ai_base_url_required'));
      return;
    }
    setFetchingModels(true);
    try {
      const list = await invoke<string[]>('ai_fetch_models', {
        baseUrl: values.ai_base_url,
        apiKey: values.ai_api_key ?? '',
      });
      setModels(list);
      message.success(t('ai_test_success_with_count', { count: list.length }));
    } catch (error: any) {
      setModels([]);
      message.error(t('ai_test_fail') + ': ' + (error?.message ?? String(error)));
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    const values = aiForm.getFieldsValue(['ai_base_url', 'ai_api_key', 'ai_model']) as {
      ai_base_url?: string;
      ai_api_key?: string;
      ai_model?: string;
    };
    if (!values.ai_base_url) {
      message.warning(t('ai_base_url_required'));
      return;
    }
    if (!values.ai_model) {
      message.warning(t('ai_model_required'));
      return;
    }
    setTesting(true);
    try {
      await invoke<string>('ai_chat', {
        baseUrl: values.ai_base_url,
        apiKey: values.ai_api_key ?? '',
        model: values.ai_model,
        messages: [{ role: 'user', content: 'hi' }],
      });
      message.success(t('ai_test_success'));
    } catch (error: any) {
      message.error(t('ai_test_fail') + ': ' + (error?.message ?? String(error)));
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAiConfig = async (values: any) => {
    setLoading(true);
    try {
      await invoke('save_local_setting', { key: 'ai_provider', value: values.ai_provider });
      await invoke('save_local_setting', { key: 'ai_base_url', value: values.ai_base_url });
      await invoke('save_local_setting', { key: 'ai_api_key', value: values.ai_api_key });
      await invoke('save_local_setting', { key: 'ai_model', value: values.ai_model });
      await invoke('save_local_setting', { key: 'ai_design_common_prompt', value: values.ai_design_common_prompt || '' });
      message.success(t('ai_save_success'));
    } catch (error) {
      console.error(t('ai_save_fail'), error);
      message.error(t('ai_save_fail'));
    } finally {
      setLoading(false);
    }
  };

  const currentPreset = getPresetById(providerId);
  const docs = currentPreset.docsUrl;

  return (
    <Form form={aiForm} layout="vertical" onFinish={handleSaveAiConfig}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>{t('ai_config_title')}</Title>
        <Text type="secondary">
          {t('ai_compat_tip')}
        </Text>

        <Form.Item name="ai_provider" label={t('ai_provider_label')} rules={[{ required: true, message: t('ai_provider_required') }]}>
          <Select onChange={handleProviderChange}>
            {AI_PROVIDER_PRESETS.map((p) => (
              <Option key={p.id} value={p.id}>{t(p.i18nKey)}</Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="ai_base_url" label={t('ai_base_url')} rules={[{ required: true, message: t('ai_base_url_required') }]}>
          <Input
            placeholder={providerId === 'custom' ? t('ai_base_url_placeholder_custom') : t('ai_base_url_placeholder')}
            addonAfter={
              docs ? (
                <a href={docs} target="_blank" rel="noopener noreferrer">{t('ai_get_api_key')}</a>
              ) : null
            }
          />
        </Form.Item>

        <Form.Item
          name="ai_api_key"
          label={t('ai_api_key')}
          rules={[{ required: true, message: t('ai_api_key_required') }]}
        >
          <Input.Password
            placeholder={t('ai_api_key_placeholder')}
            addonAfter={
              <Button
                type="link"
                size="small"
                icon={<ApiOutlined />}
                loading={fetchingModels}
                onClick={handleGetModels}
                style={{ padding: 0 }}
              >
                {t('ai_get_models')}
              </Button>
            }
          />
        </Form.Item>

        <Form.Item
          name="ai_model"
          label={t('ai_model')}
          rules={[{ required: true, message: t('ai_model_required') }]}
        >
          <AutoComplete
            placeholder={t('ai_model_placeholder')}
            options={models.map((m) => ({ value: m }))}
            allowClear
            filterOption={(input, option) =>
              (option?.value as string).toLowerCase().includes(input.toLowerCase())
            }
          />
        </Form.Item>

        <Form.Item name="ai_design_common_prompt" label={t('ai_common_prompt')}>
          <Input.TextArea
            rows={6}
            placeholder={t('ai_common_prompt_placeholder')}
          />
        </Form.Item>

        <Text type="secondary">
          {t('ai_common_prompt_desc')}
        </Text>

        <Form.Item>
          <Space>
            <Button
              type="link"
              icon={<ApiOutlined />}
              loading={testing}
              onClick={handleTestConnection}
            >
              {t('ai_test_connection')}
            </Button>
            <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
              {t('ai_save_config')}
            </Button>
          </Space>
        </Form.Item>
      </Space>
    </Form>
  );
};

export default AiTab;
