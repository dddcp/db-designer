import { ConfigProvider, theme } from 'antd';
import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import Main from './components/main/main';
import ProjectDetail from './components/proj-detail';
import Setting from './components/setting/setting';

/**
 * 主应用组件 - 使用React Router配置多页面路由
 */
function App() {
  // 从localStorage获取主题设置，默认为浅色主题
  const isDarkMode = localStorage.getItem('theme') === 'dark';
  
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
          {/* 主页面路由 */}
          <Route path="/" element={<Main />} />
          
          {/* 项目详情页面路由 */}
          <Route path="/project/:id" element={<ProjectDetail />} />
          
          {/* 设置页面路由 */}
          <Route path="/setting" element={<Setting />} />
          
          {/* 默认路由重定向到主页 */}
          <Route path="*" element={<Main />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App;
