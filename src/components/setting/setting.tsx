import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Layout,
  Button,
  Card,
  Space,
  Tabs,
  theme,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import BasicTab from './basic-tab';
import GitTab from './git-tab';
import DatabaseTab from './database-tab';
import AiTab from './ai-tab';
import DataTypeTab from './data-type-tab';

const { Header, Content } = Layout;
const { Title } = Typography;
const { useToken } = theme;

const Setting: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = useToken();
  const [activeTab, setActiveTab] = useState('basic');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space>
          <Tooltip title={t('setting_back_home')}>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
              {t('setting_back')}
            </Button>
          </Tooltip>
          <SettingOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          <Title level={3} style={{ margin: 0 }}>{t('setting_title')}</Title>
        </Space>
      </Header>

      <Content style={{ padding: '24px', background: token.colorBgLayout }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Card>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'basic', label: t('setting_basic'), children: <BasicTab /> },
                { key: 'git', label: t('setting_git'), children: <GitTab /> },
                { key: 'database', label: t('setting_db'), children: <DatabaseTab /> },
                { key: 'ai', label: t('setting_ai'), children: <AiTab /> },
                { key: 'dataTypes', label: t('setting_data_type'), children: <DataTypeTab /> },
              ]}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
};

export default Setting;