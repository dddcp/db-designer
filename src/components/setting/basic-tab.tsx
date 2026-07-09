import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import {
  Button,
  Card,
  Col,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  theme,
  Typography,
} from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  AppstoreOutlined,
  CloudDownloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { useToken } = theme;

const BasicTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { token } = useToken();
  const [appVersion, setAppVersion] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    getVersion().then(v => setAppVersion(v));
  }, []);

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
                  <div
                    style={{
                      maxHeight: 200,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      background: token.colorFillTertiary,
                      color: token.colorText,
                      padding: 12,
                      borderRadius: 6,
                    }}
                  >
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
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 语言卡片 */}
      <Card
        styles={{ header: { fontSize: 17 } }}
        title={
          <Space>
            <GlobalOutlined style={{ color: token.colorPrimary }} />
            <span>{t('setting_card_language')}</span>
          </Space>
        }
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text strong style={{ fontSize: 15 }}>{t('language')}</Text>
          <Space>
            <Select
              value={i18n.language}
              onChange={(value) => {
                i18n.changeLanguage(value);
              }}
              style={{ width: 200 }}
            >
              <Select.Option value="zh-CN">{t('language_zh')}</Select.Option>
              <Select.Option value="en-US">{t('language_en')}</Select.Option>
            </Select>
            <Text type="secondary" style={{ fontSize: 13 }}>
              <InfoCircleOutlined style={{ marginRight: 4 }} />
              {t('setting_lang_tip')}
            </Text>
          </Space>
        </Space>
      </Card>

      {/* 应用信息卡片 */}
      <Card
        styles={{ header: { fontSize: 17 } }}
        title={
          <Space>
            <AppstoreOutlined style={{ color: token.colorPrimary }} />
            <span>{t('setting_card_app_info')}</span>
          </Space>
        }
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 13 }}>{t('basic_app_name')}</Text>
            <div><Text strong style={{ fontSize: 15 }}>{t('app_title')}</Text></div>
          </Col>
          <Col xs={24} sm={12}>
            <Text type="secondary" style={{ fontSize: 13 }}>{t('basic_version')}</Text>
            <div><Text strong style={{ fontSize: 15 }}>{appVersion || t('loading')}</Text></div>
          </Col>
        </Row>
      </Card>

      {/* 版本更新卡片 */}
      <Card
        styles={{ header: { fontSize: 17 } }}
        title={
          <Space>
            <CloudDownloadOutlined style={{ color: token.colorPrimary }} />
            <span>{t('setting_card_version_update')}</span>
          </Space>
        }
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
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
      </Card>
    </Space>
  );
};

export default BasicTab;
