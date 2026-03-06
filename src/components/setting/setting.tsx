import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
          <Tooltip title="返回主页">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/')}>
              返回
            </Button>
          </Tooltip>
          <SettingOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
          <Title level={3} style={{ margin: 0 }}>设置</Title>
        </Space>
      </Header>

      <Content style={{ padding: '24px', background: token.colorBgLayout }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Card>
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                { key: 'basic', label: '基础设置', children: <BasicTab /> },
                { key: 'git', label: 'Git配置', children: <GitTab /> },
                { key: 'database', label: '数据库连接', children: <DatabaseTab /> },
                { key: 'ai', label: 'AI配置', children: <AiTab /> },
                { key: 'dataTypes', label: '数据类型', children: <DataTypeTab /> },
              ]}
            />
          </Card>
        </div>
      </Content>
    </Layout>
  );
};

export default Setting;
