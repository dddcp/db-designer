import React, { useState } from 'react';
import {
  Drawer,
  Input,
  Button,
  Collapse,
  Space,
  Tag,
  Checkbox,
  Typography,
  Row,
  Col,
  message,
} from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { callAiApi } from './ai-design-modal';
import type { TableDef, IndexDef } from '../../types';

const { TextArea } = Input;
const { Text } = Typography;

interface AiRecommendIndexModalProps {
  open: boolean;
  onCancel: () => void;
  selectedTable: TableDef;
  tables: TableDef[];
  existingIndexes: IndexDef[];
  onIndexesCreated: (indexes: IndexDef[]) => void;
}

interface RecommendedIndex {
  name: string;
  type: 'normal' | 'unique' | 'fulltext';
  columns: string[];
  comment: string;
}

/**
 * 构建当前表的字段描述
 */
function buildColumnDesc(table: TableDef): string {
  return table.columns
    .map((col) => {
      const attrs: string[] = [];
      if (col.primaryKey) attrs.push('主键');
      if (col.autoIncrement) attrs.push('自增');
      if (!col.nullable) attrs.push('非空');
      const attrStr = attrs.length > 0 ? `, ${attrs.join('/')}` : '';
      const commentStr = col.comment ? `, 说明: ${col.comment}` : '';
      return `  - ${col.name} (${col.type}${col.length ? `(${col.length})` : ''})${attrStr}${commentStr}`;
    })
    .join('\n');
}

/**
 * 从 SQL 中识别关联表
 */
function findRelatedTables(sql: string, tables: TableDef[], currentTable: TableDef): TableDef[] {
  if (!sql.trim()) return [];
  return tables.filter((t) => {
    if (t.id === currentTable.id) return false;
    const regex = new RegExp('\\b' + t.name + '\\b', 'i');
    return regex.test(sql);
  });
}

function buildSystemPrompt(
  selectedTable: TableDef,
  existingIndexes: IndexDef[],
  sql: string,
  tables: TableDef[],
  rowCount: string,
  rwRatio: string,
  painPoint: string,
): string {
  const parts: string[] = [];

  parts.push('你是一个专业的数据库索引优化专家，根据表结构、已有索引和可选的业务信息推荐合适的索引。');
  parts.push('');

  // 当前表
  parts.push(`当前表: ${selectedTable.name} (${selectedTable.displayName})`);
  parts.push('字段列表:');
  parts.push(buildColumnDesc(selectedTable));
  parts.push('');

  // 已有索引
  parts.push('已有索引:');
  if (existingIndexes.length > 0) {
    existingIndexes.forEach((idx) => {
      parts.push(`  - ${idx.name} (${idx.type}): [${idx.columns.join(', ')}]`);
    });
  } else {
    parts.push('  暂无索引');
  }
  parts.push('');

  // SQL
  if (sql.trim()) {
    parts.push('需要优化的 SQL:');
    parts.push(sql.trim());
    parts.push('');

    // 关联表
    const relatedTables = findRelatedTables(sql, tables, selectedTable);
    if (relatedTables.length > 0) {
      parts.push('关联表（SQL 中引用的其他表）:');
      relatedTables.forEach((t) => {
        parts.push(`关联表: ${t.name} (${t.displayName})`);
        parts.push('  字段:');
        parts.push(buildColumnDesc(t));
      });
      parts.push('');
    }
  }

  // 业务背景
  const bgItems: string[] = [];
  if (rowCount.trim()) bgItems.push(`- 数据量: ${rowCount.trim()}`);
  if (rwRatio.trim()) bgItems.push(`- 读写比例: ${rwRatio.trim()}`);
  if (painPoint.trim()) bgItems.push(`- 性能痛点: ${painPoint.trim()}`);
  if (bgItems.length > 0) {
    parts.push('业务背景:');
    parts.push(bgItems.join('\n'));
    parts.push('');
  }

  // 要求
  parts.push('要求:');
  parts.push('1. 输出合法 JSON 数组，不要包含任何其他文本、markdown标记或代码块标记');
  parts.push('2. 不要推荐已存在的索引');
  parts.push('3. 每个索引包含: name(idx_开头蛇形命名), type("normal"|"unique"|"fulltext"), columns(字段名数组), comment(推荐理由)');
  parts.push('4. 只推荐当前表的索引');
  parts.push('5. 避免冗余索引（如已有联合索引覆盖的单列索引）');

  return parts.join('\n');
}

const AiRecommendIndexModal: React.FC<AiRecommendIndexModalProps> = ({
  open,
  onCancel,
  selectedTable,
  tables,
  existingIndexes,
  onIndexesCreated,
}) => {
  const [sql, setSql] = useState('');
  const [rowCount, setRowCount] = useState('');
  const [rwRatio, setRwRatio] = useState('');
  const [painPoint, setPainPoint] = useState('');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendedIndex[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const handleRecommend = async () => {
    setLoading(true);
    try {
      const systemPrompt = buildSystemPrompt(
        selectedTable,
        existingIndexes,
        sql,
        tables,
        rowCount,
        rwRatio,
        painPoint,
      );
      const jsonStr = await callAiApi(systemPrompt, '请根据以上信息推荐索引');
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('AI返回的数据格式不正确，请重试');
      }

      const recs: RecommendedIndex[] = parsed.map((item: any) => ({
        name: item.name,
        type: item.type || 'normal',
        columns: Array.isArray(item.columns) ? item.columns : [],
        comment: item.comment || '',
      }));

      setRecommendations(recs);
      setSelectedKeys(recs.map((r) => r.name));
      message.success(`AI 推荐了 ${recs.length} 个索引`);
    } catch (error: any) {
      console.error('AI推荐索引失败:', error);
      message.error('AI推荐索引失败: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (name: string, checked: boolean) => {
    setSelectedKeys((prev) =>
      checked ? [...prev, name] : prev.filter((k) => k !== name),
    );
  };

  const handleCreate = () => {
    const selected = recommendations.filter((r) => selectedKeys.includes(r.name));
    if (selected.length === 0) {
      message.warning('请至少选择一个索引');
      return;
    }

    const newIndexes: IndexDef[] = selected.map((r, idx) => ({
      id: Date.now().toString() + idx,
      name: r.name,
      type: r.type,
      columns: r.columns,
      comment: r.comment,
    }));

    onIndexesCreated(newIndexes);
  };

  const handleClose = () => {
    setSql('');
    setRowCount('');
    setRwRatio('');
    setPainPoint('');
    setRecommendations([]);
    setSelectedKeys([]);
    onCancel();
  };

  const typeMap: Record<string, { color: string; text: string }> = {
    normal: { color: 'blue', text: '普通索引' },
    unique: { color: 'green', text: '唯一索引' },
    fulltext: { color: 'orange', text: '全文索引' },
  };

  const selectedCount = recommendations.filter((r) => selectedKeys.includes(r.name)).length;

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          AI 推荐索引 - {selectedTable.displayName}({selectedTable.name})
        </Space>
      }
      open={open}
      onClose={handleClose}
      width={800}
      footer={
        recommendations.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" onClick={handleCreate}>
              创建选中索引 ({selectedCount})
            </Button>
          </div>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>问题 SQL (选填)</Text>
          <TextArea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="输入需要优化的 SQL..."
            rows={4}
            style={{ marginTop: 4 }}
          />
        </div>

        <div>
          <Text strong>业务背景与数据特征 (选填)</Text>
          <Row gutter={16} style={{ marginTop: 4 }}>
            <Col span={8}>
              <Input
                value={rowCount}
                onChange={(e) => setRowCount(e.target.value)}
                placeholder="数据量，如：100万"
              />
            </Col>
            <Col span={8}>
              <Input
                value={rwRatio}
                onChange={(e) => setRwRatio(e.target.value)}
                placeholder="读写比例，如：读多写少(8:2)"
              />
            </Col>
            <Col span={8}>
              <Input
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                placeholder="性能痛点，如：查询超过2秒"
              />
            </Col>
          </Row>
        </div>

        <Button
          type="primary"
          icon={<RobotOutlined />}
          onClick={handleRecommend}
          loading={loading}
          block
        >
          {loading ? 'AI 分析中...' : 'AI 推荐'}
        </Button>

        {recommendations.length > 0 && (
          <Collapse
            defaultActiveKey={recommendations.map((r) => r.name)}
            items={recommendations.map((rec) => {
              const typeInfo = typeMap[rec.type] || typeMap.normal;
              return {
                key: rec.name,
                label: (
                  <Space>
                    <Checkbox
                      checked={selectedKeys.includes(rec.name)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggle(rec.name, e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Text strong>{rec.name}</Text>
                    <Tag color={typeInfo.color}>{typeInfo.text}</Tag>
                    {rec.columns.map((col) => (
                      <Tag key={col} color="purple">{col}</Tag>
                    ))}
                  </Space>
                ),
                children: (
                  <Text type="secondary">{rec.comment}</Text>
                ),
              };
            })}
          />
        )}
      </Space>
    </Drawer>
  );
};

export default AiRecommendIndexModal;
