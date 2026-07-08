import { ArrowLeftOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './back-button.module.css';

interface BackButtonProps {
  label: string;
  tooltip: string;
  onClick?: () => void;
}

/**
 * 通用返回按钮（胶囊样式 + hover 箭头左移）
 */
const BackButton: React.FC<BackButtonProps> = ({ label, tooltip, onClick }) => {
  const navigate = useNavigate();
  const handleClick = onClick ?? (() => navigate('/'));

  return (
    <Tooltip title={tooltip}>
      <button
        type="button"
        className={styles.backButton}
        onClick={handleClick}
      >
        <ArrowLeftOutlined className={styles.icon} />
        <span className={styles.label}>{label}</span>
      </button>
    </Tooltip>
  );
};

export default BackButton;