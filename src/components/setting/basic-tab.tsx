import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Button,
  Col,
  Divider,
  message,
  Modal,
  Progress,
  Row,
  Space,
  Switch,
  Typography,
} from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

const BasicTab: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadTheme();
    getVersion().then(v => setAppVersion(v));
  }, []);

  const loadTheme = async () => {
    try {
      const settings = await invoke<{ [key: string]: string }>('get_all_settings');
      setIsDarkMode(settings['theme'] === 'dark');
    } catch (error) {
      console.error('加载主题设置失败:', error);
    }
  };

  const handleSaveTheme = async (checked: boolean) => {
    try {
      await invoke('save_setting', {
        key: 'theme',
        value: checked ? 'dark' : 'light',
      });
      localStorage.setItem('theme', checked ? 'dark' : 'light');
      window.location.reload();
    } catch (error) {
      console.error('保存主题设置失败:', error);
      message.error('保存主题设置失败');
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await check();
      if (update) {
        Modal.confirm({
          title: '发现新版本',
          content: (
            <div>
              <p>最新版本: <strong>{update.version}</strong></p>
              <p>当前版本: {appVersion}</p>
              {update.body && (
                <div>
                  <p>更新说明:</p>
                  <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                    {update.body}
                  </div>
                </div>
              )}
            </div>
          ),
          okText: '下载并安装',
          cancelText: '稍后再说',
          onOk: async () => {
            setUpdating(true);
            setUpdateProgress(0);
            try {
              let totalSize = 0;
              let downloaded = 0;
              await update.downloadAndInstall((event) => {
                switch (event.event) {
                  case 'Started':
                    totalSize = event.data.contentLength ?? 0;
                    break;
                  case 'Progress':
                    downloaded += event.data.chunkLength;
                    if (totalSize > 0) {
                      setUpdateProgress(Math.round((downloaded / totalSize) * 100));
                    }
                    break;
                  case 'Finished':
                    setUpdateProgress(100);
                    break;
                }
              });
              message.success('更新下载完成，即将重启应用...');
              await relaunch();
            } catch (err) {
              console.error('更新失败:', err);
              message.error(`更新失败: ${err}`);
            } finally {
              setUpdating(false);
              setUpdateProgress(null);
            }
          },
        });
      } else {
        message.success('当前已是最新版本');
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      message.error(`检查更新失败: ${error}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title level={4}>主题设置</Title>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text>深色模式</Text>
        <Switch
          checked={isDarkMode}
          onChange={(checked) => {
            setIsDarkMode(checked);
            handleSaveTheme(checked);
          }}
          checkedChildren="开启"
          unCheckedChildren="关闭"
        />
      </div>

      <Divider />

      <Title level={4}>应用信息</Title>
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>应用名称</Text>
          <div><Text type="secondary">数据库模型设计器</Text></div>
        </Col>
        <Col span={12}>
          <Text strong>版本</Text>
          <div><Text type="secondary">{appVersion || '加载中...'}</Text></div>
        </Col>
      </Row>

      <Divider />

      <Title level={4}>版本更新</Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="primary"
            icon={checkingUpdate ? <SyncOutlined spin /> : <CheckCircleOutlined />}
            onClick={handleCheckUpdate}
            loading={checkingUpdate}
            disabled={updating}
          >
            检查更新
          </Button>
          {updating && <Text type="secondary">正在下载更新...</Text>}
        </div>
        {updateProgress !== null && (
          <Progress percent={updateProgress} status={updateProgress < 100 ? 'active' : 'success'} />
        )}
      </Space>
    </Space>
  );
};

export default BasicTab;
