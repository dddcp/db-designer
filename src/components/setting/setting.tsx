import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Layout, theme, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { getThemedBg } from '../../theme/dark-colors';
import { useTheme } from '../../store/theme-context';
import SettingSidebar, { type SettingSection } from './setting-sidebar';
import BasicTab from './basic-tab';
import GitTab from './git-tab';
import DatabaseTab from './database-tab';
import AiTab from './ai-tab';
import DataTypeTab from './data-type-tab';
import BackButton from '../common/BackButton';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;

const VALID_SECTIONS: SettingSection[] = ['basic', 'git', 'database', 'ai', 'datatype'];

/**
 * 从 URL hash 解析当前 section
 */
const parseHashSection = (): SettingSection => {
  if (typeof window === 'undefined') return 'basic';
  const raw = window.location.hash.replace(/^#/, '');
  return VALID_SECTIONS.includes(raw as SettingSection) ? (raw as SettingSection) : 'basic';
};

const Setting: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useToken();
  const { isDarkMode } = useTheme();
  const [activeSection, setActiveSection] = useState<SettingSection>(() => parseHashSection());

  // 监听 hash 变化（浏览器前进/后退）
  useEffect(() => {
    const onHashChange = () => setActiveSection(parseHashSection());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSelect = useCallback((next: SettingSection) => {
    setActiveSection(next);
    // 使用 replaceState 避免触发浏览器滚动跳转
    window.history.replaceState(null, '', `#${next}`);
  }, []);

  const renderSection = () => {
    switch (activeSection) {
      case 'git': return <GitTab />;
      case 'database': return <DatabaseTab />;
      case 'ai': return <AiTab />;
      case 'datatype': return <DataTypeTab />;
      case 'basic':
      default: return <BasicTab />;
    }
  };

  return (
    <Layout style={{ height: '100vh' }}>
      <Header
        style={{
          height: 64,
          background: getThemedBg(isDarkMode, 'panel'),
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
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 60%, #722ed1 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              boxShadow: isDarkMode
                ? '0 4px 16px rgba(22, 119, 255, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
                : '0 4px 12px rgba(22, 119, 255, 0.28)',
            }}
          >
            <SettingOutlined />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
            <Title level={3} style={{ margin: 0, fontSize: 22 }}>{t('setting_title')}</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {t('setting_subtitle')}
            </Text>
          </div>
        </div>
      </Header>

      <Content
        className={isDarkMode ? 'theme-dark' : ''}
        style={{
          padding: '20px 24px',
          background: getThemedBg(isDarkMode, 'page'),
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 20,
            alignItems: 'flex-start',
            maxWidth: 1240,
            margin: '0 auto',
          }}
        >
          <aside
            style={{
              width: 240,
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              background: getThemedBg(isDarkMode, 'panel'),
              borderRadius: 12,
              border: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
            }}
          >
            <SettingSidebar selectedKey={activeSection} onSelect={handleSelect} />
          </aside>

          <main style={{ flex: 1, minWidth: 0 }}>
            {renderSection()}
          </main>
        </div>
      </Content>
    </Layout>
  );
};

export default Setting;
