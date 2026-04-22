import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Form,
  Input,
  message,
  Space,
  Typography,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

const AiTab: React.FC = () => {
  const { t } = useTranslation();
  const [aiForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAiConfig();
  }, []);

  const loadAiConfig = async () => {
    try {
      const settings = await invoke<{ [key: string]: string }>('get_local_settings');
      aiForm.setFieldsValue({
        ai_base_url: settings['ai_base_url'] || '',
        ai_api_key: settings['ai_api_key'] || '',
        ai_model: settings['ai_model'] || '',
        ai_design_common_prompt: settings['ai_design_common_prompt'] || '',
      });
    } catch (error) {
      console.error(t('ai_config_load_fail'), error);
    }
  };

  const handleSaveAiConfig = async (values: any) => {
    setLoading(true);
    try {
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

  return (
    <Form form={aiForm} layout="vertical" onFinish={handleSaveAiConfig}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>{t('ai_config_title')}</Title>
        <Text type="secondary">
          {t('ai_compat_tip')}
        </Text>

        <Form.Item name="ai_base_url" label={t('ai_base_url')} rules={[{ required: true, message: t('ai_base_url_required') }]}>
          <Input placeholder={t('ai_base_url_placeholder')} />
        </Form.Item>

        <Form.Item name="ai_api_key" label={t('ai_api_key')} rules={[{ required: true, message: t('ai_api_key_required') }]}>
          <Input.Password placeholder={t('ai_api_key_placeholder')} />
        </Form.Item>

        <Form.Item name="ai_model" label={t('ai_model')} rules={[{ required: true, message: t('ai_model_required') }]}>
          <Input placeholder={t('ai_model_placeholder')} />
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
          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            {t('ai_save_config')}
          </Button>
        </Form.Item>
      </Space>
    </Form>
  );
};

export default AiTab;