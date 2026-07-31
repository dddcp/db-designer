import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse, theme } from 'antd';
import { StopOutlined } from '@ant-design/icons';

/** 流式生成展示区的状态：streaming 生成中 / done 已完成（自动折叠）/ error 失败 */
export type AiStreamingStatus = 'streaming' | 'done' | 'error';

interface AiStreamingTextProps {
  /** 累积的模型原始输出文本 */
  text: string;
  /** 当前状态：streaming 展开、done|error 自动折叠 */
  status: AiStreamingStatus;
  /** 取消回调，仅在 streaming 时显示按钮并触发 */
  onCancel?: () => void;
}

/** 面板 key：streaming 时受控展开，done|error 时清空自动折叠 */
const PANEL_KEY = 'streaming';

/**
 * 共享流式展示组件：供 AI 设计表 / 修改表 / 推荐索引三个弹窗复用。
 * - 实时展示累积原文，每次新增内容自动滚到底部
 * - streaming 展开，done|error 自动折叠（AntD Collapse 默认过渡）
 * - 颜色一律取 theme token，适配暗色主题；滚动条复用 App.css 全局样式
 * - header 右侧取消按钮，仅 streaming 时显示
 */
const AiStreamingText: React.FC<AiStreamingTextProps> = ({ text, status, onCancel }) => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const scrollRef = useRef<HTMLPreElement>(null);

  // 新增内容时自动滚到底部，实时跟随最新输出
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  const isStreaming = status === 'streaming';

  return (
    <Collapse
      size="small"
      activeKey={isStreaming ? [PANEL_KEY] : []}
      items={[
        {
          key: PANEL_KEY,
          label: t('ai_streaming_raw_output'),
          extra: isStreaming && onCancel ? (
            <Button
              size="small"
              type="text"
              danger
              icon={<StopOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
            >
              {t('ai_streaming_cancel')}
            </Button>
          ) : undefined,
          children: (
            <pre
              ref={scrollRef}
              style={{
                margin: 0,
                maxHeight: 260,
                overflow: 'auto',
                padding: 8,
                background: token.colorFillAlter,
                color: token.colorText,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadius,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: token.fontSizeSM,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {text || (isStreaming ? t('ai_streaming_waiting') : '')}
            </pre>
          ),
        },
      ]}
  />
  );
};

export default AiStreamingText;
