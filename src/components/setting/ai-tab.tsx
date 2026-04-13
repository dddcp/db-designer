import React, { useState, useEffect } from 'react';
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
      console.error('加载AI配置失败:', error);
    }
  };

  const handleSaveAiConfig = async (values: any) => {
    setLoading(true);
    try {
      await invoke('save_local_setting', { key: 'ai_base_url', value: values.ai_base_url });
      await invoke('save_local_setting', { key: 'ai_api_key', value: values.ai_api_key });
      await invoke('save_local_setting', { key: 'ai_model', value: values.ai_model });
      await invoke('save_local_setting', { key: 'ai_design_common_prompt', value: values.ai_design_common_prompt || '' });
      message.success('AI配置保存成功');
    } catch (error) {
      console.error('保存AI配置失败:', error);
      message.error('保存AI配置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form form={aiForm} layout="vertical" onFinish={handleSaveAiConfig}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>AI配置</Title>
        <Text type="secondary">
          兼容所有 OpenAI 格式的 API（通义千问、Deepseek、文心等均可使用）
        </Text>

        <Form.Item name="ai_base_url" label="API 地址" rules={[{ required: true, message: '请输入API地址' }]}>
          <Input placeholder="https://api.openai.com" />
        </Form.Item>

        <Form.Item name="ai_api_key" label="API Key" rules={[{ required: true, message: '请输入API Key' }]}>
          <Input.Password placeholder="请输入API Key" />
        </Form.Item>

        <Form.Item name="ai_model" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
          <Input placeholder="gpt-4o" />
        </Form.Item>

        <Form.Item name="ai_design_common_prompt" label="AI设计通用提示词">
          <Input.TextArea
            rows={6}
            placeholder={"例如：\n- 主键默认使用 bigint 自增\n- 每张表尽量包含 creator_id、updater_id\n- 状态字段优先使用 status tinyint\n- 金额字段优先使用 decimal(18,2)"}
          />
        </Form.Item>

        <Text type="secondary">
          可填写你常用的字段规范、主键偏好、命名习惯、审计字段等默认设计偏好，AI 自动设计表结构时会尽量遵循。
        </Text>

        <Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
            保存配置
          </Button>
        </Form.Item>
      </Space>
    </Form>
  );
};

export default AiTab;
