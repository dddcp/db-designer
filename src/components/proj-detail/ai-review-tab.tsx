import React, { useEffect, useState } from 'react';
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
function levelLabel(level: AiReviewIssue['level']): string {
  if (level === 'error') return '严重';
  if (level === 'warning') return '警告';
  return '建议';
}

/** 按 scope 分组 issues */
function groupByScope(issues: AiReviewIssue[]): Record<string, AiReviewIssue[]> {
  return issues.reduce<Record<string, AiReviewIssue[]>>((acc, issue) => {
    const key = issue.scope || '项目整体';
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
      message.error('加载评审记录失败: ' + e);
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
      message.warning('项目暂无表结构，无法发起评审');
      return;
    }
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    const values = form.getFieldsValue();
    const title = values.title?.trim() || `评审 ${new Date().toLocaleString()}`;
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
      message.success('评审完成');
    } catch (e) {
      message.error('评审失败: ' + e);
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
      message.success('删除成功');
    } catch (e) {
      message.error('删除失败: ' + e);
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

  const grouped = parsedResult ? groupByScope(parsedResult.issues) : {};

  return (
    <div style={{ padding: 24, height: '100%' }}>
      {/* 顶部操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>
          <RobotOutlined style={{ marginRight: 8 }} />
          AI 评审（仅作参考，不作为最终决策依据）
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleStartReview}
          disabled={tables.length === 0}
          title={tables.length === 0 ? '项目暂无表结构，无法发起评审' : ''}
        >
          新建评审
        </Button>
      </div>

      <Row gutter={16} style={{ height: 'calc(100% - 56px)' }}>
        {/* 左侧：历史记录列表 */}
        <Col span={7} style={{ height: '100%', overflowY: 'auto', borderRight: '1px solid #f0f0f0' }}>
          <Spin spinning={loading}>
            {reviews.length === 0 ? (
              <Empty description="暂无评审记录，点击「新建评审」开始" style={{ paddingTop: 40 }} />
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
                        title="确定删除这条评审记录吗？"
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
                          {new Date(review.created_at).toLocaleString()}
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
            <Empty description="请从左侧选择一条评审记录" style={{ paddingTop: 80 }} />
          ) : parsedResult ? (
            <div>
              <Title level={5}>{selectedReview.title}</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(selectedReview.created_at).toLocaleString()}
              </Text>

              {parsedResult.summary && (
                <div style={{ margin: '12px 0', padding: '12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
                  <Text strong>评审摘要：</Text>
                  <Paragraph style={{ margin: '4px 0 0' }}>{parsedResult.summary}</Paragraph>
                </div>
              )}

              {parsedResult.issues.length === 0 ? (
                <Empty description="未发现问题" style={{ marginTop: 40 }} />
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
                            <Tag color={levelColor(issue.level)}>{levelLabel(issue.level)}</Tag>
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
        title="新建 AI 评审"
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          if (!reviewing) {
            setModalVisible(false);
            form.resetFields();
          }
        }}
        confirmLoading={reviewing}
        okText="开始评审"
        cancelText="取消"
        width={520}
      >
        <Spin spinning={reviewing} tip="AI 评审中，请稍候...">
          <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item name="title" label="评审标题（可选）">
              <Input placeholder={`评审 ${new Date().toLocaleString()}`} />
            </Form.Item>
            <Form.Item name="background" label="业务背景说明（可选）">
              <TextArea
                rows={4}
                placeholder="请描述业务背景，帮助 AI 更准确地评审设计..."
              />
            </Form.Item>
            <Text type="secondary">
              本次将对项目中共 {tables.length} 张表进行评审，AI 会结合设置中的通用提示词进行分析。
            </Text>
          </Form>
        </Spin>
      </Modal>
    </div>
  );
};

export default AiReviewTab;
