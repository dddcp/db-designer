import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Col,
  Empty,
  Form,
  Input,
  List,
  message,
  Modal,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { callAiApi } from './ai-design-modal';
import type { AiReview, AiReviewIssue, AiReviewResult } from '../../types';
import type { TableDef } from '../../types';
import type { Project } from '../../types';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface AiReviewTabProps {
  project: Project;
  tables: TableDef[];
}

/** 将 level 映射为 Ant Design Tag 颜色 */
function levelColor(level: AiReviewIssue['level']): string {
  if (level === 'error') return 'red';
  if (level === 'warning') return 'orange';
  return 'blue';
}

/** 将 level 映射为可读标签 */
function levelLabel(level: AiReviewIssue['level'], t: (key: string) => string): string {
  if (level === 'error') return t('ai_review_level_critical');
  if (level === 'warning') return t('ai_review_level_warning');
  return t('ai_review_level_suggestion');
}

/** 按 scope 分组 issues */
function groupByScope(issues: AiReviewIssue[], t: (key: string) => string): Record<string, AiReviewIssue[]> {
  return issues.reduce<Record<string, AiReviewIssue[]>>((acc, issue) => {
    const key = issue.scope || t('ai_review_scope_default');
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {});
}

/** 将表结构序列化为 prompt 描述文本 */
function serializeTables(tables: TableDef[]): string {
  return tables
    .map((t) => {
      const cols = t.columns
        .map(
          (c) =>
            `  - ${c.name}（${c.displayName}）: ${c.type}${c.length ? `(${c.length})` : ''}${c.nullable ? '' : ' NOT NULL'}${c.primaryKey ? ' PRIMARY KEY' : ''}${c.autoIncrement ? ' AUTO_INCREMENT' : ''}${c.comment ? ` -- ${c.comment}` : ''}`
        )
        .join('\n');
      return `### 表 ${t.name}（${t.displayName}）\n${cols}`;
    })
    .join('\n\n');
}

const AiReviewTab: React.FC<AiReviewTabProps> = ({ project, tables }) => {
  const { t, i18n } = useTranslation();
  const [reviews, setReviews] = useState<AiReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<AiReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [form] = Form.useForm();

  // 加载历史评审列表
  const loadReviews = async () => {
    setLoading(true);
    try {
      const list = await invoke<AiReview[]>('get_ai_reviews', { projectId: project.id });
      setReviews(list);
      if (list.length > 0 && !selectedReview) {
        setSelectedReview(list[0]);
      }
    } catch (e) {
      message.error(t('ai_review_load_fail') + ': ' + e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [project.id]);

  // 发起新评审
  const handleStartReview = async () => {
    if (tables.length === 0) {
      message.warning(t('ai_review_no_tables'));
      return;
    }
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    const values = form.getFieldsValue();
    const title = values.title?.trim() || t('ai_review_title_placeholder', { date: new Date().toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN') });
    const background = values.background?.trim() || '';

    setReviewing(true);
    try {
      // 读取通用提示词
      const allSettings = await invoke<Record<string, string>>('get_local_settings');
      const commonPrompt = allSettings['ai_design_common_prompt'] || '';

      const systemPrompt = `你是一个专业的数据库设计审查专家。请对用户提供的数据库表结构进行全面评审，发现潜在问题并给出改进建议。

${commonPrompt ? `用户通用设计规范：\n${commonPrompt}\n\n` : ''}请以 JSON 格式返回评审结果，格式如下：
{
  "summary": "评审摘要，简要说明发现了哪些问题",
  "issues": [
    {
      "level": "error" | "warning" | "suggestion",
      "scope": "表名 或 '项目整体'",
      "title": "问题标题",
      "detail": "详细说明与建议"
    }
  ]
}

level 说明：
- error: 严重问题，必须修复（如缺少主键、数据类型选择严重不当）
- warning: 警告，建议修复（如缺少审计字段、索引建议）
- suggestion: 建议，可选优化（如命名规范、注释完善）`;

      const tableText = serializeTables(tables);
      const userPrompt = `请对以下数据库表结构进行评审（共 ${tables.length} 张表）：

${tableText}

${background ? `业务背景：\n${background}` : ''}`;

      const rawResult = await callAiApi(systemPrompt, userPrompt);

      // 尝试解析 JSON，失败时降级为原始文本作为 summary
      let resultStr: string;
      try {
        const parsed: AiReviewResult = JSON.parse(rawResult);
        resultStr = JSON.stringify(parsed);
      } catch {
        resultStr = JSON.stringify({ summary: rawResult, issues: [] } as AiReviewResult);
      }

      const saved = await invoke<AiReview>('save_ai_review', {
        projectId: project.id,
        title,
        result: resultStr,
      });

      setReviews((prev) => [saved, ...prev]);
      setSelectedReview(saved);
      setModalVisible(false);
      form.resetFields();
      message.success(t('ai_review_done'));
    } catch (e) {
      message.error(t('ai_review_fail') + ': ' + e);
    } finally {
      setReviewing(false);
    }
  };

  // 删除评审记录
  const handleDelete = async (id: number) => {
    try {
      await invoke('delete_ai_review', { id });
      const newList = reviews.filter((r) => r.id !== id);
      setReviews(newList);
      if (selectedReview?.id === id) {
        setSelectedReview(newList.length > 0 ? newList[0] : null);
      }
      message.success(t('delete_success'));
    } catch (e) {
      message.error(t('delete_fail') + ': ' + e);
    }
  };

  // 解析当前选中评审的结果
  const parsedResult: AiReviewResult | null = (() => {
    if (!selectedReview) return null;
    try {
      return JSON.parse(selectedReview.result) as AiReviewResult;
    } catch {
      return { summary: selectedReview.result, issues: [] };
    }
  })();

  const grouped = parsedResult ? groupByScope(parsedResult.issues, t) : {};

  return (
    <div style={{ padding: 24, height: '100%' }}>
      {/* 顶部操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          {t('ai_review_title')}
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleStartReview}
          disabled={tables.length === 0}
          title={tables.length === 0 ? t('ai_review_no_tables') : ''}
        >
          {t('ai_review_new')}
        </Button>
      </div>

      <Row gutter={16} style={{ height: 'calc(100% - 56px)' }}>
        {/* 左侧：历史记录列表 */}
        <Col span={7} style={{ height: '100%', overflowY: 'auto', borderRight: '1px solid #f0f0f0' }}>
          <Spin spinning={loading}>
            {reviews.length === 0 ? (
              <Empty description={t('ai_review_empty')} style={{ paddingTop: 40 }} />
            ) : (
              <List
                dataSource={reviews}
                renderItem={(review) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      padding: '10px 12px',
                      background: selectedReview?.id === review.id ? '#e6f4ff' : 'transparent',
                      borderRadius: 6,
                    }}
                    onClick={() => setSelectedReview(review)}
                    actions={[
                      <Popconfirm
                        key="del"
                        title={t('ai_review_delete_confirm')}
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDelete(review.id);
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
                      title={<Text ellipsis={{ tooltip: review.title }}>{review.title}</Text>}
                      description={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(review.created_at).toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN')}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            )}
          </Spin>
        </Col>

        {/* 右侧：评审详情 */}
        <Col span={17} style={{ height: '100%', overflowY: 'auto', paddingLeft: 16 }}>
          {!selectedReview ? (
            <Empty description={t('ai_review_select')} style={{ paddingTop: 80 }} />
          ) : parsedResult ? (
            <div>
              <Title level={5}>{selectedReview.title}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(selectedReview.created_at).toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN')}
              </Text>

              {parsedResult.summary && (
                <div style={{ margin: '12px 0', padding: '12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                  <Text strong>{t('ai_review_summary')}</Text>
                  <Paragraph style={{ margin: '4px 0 0' }}>{parsedResult.summary}</Paragraph>
                </div>
              )}

              {parsedResult.issues.length === 0 ? (
                <Empty description={t('ai_review_no_issues')} style={{ marginTop: 40 }} />
              ) : (
                Object.entries(grouped).map(([scope, issues]) => (
                  <div key={scope} style={{ marginTop: 16 }}>
                    <Title level={5} style={{ margin: '0 0 8px' }}>
                      📋 {scope}
                    </Title>
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                      {issues.map((issue, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '10px 14px',
                            border: '1px solid #f0f0f0',
                            borderRadius: 6,
                            background: '#fff',
                          }}
                        >
                          <Space>
                            <Tag color={levelColor(issue.level)}>{levelLabel(issue.level, t)}</Tag>
                            <Text strong>{issue.title}</Text>
                          </Space>
                          <Paragraph style={{ margin: '6px 0 0', color: '#595959' }}>
                            {issue.detail}
                          </Paragraph>
                        </div>
                      ))}
                    </Space>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </Col>
      </Row>

      {/* 新建评审 Modal */}
      <Modal
        title={t('ai_review_new_title')}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          if (!reviewing) {
            setModalVisible(false);
            form.resetFields();
          }
        }}
        confirmLoading={reviewing}
        okText={t('ai_review_start')}
        cancelText={t('cancel')}
        width={520}
      >
        <Spin spinning={reviewing} tip={t('ai_review_reviewing')}>
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="title" label={t('ai_review_title_label')}>
              <Input placeholder={t('ai_review_title_placeholder', { date: new Date().toLocaleString(i18n.language === 'en-US' ? 'en-US' : 'zh-CN') })} />
            </Form.Item>
            <Form.Item name="background" label={t('ai_review_context_label')}>
              <TextArea
                rows={4}
                placeholder={t('ai_review_context_placeholder')}
              />
            </Form.Item>
            <Text type="secondary">
              {t('ai_review_tables_info', { count: tables.length })}
            </Text>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};

export default AiReviewTab;