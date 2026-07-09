import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layout,
  Card,
  Tabs,
  theme,
  Typography,
} from 'antd';
import {
  SettingOutlined,
} from '@ant-design/icons';
import BasicTab from './basic-tab';
import GitTab from './git-tab';
import DatabaseTab from './database-tab';
import AiTab from './ai-tab';
import DataTypeTab from './data-type-tab';
import BackButton from '../common/BackButton';

const { Header, Content } = Layout;
const { Title } = Typography;
const { useToken } = theme;

const Setting: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useToken();
  const [activeTab, setActiveTab] = useState('basic');

  return (
    <Layout style={{ height: '100vh' }}>
      <Header
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flex: '0 0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BackButton
            label={t('setting_back')}
            tooltip={t('setting_back_home')}
          />
          <SettingOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          <Title level={3} style={{ margin: 0, height: 24, lineHeight: '24px' }}>{t('setting_title')}</Title>
        </div>
      </Header>

      <Content style={{ padding: '24px', background: token.colorBgLayout, overflow: 'auto' }}>
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