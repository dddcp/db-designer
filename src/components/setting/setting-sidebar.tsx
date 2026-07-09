import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  SettingOutlined,
  BranchesOutlined,
  DatabaseOutlined,
  RobotOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useTheme } from '../../store/theme-context';
import styles from './setting.module.css';

/**
 * 设置页 Section 标识
 */
export type SettingSection = 'basic' | 'git' | 'database' | 'ai' | 'datatype';

interface SettingSidebarProps {
  selectedKey: SettingSection;
  onSelect: (key: SettingSection) => void;
}

interface MenuItemConfig {
  key: SettingSection;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
}

const MENU_ITEMS: MenuItemConfig[] = [
  {
    key: 'basic',
    icon: <SettingOutlined />,
    labelKey: 'setting_basic',
    descKey: 'setting_section_basic_desc',
  },
  {
    key: 'git',
    icon: <BranchesOutlined />,
    labelKey: 'setting_git',
    descKey: 'setting_section_git_desc',
  },
  {
    key: 'database',
    icon: <DatabaseOutlined />,
    labelKey: 'setting_db',
    descKey: 'setting_section_database_desc',
  },
  {
    key: 'ai',
    icon: <RobotOutlined />,
    labelKey: 'setting_ai',
    descKey: 'setting_section_ai_desc',
  },
  {
    key: 'datatype',
    icon: <TagsOutlined />,
    labelKey: 'setting_data_type',
    descKey: 'setting_section_datatype_desc',
  },
];

/**
 * 设置页左侧分类导航
 */
const SettingSidebar: React.FC<SettingSidebarProps> = ({ selectedKey, onSelect }) => {
  const { t } = useTranslation();
  const { isDarkMode } = useTheme();

  return (
    <nav className={`${styles.sider} ${isDarkMode ? styles.siderDark : ''}`}>
      {MENU_ITEMS.map((item) => {
        const isActive = selectedKey === item.key;
        return (
          <div
            key={item.key}
            className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
            onClick={() => onSelect(item.key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item.key);
              }
            }}
          >
            <span className={styles.menuIcon}>{item.icon}</span>
            <span className={styles.menuText}>
              <span className={styles.menuLabel}>{t(item.labelKey)}</span>
              <span className={styles.menuDesc}>{t(item.descKey)}</span>
            </span>
          </div>
        );
      })}
    </nav>
  );
};

export default SettingSidebar;
