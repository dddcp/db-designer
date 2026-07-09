import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import { format as formatSql, SqlLanguage } from 'sql-formatter';
import 'highlight.js/styles/atom-one-dark.css';
import {
  Button,
  Empty,
  message,
  Popconfirm,
  Select,
  Space,
  Spin,
  Typography,
} from 'antd';
import {
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
  RobotOutlined,
  SendOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { Project, TableDef, AiSqlMessage, BackendAiSqlConversation, AiSqlConversation, DatabaseTypeOption } from '../../types';
import styles from './ai-sql-tab.module.css';

const { Title } = Typography;

// 注册 SQL 语言（只引入 sql 一种语言，最小化体积）
hljs.registerLanguage('sql', sql);

const SQL_SUGGESTION_KEYS = [
  'ai_sql_suggestion_1',
  'ai_sql_suggestion_2',
  'ai_sql_suggestion_3',
  'ai_sql_suggestion_4',
];

/** 将后端 snake_case 转为前端 camelCase */
function toConversation(b: BackendAiSqlConversation): AiSqlConversation {
  return {
    id: b.id,
    projectId: b.project_id,
    title: b.title,
    messages: b.messages,
    databaseType: b.database_type,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  };
}

/** 序列化表结构为 prompt 文本 */
function serializeTables(tables: TableDef[]): string {
  if (tables.length === 0) return '';
  return tables
    .map((t) => {
      const cols = t.columns
        .sort((a, b) => a.order - b.order)
        .map(
          (c) =>
            `  - ${c.name}（${c.displayName}）: ${c.type}${c.length ? `(${c.length})` : ''}${c.nullable ? '' : ' NOT NULL'}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.autoIncrement ? ' AUTO_INCREMENT' : ''}${c.comment ? ` -- ${c.comment}` : ''}`
        )
        .join('\n');
      return `### 表 ${t.name}（${t.displayName}）\n${cols}`;
    })
    .join('\n\n');
}

/** 构建 systemPrompt */
function buildSystemPrompt(databaseType: string, tablesText: string, commonPrompt: string): string {
  let prompt = `你是一个专业的数据库 SQL 专家。用户会用自然语言描述需求，你需要根据项目表结构生成 SQL 语句。

重要规则：
1. 只生成 DML 语句（SELECT、INSERT、UPDATE、DELETE），不生成 DDL（CREATE、ALTER、DROP）
2. 数据库类型为 ${databaseType}，请使用对应语法
3. 必须返回合法的 JSON 对象，格式为：{"sql": "你的SQL语句", "explanation": "对SQL的简要说明"}
4. 不要包含任何其他文字、markdown 标记或代码块标记
5. 如果需要多句SQL，用分号分隔放在同一个 sql 字段中
6. 充分利用以下表结构中的字段和关系来编写准确的 SQL`;

  if (commonPrompt.trim()) {
    prompt += `\n\n用户的通用设计偏好：\n${commonPrompt.trim()}`;
  }

  if (tablesText) {
    prompt += `\n\n项目表结构：\n${tablesText}`;
  }

  return prompt;
}

/** 独立的 AI API 调用函数，支持多轮 messages */
async function callAiSqlApi(messages: AiSqlMessage[]): Promise<{ sql: string; explanation: string }> {
  const allSettings = await invoke<{ [key: string]: string }>('get_local_settings');
  const baseUrl = allSettings['ai_base_url'];
  const apiKey = allSettings['ai_api_key'];
  const model = allSettings['ai_model'];

  if (!baseUrl || !apiKey || !model) {
    throw new Error('请先在设置页面配置AI参数（API地址、API Key、模型名称）');
  }

  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const content = await invoke<string>('ai_chat', {
    baseUrl,
    apiKey,
    model,
    messages: apiMessages,
  });

  let text = content.trim();
  // 剥离 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }
  // 剥离 thinking 标签
  text = text.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(text);
    return {
      sql: parsed.sql || '',
      explanation: parsed.explanation || '',
    };
  } catch {
    // 解析失败，尝试在文本中查找 JSON 对象
    const objStart = text.indexOf('{');
    const objEnd = text.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        const parsed = JSON.parse(text.slice(objStart, objEnd + 1));
        return {
          sql: parsed.sql || '',
          explanation: parsed.explanation || '',
        };
      } catch {
        // 最终降级
      }
    }
    // 降级：整个文本作为 explanation
    return { sql: '', explanation: text };
  }
}

/** 把项目数据库类型映射为 sql-formatter 支持的语言 */
function mapToFormatterLanguage(dbType: string): SqlLanguage {
  const lower = (dbType || '').toLowerCase();
  if (lower === 'postgresql') return 'postgresql';
  if (lower === 'oracle') return 'plsql';
  if (lower === 'mysql') return 'mysql';
  return 'sql';
}

/** 对 SQL 做格式化（换行 + 缩进 + 关键字大写），失败时返回原文本 */
function formatSqlForDisplay(sqlText: string, dbType: string): string {
  if (!sqlText.trim()) return '';
  try {
    return formatSql(sqlText, {
      language: mapToFormatterLanguage(dbType),
      keywordCase: 'upper',
      tabWidth: 2,
      useTabs: false,
      logicalOperatorNewline: 'before',
    });
  } catch {
    return sqlText;
  }
}

/** SQL 美化 + 高亮（失败时降级到原始转义文本） */
function formatAndHighlightSql(sqlText: string, dbType: string): string {
  if (!sqlText.trim()) return '';
  const formatted = formatSqlForDisplay(sqlText, dbType);
  try {
    return hljs.highlight(formatted, { language: 'sql', ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(formatted);
  }
}

/** 简单的 HTML 转义 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface AiSqlTabProps {
  project: Project;
  tables: TableDef[];
}

const AiSqlTab: React.FC<AiSqlTabProps> = ({ project, tables }) => {
  const { t, i18n } = useTranslation();
  const [conversations, setConversations] = useState<AiSqlConversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<AiSqlConversation | null>(null);
  const [localMessages, setLocalMessages] = useState<AiSqlMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [convLoading, setConvLoading] = useState(false);
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);
  const [newConvDbType, setNewConvDbType] = useState('mysql');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  useEffect(() => {
    loadConversations();
    // 切换项目时重置选中和消息
    setSelectedConv(null);
    setLocalMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // 选择对话时加载消息
  useEffect(() => {
    if (selectedConv) {
      try {
        const parsed: AiSqlMessage[] = JSON.parse(selectedConv.messages);
        setLocalMessages(parsed);
      } catch {
        setLocalMessages([]);
      }
    } else {
      setLocalMessages([]);
    }
  }, [selectedConv?.id]);

  // 消息变化时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages, loading]);

  // 缓存美化+高亮结果（避免每次渲染重新计算）
  const highlightedSqlMap = useMemo(() => {
    const map = new Map<number, string>();
    const dbType = selectedConv?.databaseType || 'mysql';
    localMessages.forEach((m, idx) => {
      if (m.sql) {
        map.set(idx, formatAndHighlightSql(m.sql, dbType));
      }
    });
    return map;
  }, [localMessages]);

  const loadConversations = async () => {
    setConvLoading(true);
    try {
      const list = await invoke<BackendAiSqlConversation[]>('get_ai_sql_conversations', { projectId: project.id });
      const converted = list.map(toConversation);
      setConversations(converted);
      // 若当前没有选中，自动选中第一条
      setSelectedConv((prev) => prev ?? (converted[0] ?? null));
    } catch (e) {
      message.error(t('ai_sql_load_fail') + ': ' + e);
    } finally {
      setConvLoading(false);
    }
  };

  const handleNewConversation = async () => {
    if (tables.length === 0) {
      message.warning(t('ai_sql_no_tables'));
      return;
    }
    try {
      const saved = await invoke<BackendAiSqlConversation>('save_ai_sql_conversation', {
        id: null,
        projectId: project.id,
        title: t('ai_sql_new'),
        messages: '[]',
        databaseType: newConvDbType,
      });
      const conv = toConversation(saved);
      setConversations((prev) => [conv, ...prev]);
      setSelectedConv(conv);
      setLocalMessages([]);
    } catch (e) {
      message.error(t('ai_sql_save_fail') + ': ' + e);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    if (!selectedConv) return;

    const userMessage: AiSqlMessage = { role: 'user', content: inputText.trim() };
    const newMessages = [...localMessages, userMessage];
    setLocalMessages(newMessages);
    setInputText('');
    setLoading(true);

    try {
      // 读取通用提示词
      const allSettings = await invoke<{ [key: string]: string }>('get_local_settings');
      const commonPrompt = allSettings['ai_design_common_prompt'] || '';
      const tablesText = serializeTables(tables);
      const systemPrompt = buildSystemPrompt(selectedConv.databaseType, tablesText, commonPrompt);

      // 构建 messages 数组
      const apiMessages: AiSqlMessage[] = [
        { role: 'user' as const, content: systemPrompt, sql: undefined, explanation: undefined },
        ...newMessages,
      ];

      const result = await callAiSqlApi(apiMessages);

      const assistantMessage: AiSqlMessage = {
        role: 'assistant',
        content: result.explanation || result.sql,
        sql: result.sql,
        explanation: result.explanation,
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setLocalMessages(updatedMessages);

      // 保存到后端
      const title = localMessages.length === 0 ? inputText.trim().slice(0, 20) : selectedConv.title;
      const messagesJson = JSON.stringify(updatedMessages);

      const saved = await invoke<BackendAiSqlConversation>('save_ai_sql_conversation', {
        id: selectedConv.id,
        projectId: project.id,
        title,
        messages: messagesJson,
        databaseType: selectedConv.databaseType,
      });

      const updatedConv = toConversation(saved);
      setSelectedConv(updatedConv);
      setConversations((prev) =>
        prev.map((c) => (c.id === updatedConv.id ? updatedConv : c))
      );
    } catch (e: any) {
      message.error(t('ai_sql_fail') + ': ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleSendSuggestion = (text: string) => {
    setInputText(text);
  };

  const handleDelete = async (id: number) => {
    try {
      await invoke('delete_ai_sql_conversation', { id });
      const newList = conversations.filter((c) => c.id !== id);
      setConversations(newList);
      if (selectedConv?.id === id) {
        setSelectedConv(newList.length > 0 ? newList[0] : null);
      }
      message.success(t('delete_success'));
    } catch (e) {
      message.error(t('ai_sql_delete_fail') + ': ' + e);
    }
  };

  const handleClearContext = async () => {
    if (!selectedConv) return;
    try {
      const saved = await invoke<BackendAiSqlConversation>('save_ai_sql_conversation', {
        id: selectedConv.id,
        projectId: project.id,
        title: selectedConv.title,
        messages: '[]',
        databaseType: selectedConv.databaseType,
      });
      const updatedConv = toConversation(saved);
      setSelectedConv(updatedConv);
      setLocalMessages([]);
      setConversations((prev) =>
        prev.map((c) => (c.id === updatedConv.id ? updatedConv : c))
      );
      message.success(t('save_success'));
    } catch (e) {
      message.error(t('ai_sql_save_fail') + ': ' + e);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('ai_sql_copy_success'));
    } catch {
      message.error(t('copy_fail'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      {/* 顶部操作栏 */}
      <div className={styles.headerBar}>
        <Title level={4} className={styles.headerTitle}>
          <RobotOutlined style={{ color: 'var(--ant-color-primary, #1677ff)' }} />
          {t('ai_sql_title')}
        </Title>
        <Space className={styles.headerActions}>
          <Select
            value={newConvDbType}
            onChange={setNewConvDbType}
            style={{ width: 140 }}
            size="middle"
          >
            {dbTypes.map((dt) => (
              <Select.Option key={dt.value} value={dt.value}>{dt.label}</Select.Option>
            ))}
          </Select>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewConversation}>
            {t('ai_sql_new')}
          </Button>
        </Space>
      </div>

      <div className={styles.body}>
        {/* 左侧：对话列表 */}
        <div className={styles.sidebar}>
          <Spin spinning={convLoading} style={{ flex: 1 }}>
            <div className={styles.sidebarList}>
              {conversations.length === 0 ? (
                <Empty
                  description={t('ai_sql_empty')}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ paddingTop: 40 }}
                />
              ) : (
                conversations.map((conv) => {
                  const isActive = selectedConv?.id === conv.id;
                  return (
                    <div
                      key={conv.id}
                      className={`${styles.conversationItem} ${isActive ? styles.conversationItemActive : ''}`}
                      onClick={() => setSelectedConv(conv)}
                    >
                      <div className={styles.conversationTitle} title={conv.title}>
                        {conv.title}
                      </div>
                      <div className={styles.conversationMeta}>
                        <span>
                          {new Date(conv.updatedAt).toLocaleDateString(
                            i18n.language === 'en-US' ? 'en-US' : 'zh-CN'
                          )}
                        </span>
                        <span className={styles.conversationDbTag}>{conv.databaseType}</span>
                        <Popconfirm
                          title={t('ai_sql_delete_confirm')}
                          onConfirm={(e) => {
                            e?.stopPropagation();
                            handleDelete(conv.id);
                          }}
                          onCancel={(e) => e?.stopPropagation()}
                        >
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                            style={{ marginLeft: 'auto' }}
                          />
                        </Popconfirm>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Spin>
        </div>

        {/* 右侧：对话内容 */}
        <div className={styles.chatPanel}>
          {!selectedConv ? (
            // 全局空状态（未选中对话）
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <RobotOutlined />
              </div>
              <div className={styles.emptyStateTitle}>{t('ai_sql_select')}</div>
            </div>
          ) : (
            <>
              {/* 对话标题条 */}
              <div className={styles.chatHeader}>
                <div className={styles.chatHeaderTitle}>
                  <RobotOutlined style={{ color: 'var(--ant-color-primary, #1677ff)' }} />
                  {selectedConv.title}
                  <span className={styles.chatHeaderDbTag}>{selectedConv.databaseType}</span>
                </div>
                <Popconfirm title={t('ai_sql_clear_confirm')} onConfirm={handleClearContext}>
                  <Button size="small" type="text" icon={<ClearOutlined />}>
                    {t('ai_sql_clear_context')}
                  </Button>
                </Popconfirm>
              </div>

              {/* 消息流 */}
              <div className={styles.messageList}>
                {localMessages.length === 0 ? (
                  // 单会话内的空状态：推荐问题
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <ThunderboltOutlined />
                    </div>
                    <div className={styles.emptyStateTitle}>{t('ai_sql_empty_title')}</div>
                    <div className={styles.emptyStateDesc}>{t('ai_sql_empty_desc')}</div>
                    <div className={styles.suggestionList}>
                      {SQL_SUGGESTION_KEYS.map((key) => (
                        <button
                          key={key}
                          className={styles.suggestionItem}
                          onClick={() => handleSendSuggestion(t(key))}
                        >
                          <ThunderboltOutlined className={styles.suggestionItemIcon} />
                          <span>{t(key)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  localMessages.map((msg, idx) =>
                    msg.role === 'user' ? (
                      <UserBubble key={idx} content={msg.content} />
                    ) : (
                      <AssistantBubble
                        key={idx}
                        msg={msg}
                        highlightedSql={highlightedSqlMap.get(idx)}
                        dbType={selectedConv?.databaseType || 'mysql'}
                        onCopy={handleCopy}
                        t={t}
                      />
                    )
                  )
                )}
                {loading && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div className={`${styles.avatar} ${styles.avatarAi}`}>
                      <RobotOutlined />
                    </div>
                    <div className={styles.typing}>
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区 */}
              <div className={styles.inputArea}>
                <div className={styles.inputBox}>
                  <textarea
                    className={styles.inputTextarea}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('ai_sql_input_placeholder')}
                    rows={1}
                    disabled={loading}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSend}
                    loading={loading}
                    disabled={!inputText.trim()}
                  >
                    {t('ai_sql_send')}
                  </Button>
                </div>
                <div className={styles.inputHint}>
                  <span>{t('ai_sql_input_hint_enter')}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** 用户消息气泡 */
const UserBubble: React.FC<{ content: string }> = ({ content }) => (
  <div className={`${styles.messageRow} ${styles.messageRowUser}`}>
    <div className={`${styles.avatar} ${styles.avatarUser}`}>
      <UserOutlined />
    </div>
    <div className={`${styles.bubbleWrapper} ${styles.bubbleWrapperUser}`}>
      <div className={styles.userBubble}>{content}</div>
    </div>
  </div>
);

/** AI 消息气泡（含 SQL 代码块 + 说明） */
const AssistantBubble: React.FC<{
  msg: AiSqlMessage;
  highlightedSql?: string;
  dbType: string;
  onCopy: (text: string) => void;
  t: (key: string) => string;
}> = ({ msg, highlightedSql, dbType, onCopy, t }) => {
  const hasSql = msg.sql !== undefined && msg.sql !== '';
  const hasExplanation = !!msg.explanation;
  // 降级情况：没有 SQL 也没有 explanation，把 content 当 SQL 展示
  const fallbackContent = !hasSql && !hasExplanation && msg.content ? msg.content : '';

  // 复制到剪贴板的内容：优先用美化格式后的纯文本（多行 + 缩进 + 关键字大写）
  // fallback 情况也走格式化，保证用户复制的和看到的一致
  const copyableText = useMemo(() => {
    if (hasSql && msg.sql) return formatSqlForDisplay(msg.sql, dbType);
    if (fallbackContent) return formatSqlForDisplay(fallbackContent, dbType);
    return '';
  }, [hasSql, msg.sql, fallbackContent, dbType]);

  // fallback 的高亮 HTML（单行转多行 + 高亮）
  const fallbackHtml = useMemo(
    () => (fallbackContent ? formatAndHighlightSql(fallbackContent, dbType) : ''),
    [fallbackContent, dbType]
  );

  return (
    <div className={styles.messageRow}>
      <div className={`${styles.avatar} ${styles.avatarAi}`}>
        <RobotOutlined />
      </div>
      <div className={`${styles.bubbleWrapper}`}>
        <div className={styles.aiBubble}>
          {hasSql && (
            <div className={styles.sqlBlock}>
              <div className={styles.sqlBlockHeader}>
                <span>SQL</span>
                <button
                  className={styles.copyButton}
                  onClick={() => onCopy(copyableText)}
                >
                  <CopyOutlined />
                  {t('ai_sql_copy')}
                </button>
              </div>
              {/*
                pre.hljs + code.hljs 双层结构：让 atom-one-dark 主题的
                pre code.hljs 规则能匹配上；hljs.highlight 输出的 span 类名
                （hljs-keyword 等）是全局 CSS，可正常上色。
              */}
              <pre className={`${styles.sqlBlockBody} hljs`}>
                <code
                  className="hljs language-sql"
                  dangerouslySetInnerHTML={{ __html: highlightedSql || '' }}
                />
              </pre>
            </div>
          )}
          {fallbackContent && (
            <div className={styles.sqlBlock}>
              <div className={styles.sqlBlockHeader}>
                <span>SQL</span>
                <button
                  className={styles.copyButton}
                  onClick={() => onCopy(copyableText)}
                >
                  <CopyOutlined />
                  {t('ai_sql_copy')}
                </button>
              </div>
              <pre className={`${styles.sqlBlockBody} hljs`}>
                <code
                  className="hljs language-sql"
                  dangerouslySetInnerHTML={{ __html: fallbackHtml }}
                />
              </pre>
            </div>
          )}
          {hasExplanation && (
            <div className={styles.explanation}>
              <div className={styles.explanationLabel}>{t('ai_sql_explanation')}</div>
              <div>{msg.explanation}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiSqlTab;