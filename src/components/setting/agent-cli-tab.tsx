import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Input,
  message,
  Modal,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

/** 单个 skill 目标状态（与后端 CliStatus/SkillStatusInfo 对应） */
interface SkillStatus {
  id: string;
  name: string;
  root: string;
  installed_version: string | null;
  outdated: boolean;
}

/** CLI 托管状态（cli_get_status 返回） */
interface CliStatus {
  installed: boolean;
  installed_version: string | null;
  install_dir: string;
  latest_version: string | null;
  update_available: boolean;
  path_registered: boolean;
  copies: string[];
  skills: SkillStatus[];
  latest_error: string | null;
}

/**
 * Agent CLI 设置页：dbd 命令行的安装/更新/卸载、skill 部署
 */
const AgentCliTab: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customDir, setCustomDir] = useState('');

  const loadStatus = useCallback(async () => {
    const s = await invoke<CliStatus>('cli_get_status');
    setStatus(s);
    // 默认勾选已安装或落后的目标，便于一键重装
    setSelectedSkills(
      s.skills.filter((x) => x.installed_version || x.outdated).map((x) => x.id)
    );
  }, []);

  useEffect(() => {
    getVersion().then((v) => setAppVersion(v));
    loadStatus().catch((e) => message.error(String(e)));
  }, [loadStatus]);

  /** 通用动作执行：统一 busy 状态与结果反馈 */
  const runAction = async (action: () => Promise<string>, successKey: string) => {
    setBusy(true);
    try {
      const msg = await action();
      message.success(`${t(successKey)}：${msg}`);
      await loadStatus();
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleInstall = () =>
    runAction(() => invoke<string>('cli_install'), 'agent_cli_install_success');
  const handleUpdate = () =>
    runAction(() => invoke<string>('cli_update'), 'agent_cli_update_success');
  const handleUninstall = () =>
    Modal.confirm({
      title: t('agent_cli_uninstall_confirm'),
      okText: t('confirm'),
      cancelText: t('cancel'),
      onOk: () => runAction(() => invoke<string>('cli_uninstall'), 'agent_cli_uninstalled'),
    });

  const handleInstallSkills = async () => {
    if (selectedSkills.length === 0 && !customDir.trim()) {
      message.warning(t('agent_cli_pick_target'));
      return;
    }
    setBusy(true);
    try {
      const paths = await invoke<string[]>('cli_install_skill', {
        targets: selectedSkills,
        customDir: customDir.trim() || null,
      });
      message.success(t('agent_cli_skills_success', { count: paths.length }));
      await loadStatus();
    } catch (e) {
      message.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const skillOptions = (status?.skills ?? []).map((s) => ({
    label: `${s.name}（${
      s.installed_version
        ? s.outdated
          ? t('agent_cli_skill_outdated_short', { version: s.installed_version })
          : `v${s.installed_version}`
        : t('agent_cli_skill_not_installed')
    }）`,
    value: s.id,
  }));
  const outdatedSkills = (status?.skills ?? []).filter((s) => s.outdated);

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title={
          <Space>
            <ApiOutlined />
            {t('agent_cli_title')}
          </Space>
        }
      >
        <Descriptions
          column={1}
          size="small"
          items={[
            {
              key: 'version',
              label: t('agent_cli_current_version'),
              children: status?.installed ? (
                <Tag color="success">v{status.installed_version ?? '?'}</Tag>
              ) : (
                <Tag>{t('agent_cli_status_not_installed')}</Tag>
              ),
            },
            {
              key: 'latest',
              label: t('agent_cli_latest_version'),
              children: status?.latest_version ? (
                <Tag color={status.update_available ? 'warning' : 'default'}>
                  v{status.latest_version}
                </Tag>
              ) : (
                <Text type="secondary">{t('agent_cli_latest_unknown')}</Text>
              ),
            },
            {
              key: 'dir',
              label: t('agent_cli_install_dir'),
              children: <Text copyable>{status?.install_dir ?? '-'}</Text>,
            },
            {
              key: 'path',
              label: 'PATH',
              children: status?.path_registered ? (
                <Tag color="success">{t('agent_cli_path_registered')}</Tag>
              ) : (
                <Tag color="warning">{t('agent_cli_path_not_registered')}</Tag>
              ),
            },
          ]}
        />
        <Space style={{ marginTop: 16 }} wrap>
          {status?.installed ? (
            <>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={busy}
                disabled={!status.update_available}
                onClick={handleUpdate}
              >
                {status.update_available
                  ? t('agent_cli_update')
                  : t('agent_cli_up_to_date')}
              </Button>
              <Button danger icon={<DeleteOutlined />} loading={busy} onClick={handleUninstall}>
                {t('agent_cli_uninstall')}
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              icon={<CloudDownloadOutlined />}
              loading={busy}
              onClick={handleInstall}
            >
              {t('agent_cli_install')}
            </Button>
          )}
        </Space>
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">{t('agent_cli_reopen_terminal')}</Text>
        </div>
        {status?.latest_error && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message={t('agent_cli_latest_error', { error: status.latest_error })}
          />
        )}
        {status && status.copies.length > 0 && (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message={t('agent_cli_copies_warning', { copies: status.copies.join('；') })}
          />
        )}
      </Card>

      <Card title={t('agent_cli_skills_title')}>
        {outdatedSkills.length > 0 && (
          <Alert
            style={{ marginBottom: 12 }}
            type="info"
            showIcon
            message={t('agent_cli_skills_outdated_alert', {
              names: outdatedSkills.map((s) => s.name).join('、'),
              current: appVersion || '',
            })}
          />
        )}
        <Text type="secondary">{t('agent_cli_skills_desc')}</Text>
        <div style={{ marginTop: 12 }}>
          <Checkbox.Group
            options={skillOptions}
            value={selectedSkills}
            onChange={(v) => setSelectedSkills(v as string[])}
          />
        </div>
        <Space style={{ marginTop: 16 }} wrap>
          <Input
            style={{ width: 320 }}
            placeholder={t('agent_cli_custom_dir')}
            value={customDir}
            onChange={(e) => setCustomDir(e.target.value)}
          />
          <Button loading={busy} onClick={handleInstallSkills}>
            {t('agent_cli_install_skills')}
          </Button>
        </Space>
      </Card>
    </Space>
  );
};

export default AgentCliTab;
