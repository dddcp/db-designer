import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Col,
  Empty,
  Input,
  List,
  message,
  Popconfirm,
  Row,
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
} from '@ant-design/icons';
import type { Project, TableDef, AiSqlMessage, BackendAiSqlConversation, AiSqlConversation, DatabaseTypeOption } from '../../types';

const { Title, Text, Paragraph } = Typography;

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

  const url = baseUrl
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/(\/v1)(\/.*)?$/, '$1')
    + (baseUrl.includes('/v1') ? '' : '/v1')
    + '/chat/completions';

  const apiMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  let content: string = data.choices?.[0]?.message?.content || '';

  // 剥离 markdown 代码块
  content = content.trim();
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  }
  // 剥离 thinking 标签
  content = content.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();

  // 尝试解析 JSON
  try {
    const parsed = JSON.parse(content);
    return {
      sql: parsed.sql || '',
      explanation: parsed.explanation || '',
    };
  } catch {
    // 解析失败，尝试在文本中查找 JSON 对象
    const objStart = content.indexOf('{');
    const objEnd = content.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      try {
        const parsed = JSON.parse(content.slice(objStart, objEnd + 1));
        return {
          sql: parsed.sql || '',
          explanation: parsed.explanation || '',
        };
      } catch {
        // 最终降级
      }
    }
    // 降级：整个文本作为 explanation
    return { sql: '', explanation: content };
  }
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
  }, [localMessages]);

  const loadConversations = async () => {
    setConvLoading(true);
    try {
      const list = await invoke<BackendAiSqlConversation[]>('get_ai_sql_conversations', { projectId: project.id });
      const converted = list.map(toConversation);
      setConversations(converted);
      if (converted.length > 0 && !selectedConv) {
        setSelectedConv(converted[0]);
      }
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

  const handleSqlChange = (msgIndex: number, newSql: string) => {
    setLocalMessages((prev) =>
      prev.map((m, i) => (i === msgIndex ? { ...m, sql: newSql } : m))
    );
  };

  return (
    <div style={{ padding: 24, height: '100%' }}>
      {/* 顶部操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          {t('ai_sql_title')}
        </Title>
        <Space>
          <Select
            value={newConvDbType}
            onChange={setNewConvDbType}
            style={{ width: 140 }}
            size="small"
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

      <Row gutter={16} style={{ height: 'calc(100% - 72px)' }}>
        {/* 左侧：对话列表 */}
        <Col span={7} style={{ height: '100%', overflowY: 'auto', borderRight: '1px solid #f0f0f0' }}>
          <Spin spinning={convLoading}>
            {conversations.length === 0 ? (
              <Empty description={t('ai_sql_empty')} style={{ paddingTop: 40 }} />
            ) : (
              <List
                dataSource={conversations}
                renderItem={(conv) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: selectedConv?.id === conv.id ? '#e6f4ff' : 'transparent',
                      borderRadius: 6,
                    }}
                    onClick={() => setSelectedConv(conv)}
                    actions={[
                      <Popconfirm
                        key="del"
                        title={t('ai_sql_delete_confirm')}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDelete(conv.id);
                        }}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text ellipsis={{ tooltip: conv.title }}>{conv.title}</Text>}
                      description={
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {new Date(conv.updatedAt).toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN')}
                          </Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{conv.databaseType}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Spin>
        </Col>

        {/* 右侧：对话内容 */}
        <Col span={17} style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingLeft: 16 }}>
          {!selectedConv ? (
            <Empty description={t('ai_sql_select')} style={{ paddingTop: 80 }} />
          ) : (
            <>
              {/* 对话标题与操作 */}
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: 15 }}>{selectedConv.title}</Text>
                <Popconfirm title={t('ai_sql_clear_confirm')} onConfirm={handleClearContext}>
                  <Button size="small" icon={<ClearOutlined />}>
                    {t('ai_sql_clear_context')}
                  </Button>
                </Popconfirm>
              </div>

              {/* 消息列表 */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
                {localMessages.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                    <RobotOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                    <div>{t('ai_sql_input_placeholder')}</div>
                  </div>
                )}
                {localMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: 16,
                      display: 'flex',
                      flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: msg.role === 'user' ? '70%' : '100%',
                        padding: msg.role === 'user' ? '10px 16px' : 0,
                        background: msg.role === 'user' ? '#e6f4ff' : 'transparent',
                        borderRadius: msg.role === 'user' ? 8 : 0,
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      }}
                    >
                      {msg.role === 'user' ? (
                        <Text>{msg.content}</Text>
                      ) : (
                        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                          {/* SQL 区域 */}
                          {msg.sql !== undefined && msg.sql !== '' && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <Text strong style={{ fontSize: 13 }}>SQL</Text>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  onClick={() => handleCopy(msg.sql || '')}
                                >
                                  {t('ai_sql_copy')}
                                </Button>
                              </div>
                              <Input.TextArea
                                value={msg.sql}
                                onChange={(e) => handleSqlChange(idx, e.target.value)}
                                autoSize={{ minRows: 2, maxRows: 15 }}
                                style={{ fontFamily: 'monospace', fontSize: 13 }}
                              />
                            </div>
                          )}
                          {/* 说明区域 */}
                          {msg.explanation && (
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>{t('ai_sql_explanation')}：</Text>
                              <Paragraph style={{ fontSize: 13, margin: '4px 0 0' }}>{msg.explanation}</Paragraph>
                            </div>
                          )}
                          {/* 降级情况：只有 content，无 SQL */}
                          {!msg.sql && !msg.explanation && msg.content && (
                            <div>
                              <Input.TextArea
                                value={msg.content}
                                onChange={(e) => handleSqlChange(idx, e.target.value)}
                                autoSize={{ minRows: 2, maxRows: 15 }}
                                style={{ fontFamily: 'monospace', fontSize: 13 }}
                              />
                              <div style={{ marginTop: 4 }}>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  onClick={() => handleCopy(msg.content)}
                                >
                                  {t('ai_sql_copy')}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ textAlign: 'center', padding: 16 }}>
                    <Spin tip={t('ai_sql_generating')} />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 输入区域 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <Input.TextArea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t('ai_sql_input_placeholder')}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={loading}
                  style={{ flex: 1 }}
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
            </>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default AiSqlTab;