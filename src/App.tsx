import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './App.css';
import Main from './components/main/main';
import ProjectDetail from './components/proj-detail';
import Setting from './components/setting/setting';
import { ThemeProvider, useTheme } from './store/theme-context';
import { DARK_BG_PAGE, DARK_BG_PANEL } from './theme/dark-colors';

function AppContent() {
  const { isDarkMode } = useTheme();
  const { i18n } = useTranslation();
  const antdLocale = i18n.language === 'en-US' ? enUS : zhCN;

  return (
    <ConfigProvider
      locale={antdLocale}
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
          // dark mode 下覆盖 Ant Design 默认的近黑色 token（与 dark-colors.ts 保持一致）
          // 浅色模式不覆盖，沿用 Ant Design 默认浅色 token
          ...(isDarkMode && {
            colorBgLayout: DARK_BG_PAGE,
            colorBgContainer: DARK_BG_PANEL,
            colorBgElevated: DARK_BG_PANEL,
          }),
        },
      }}
    >
      <Router>
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/setting" element={<Setting />} />
          <Route path="*" element={<Main />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;