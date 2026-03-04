import { ConfigProvider, theme } from 'antd';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import Main from './components/main/main';
import ProjectDetail from './components/proj-detail';
import Setting from './components/setting/setting';
import { ThemeProvider, useTheme } from './store/theme-context';

function AppContent() {
  const { isDarkMode } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
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
