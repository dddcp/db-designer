import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  Select,
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
  const { t, i18n } = useTranslation();
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
      console.error(t('basic_theme_load_fail'), error);
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
      console.error(t('basic_theme_save_fail'), error);
      message.error(t('basic_theme_save_fail'));
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await check();
      if (update) {
        Modal.confirm({
          title: t('basic_new_version'),
          content: (
            <div>
              <p>{t('basic_latest_version')} <strong>{update.version}</strong></p>
              <p>{t('basic_current_version')} {appVersion}</p>
              {update.body && (
                <div>
                  <p>{t('basic_update_notes')}</p>
                  <div style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                    {update.body}
                  </div>
                </div>
              )}
            </div>
          ),
          okText: t('basic_download_install'),
          cancelText: t('basic_later'),
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
              message.success(t('basic_update_done'));
              await relaunch();
            } catch (err) {
              console.error(t('update_fail'), err);
              message.error(`${t('update_fail')}: ${err}`);
            } finally {
              setUpdating(false);
              setUpdateProgress(null);
            }
          },
        });
      } else {
        message.success(t('already_latest'));
      }
    } catch (error) {
      console.error(t('check_update_fail'), error);
      message.error(`${t('check_update_fail')}: ${error}`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Title level={4}>{t('basic_theme')}</Title>
      <div style={{ display: 'flex',gap: 16 }}>
        <Text strong>{t('basic_dark_mode')}</Text>
        <Switch
          checked={isDarkMode}
          onChange={(checked) => {
            setIsDarkMode(checked);
            handleSaveTheme(checked);
          }}
          checkedChildren={t('basic_dark_on')}
          unCheckedChildren={t('basic_dark_off')}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Text strong>{t('language')}</Text>
        <Select
          value={i18n.language}
          onChange={(value) => {
            i18n.changeLanguage(value);
          }}
          style={{ width: 200, marginLeft: 16 }}
        >
          <Select.Option value="zh-CN">{t('language_zh')}</Select.Option>
          <Select.Option value="en-US">{t('language_en')}</Select.Option>
        </Select>
      </div>

      <Divider />

      <Title level={4}>{t('basic_app_info')}</Title>
      <Row gutter={16}>
        <Col span={12}>
          <Text strong>{t('basic_app_name')}</Text>
          <div><Text type="secondary">{t('app_title')}</Text></div>
        </Col>
        <Col span={12}>
          <Text strong>{t('basic_version')}</Text>
          <div><Text type="secondary">{appVersion || t('loading')}</Text></div>
        </Col>
      </Row>

      <Divider />

      <Title level={4}>{t('basic_version_update')}</Title>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="primary"
            icon={checkingUpdate ? <SyncOutlined spin /> : <CheckCircleOutlined />}
            onClick={handleCheckUpdate}
            loading={checkingUpdate}
            disabled={updating}
          >
            {t('basic_check_update')}
          </Button>
          {updating && <Text type="secondary">{t('basic_downloading')}</Text>}
        </div>
        {updateProgress !== null && (
          <Progress percent={updateProgress} status={updateProgress < 100 ? 'active' : 'success'} />
        )}
      </Space>
    </Space>
  );
};

export default BasicTab;