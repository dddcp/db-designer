import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke, Channel } from '@tauri-apps/api/core';
import hljs from 'highlight.js/lib/core';
import sql from 'highlight.js/lib/languages/sql';
import { format as formatSql, SqlLanguage } from 'sql-formatter';
import 'highlight.js/styles/atom-one-dark.css';
import {
  Button,
  Collapse,
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

## 输出格式（必须严格遵守）
你只能输出一个合法的 JSON 对象，前后不要有任何其他字符（包括问候语、说明文字、markdown 标记、思考过程）：
{"sql": "你的SQL语句", "explanation": "对SQL的简要说明"}

## 硬性规则（违反任何一条都会导致解析失败）
1. 只生成 DML 语句（SELECT、INSERT、UPDATE、DELETE），不生成 DDL（CREATE、ALTER、DROP）
2. 数据库类型为 ${databaseType}，请使用对应语法
3. **不要用 \`\`\`json 或 \`\`\` 包裹输出**，直接输出裸 JSON
4. **sql 字段中禁止添加任何注释（-- 或 /* */）或说明文字**，所有解释必须放在 explanation 字段
5. **explanation 字段必须是非空字符串**（1-3 句），简要说明 SQL 的意图和关键逻辑
6. 如果需要多句 SQL，用分号分隔放在同一个 sql 字段中
7. sql 字段中的字符串字面量必须正确转义（单引号、双引号、换行用 \\n）
8. 充分利用以下表结构中的字段和关系来编写准确的 SQL

## 正确示例
{"sql": "SELECT id, name FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 10;", "explanation": "查询最近创建的 10 个活跃用户，按创建时间倒序排列。"}

## 错误示例（绝对不要这样输出）
❌ 用 markdown 包裹：
\`\`\`json
{"sql": "SELECT * FROM users", "explanation": "查询所有用户"}
\`\`\`

❌ 在 sql 字段中加注释：
{"sql": "-- 查询用户\\nSELECT * FROM users;", "explanation": ""}

❌ 输出 JSON 之外的说明文字：
下面是生成的 SQL：
{"sql": "SELECT * FROM users", "explanation": "查询所有用户"}
请参考使用。`;

  if (commonPrompt.trim()) {
    prompt += `\n\n## 用户的通用设计偏好\n${commonPrompt.trim()}`;
  }

  if (tablesText) {
    prompt += `\n\n## 项目表结构\n${tablesText}`;
  }

  return prompt;
}

/** 后端 ai_chat_stream 推送的事件块（与 src-tauri/src/ai.rs::StreamChunk 对应） */
type StreamChunk =
  | { type: 'delta'; content: string }
  | { type: 'done' };

/** 对 AI 原始输出做容错解析：剥离 markdown 代码块与 thinking 标签后尝试解析 JSON，
 *  解析失败时降级为将整段文本作为 explanation、sql 留空。 */
function parseSqlResult(text: string): { sql: string; explanation: string } {
  let cleaned = (text || '').trim();
  // 先剥离 thinking 标签：思考链里常含 ```代码块```，必须先整体移除，
  // 否则下面的代码块剥离会命中思考链内的代码块、把真正的 JSON 丢弃
  cleaned = cleaned.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();
  // 再剥离 markdown 代码块（AI 用 ```json 包裹 JSON 的情况）
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(cleaned);
    return {
      sql: parsed.sql || '',
      explanation: parsed.explanation || '',
    };
  } catch {
    // 解析失败，尝试在文本中查找 JSON 对象
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
        return {
          sql: parsed.sql || '',
          explanation: parsed.explanation || '',
        };
      } catch {
        // 最终降级
      }
    }
    // 降级：整个文本作为 explanation
    return { sql: '', explanation: cleaned };
  }
}

/**
 * 独立的流式 AI 调用函数，支持多轮 messages。
 * 经 ai_chat_stream 逐块累积 AI 原始输出文本，生成结束后对累积原文执行容错解析。
 * onDelta 在每个增量到达时回调当前累积全文（用于驱动流式气泡）；
 * onChannel 在 Channel 创建后回调，供调用方在切换 / 卸载时注销以触发后端取消。
 */
async function callAiSqlApi(
  messages: AiSqlMessage[],
  onDelta: (acc: string) => void,
  onChannel?: (channel: Channel<StreamChunk>) => void,
): Promise<{ rawText: string; sql: string; explanation: string }> {
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

  // 经 Channel 逐块累积原文（保留 JSON 壳，不做字段提取）
  const channel = new Channel<StreamChunk>();
  onChannel?.(channel);
  let acc = '';
  channel.onmessage = (msg) => {
    if (msg.type === 'delta') {
      acc += msg.content;
      onDelta(acc);
    }
  };

  await invoke('ai_chat_stream', {
    baseUrl,
    apiKey,
    model,
    messages: apiMessages,
    onEvent: channel,
  });

  // 流式结束后对累积原文执行既有容错解析
  const { sql, explanation } = parseSqlResult(acc);
  return { rawText: acc, sql, explanation };
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
  const [streamingRaw, setStreamingRaw] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 进行中的流式 Channel（用于切换 / 卸载时注销回调触发后端取消）
  const channelRef = useRef<Channel<StreamChunk> | null>(null);
  // 当前流式是否已被取消（取消后丢弃占位消息、不落库）
  const cancelledRef = useRef(false);

  /** 注销进行中流式的 Channel 回调：前端回调被注销后后端 on_event.send 失败即停止读取 */
  const cancelStream = useCallback(() => {
    cancelledRef.current = true;
    const ch = channelRef.current;
    if (ch) {
      // cleanupCallback 为 Channel 的私有方法，注销前端回调 id
      (ch as unknown as { cleanupCallback: () => void }).cleanupCallback();
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  useEffect(() => {
    // 切换项目时取消进行中的流式并重置选中和消息
    cancelStream();
    setStreamingRaw('');
    loadConversations();
    setSelectedConv(null);
    setLocalMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // 选择对话时加载消息
  useEffect(() => {
    // 切换对话时取消进行中的流式，丢弃未完成的占位消息
    cancelStream();
    setStreamingRaw('');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?.id]);

  // 组件卸载时取消进行中的流式
  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [cancelStream]);

  // 消息变化 / 流式增量时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages, loading, streamingRaw]);

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
    const text = inputText.trim();
    if (!text) return;
    if (!selectedConv) return;

    const userMessage: AiSqlMessage = { role: 'user', content: text };
    const newMessages = [...localMessages, userMessage];
    // 先 push 一条占位 assistant 消息，流式期间由 streamingRaw 驱动其原文区域
    const placeholder: AiSqlMessage = {
      role: 'assistant',
      content: '',
      sql: undefined,
      explanation: undefined,
      rawText: '',
    };
    setLocalMessages([...newMessages, placeholder]);
    setInputText('');
    setLoading(true);
    cancelledRef.current = false;
    setStreamingRaw('');

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

      const result = await callAiSqlApi(
        apiMessages,
        (acc) => {
          // 流式增量仅累积到 streamingRaw 局部 state，驱动当前气泡
          if (cancelledRef.current) return;
          setStreamingRaw(acc);
        },
        (channel) => {
          channelRef.current = channel;
        },
      );

      // 流式中途取消（切换对话 / 卸载）：占位消息由对应 effect 清理，直接返回不落库
      if (cancelledRef.current) {
        return;
      }

      const assistantMessage: AiSqlMessage = {
        role: 'assistant',
        content: result.explanation || result.sql,
        sql: result.sql,
        explanation: result.explanation,
        rawText: result.rawText,
      };

      const updatedMessages = [...newMessages, assistantMessage];
      setLocalMessages(updatedMessages);

      // 保存到后端
      const title = localMessages.length === 0 ? text.slice(0, 20) : selectedConv.title;
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
      // 失败时回退占位消息（取消场景由上面 cancelledRef 分支处理）
      if (!cancelledRef.current) {
        setLocalMessages(newMessages);
      }
      message.error(t('ai_sql_fail') + ': ' + (e.message || e));
    } finally {
      channelRef.current = null;
      setLoading(false);
      setStreamingRaw('');
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

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('ai_sql_copy_success'));
    } catch {
      message.error(t('copy_fail'));
    }
  }, [t]);

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
                  localMessages.map((msg, idx) => {
                    // 流式期间最后一条 assistant 占位消息即为当前生成中的气泡
                    const isStreaming = loading && idx === localMessages.length - 1;
                    return msg.role === 'user' ? (
                      <UserBubble key={idx} content={msg.content} />
                    ) : (
                      <AssistantBubble
                        key={idx}
                        msg={msg}
                        highlightedSql={highlightedSqlMap.get(idx)}
                        dbType={selectedConv?.databaseType || 'mysql'}
                        onCopy={handleCopy}
                        t={t}
                        streamingRaw={isStreaming ? streamingRaw : undefined}
                        isStreaming={isStreaming}
                      />
                    );
                  })
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

/** AI 消息气泡（顶部可折叠原文区域 + SQL 代码块 + 说明） */
const AssistantBubble = React.memo(({
  msg,
  highlightedSql,
  dbType,
  onCopy,
  t,
  streamingRaw,
  isStreaming,
}: {
  msg: AiSqlMessage;
  highlightedSql?: string;
  dbType: string;
  onCopy: (text: string) => void;
  t: (key: string) => string;
  streamingRaw?: string;
  isStreaming?: boolean;
}) => {
  const active = !!isStreaming;
  // 原文：流式中渲染 streamingRaw，否则渲染持久化的 msg.rawText
  const rawText = active ? streamingRaw || '' : msg.rawText || '';
  const showRaw = rawText.length > 0;

  // sql / explanation 仅在非流式时展示（流式中 SQL 区域用生成中占位）
  const hasSql = !active && msg.sql !== undefined && msg.sql !== '';
  const hasExplanation = !active && !!msg.explanation;
  // 降级情况：没有 SQL 也没有 explanation，把 content 当 SQL 展示
  const fallbackContent = !active && !hasSql && !hasExplanation && msg.content ? msg.content : '';

  // 折叠默认态：流式中展开、完成后折叠、历史折叠
  const [rawOpen, setRawOpen] = useState(active);
  const rawRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    // 流式结束后自动折叠
    if (!active) setRawOpen(false);
  }, [active]);

  // 流式中原文增长时跟随滚到底部，实时看最新输出
  useEffect(() => {
    if (active && rawRef.current) {
      rawRef.current.scrollTop = rawRef.current.scrollHeight;
    }
  }, [active, rawText]);

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
          {/* 可折叠「AI 原文输出」区域：保留 JSON 等原始结构，不做字段提取 */}
          {showRaw && (
            <Collapse
              ghost
              size="small"
              className={styles.rawCollapse}
              activeKey={rawOpen ? 'raw' : ''}
              onChange={(key) => {
                const open = Array.isArray(key) ? key.includes('raw') : key === 'raw';
                setRawOpen(open);
                // 手动展开时回到顶部，方便从头阅读
                if (open && rawRef.current) {
                  requestAnimationFrame(() => {
                    if (rawRef.current) rawRef.current.scrollTop = 0;
                  });
                }
              }}
              items={[
                {
                  key: 'raw',
                  label: t('ai_sql_raw_output'),
                  children: (
                    <pre ref={rawRef} className={styles.rawPre}>
                      {rawText}
                    </pre>
                  ),
                },
              ]}
            />
          )}
          {/* 流式中：SQL 区域显示生成中占位 */}
          {active && (
            <div className={styles.sqlBlock}>
              <div className={styles.sqlBlockHeader}>
                <span>SQL</span>
              </div>
              <div className={styles.sqlGenerating}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.generatingText}>{t('ai_sql_generating')}</span>
              </div>
            </div>
          )}
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
});

export default AiSqlTab;