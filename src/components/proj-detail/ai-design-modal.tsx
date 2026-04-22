import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { getAllDataTypes } from '../../data-types';
import type { DataTypeOption } from '../../data-types';
import type { DatabaseTypeOption, TableDef, IndexDef } from '../../types';
import {
  Drawer,
  Input,
  Button,
  Table,
  Collapse,
  Space,
  Tag,
  message,
  Spin,
  Typography,
  Popconfirm,
  Select,
  Switch
} from 'antd';
import {
  DeleteOutlined,
  RobotOutlined,
  CheckOutlined
} from '@ant-design/icons';

const { TextArea } = Input;
const { Text } = Typography;
const { Option } = Select;

export interface GeneratedColumn {
  name: string;
  displayName: string;
  type: string;
  length?: number;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  defaultNull?: boolean;
  comment?: string;
}

export interface GeneratedTable {
  name: string;
  displayName: string;
  columns: GeneratedColumn[];
}

/**
 * 封装 AI API 调用：读取 settings → 构建请求 → 发送 fetch → 提取 content → 剥离 markdown 代码块 → 返回纯 JSON 字符串
 */
export async function callAiApi(systemPrompt: string, userPrompt: string): Promise<string> {
  const allSettings = await invoke<{ [key: string]: string }>('get_local_settings');
  const baseUrl = allSettings['ai_base_url'];
  const apiKey = allSettings['ai_api_key'];
  const model = allSettings['ai_model'];

  if (!baseUrl || !apiKey || !model) {
    throw new Error('请先在设置页面配置AI参数（API地址、API Key、模型名称）');
  }

  // 标准化 URL：追加 /v1/chat/completions，确保 baseUrl 末尾没有冗余斜杠
  const url = baseUrl
          .replace(/\/+$/, '')                    // 移除末尾斜杠
          .replace(/\/chat\/completions$/, '')    // 移除已有的 chat/completions
          .replace(/(\/v1)(\/.*)?$/, '$1')        // 保留 /v1，移除其后路径
      + (baseUrl.includes('/v1') ? '' : '/v1') // 如果没有 /v1 则添加
      + '/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API请求失败 (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content || '';

  let jsonStr = content.trim();
  // 剥离 markdown 代码块
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  // 剥离 <think>/<thinking> 标签（如 模型的思考过程）
  jsonStr = jsonStr.replace(/<(think|thinking)>[\s\S]*?<\/\1>/gi, '').trim();
  // 如果仍不是 JSON 开头，尝试在文本中查找 JSON 数组或对象
  if (!jsonStr.startsWith('[') && !jsonStr.startsWith('{')) {
    const arrayStart = jsonStr.indexOf('[');
    const objectStart = jsonStr.indexOf('{');
    const startCandidates = [arrayStart, objectStart].filter(index => index !== -1);

    if (startCandidates.length > 0) {
      const start = Math.min(...startCandidates);
      const arrayEnd = jsonStr.lastIndexOf(']');
      const objectEnd = jsonStr.lastIndexOf('}');
      const end = Math.max(arrayEnd, objectEnd);

      if (end > start) {
        jsonStr = jsonStr.slice(start, end + 1).trim();
      }
    }
  }

  return jsonStr;
}

interface AiDesignModalProps {
  open: boolean;
  onCancel: () => void;
  onTablesGenerated: (tables: GeneratedTable[]) => void;
  tables: TableDef[];
}

/** 已有表的索引+元数据快照，用于 AI 上下文 */
interface TableContext {
  table: TableDef;
  indexes: IndexDef[];
  initDataSample: Record<string, any>[]; // 最多取几条元数据做示例
}

/**
 * 将已有项目上下文精简为 prompt 片段
 */
function buildExistingContext(contexts: TableContext[]): string {
  if (contexts.length === 0) return '';

  const lines: string[] = ['以下是项目中已有的表结构，请在设计新表时充分考虑与这些表的关联关系、命名风格、字段规范保持一致，避免重复建表：', ''];

  for (const ctx of contexts) {
    const { table, indexes, initDataSample } = ctx;
    lines.push(`### ${table.displayName} (${table.name})`);

    // 字段
    lines.push('字段:');
    for (const col of table.columns) {
      const attrs: string[] = [];
      if (col.primaryKey) attrs.push('主键');
      if (col.autoIncrement) attrs.push('自增');
      if (!col.nullable) attrs.push('非空');
      if (col.defaultValue) attrs.push(`默认=${col.defaultValue}`);
      const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
      const commentStr = col.comment ? ` -- ${col.comment}` : '';
      lines.push(`  - ${col.name} ${col.type}${col.length ? `(${col.length})` : ''}${attrStr}${commentStr}`);
    }

    // 索引
    if (indexes.length > 0) {
      lines.push('索引:');
      for (const idx of indexes) {
        lines.push(`  - ${idx.name} (${idx.type}): [${idx.columns.join(', ')}]`);
      }
    }

    // 元数据样例（最多 3 条，让 AI 理解业务含义）
    if (initDataSample.length > 0) {
      lines.push(`元数据样例 (共 ${initDataSample.length} 条):`);
      for (const row of initDataSample.slice(0, 3)) {
        lines.push(`  ${JSON.stringify(row)}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

const buildSystemPrompt = (
  databaseType: string,
  typeNames: string[],
  existingContext: string,
  commonPrompt: string,
) => {
  let prompt = `你是一个专业的数据库架构师。用户会用自然语言描述需求，你需要设计完整的数据库表结构。

要求（必须严格遵守，仅输出 JSON，不要输出任何其他文字、解释或markdown标记）：
1. 只输出一个合法的 JSON 数组，不要包含任何其他文本、markdown标记或代码块标记
2. 每个表包含 name（英文蛇形命名）、displayName（中文名称）、columns 数组
3. 字段类型只能从以下枚举中选择：${typeNames.join(', ')}
4. 每张表必须有一个主键字段，标记 primaryKey: true
5. 数据库类型为 ${databaseType}，请根据该数据库的命名惯例设计
6. varchar 类型请给出合理的 length 值
7. 每张表应包含 created_at 和 updated_at 时间字段
8. 不要重复设计已有的表，新表如需关联已有表请通过字段命名体现关联关系（如 user_id 关联 users 表）

只输出 JSON 数组，不要有任何前缀或后缀文字。例如：
[{"name":"users","displayName":"用户表","columns":[{"name":"id","displayName":"主键ID","type":"int","nullable":false,"primaryKey":true,"autoIncrement":true}]}]`;

  if (commonPrompt.trim()) {
    prompt += `\n\n用户提供了以下默认设计偏好，请在不违背业务需求的前提下尽量遵循：\n${commonPrompt.trim()}`;
  }

  if (existingContext) {
    prompt += '\n\n' + existingContext;
  }

  return prompt;
};

const AiDesignModal: React.FC<AiDesignModalProps> = ({ open, onCancel, onTablesGenerated, tables }) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedTables, setGeneratedTables] = useState<GeneratedTable[]>([]);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);
  const [databaseType, setDatabaseType] = useState<string>('mysql');
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);
  const [tableContexts, setTableContexts] = useState<TableContext[]>([]);

  useEffect(() => {
    getAllDataTypes().then(setDataTypes);
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  // Drawer 打开时加载已有表的索引和元数据
  useEffect(() => {
    if (!open || tables.length === 0) {
      setTableContexts([]);
      return;
    }
    loadTableContexts();
  }, [open, tables]);

  const loadTableContexts = async () => {
    try {
      const contexts: TableContext[] = await Promise.all(
        tables.map(async (table) => {
          // 加载索引
          const backendIndexes = await invoke<Array<{
            id: string; table_id: string; name: string; index_type: string; comment?: string;
            fields: Array<{ column_id: string; sort_order: number }>;
          }>>('get_table_indexes', { tableId: table.id });

          const indexes: IndexDef[] = backendIndexes.map(idx => ({
            id: idx.id,
            name: idx.name,
            type: idx.index_type as IndexDef['type'],
            comment: idx.comment,
            columns: idx.fields
              .sort((a, b) => a.sort_order - b.sort_order)
              .map(f => {
                const col = table.columns.find(c => c.id === f.column_id);
                return col ? col.name : f.column_id;
              }),
          }));

          // 加载元数据（最多取 3 条做样例）
          const initRows = await invoke<Array<{ id: number; table_id: string; data: string; created_at: string }>>(
            'get_init_data',
            { tableId: table.id }
          );
          const initDataSample = initRows.slice(0, 3).map(item => {
            try { return JSON.parse(item.data); } catch { return {}; }
          });

          return { table, indexes, initDataSample };
        })
      );
      setTableContexts(contexts);
    } catch (error) {
      console.error('加载项目上下文失败:', error);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      message.warning(t('ai_design_input_required'));
      return;
    }

    setLoading(true);
    try {
      const typeNames = dataTypes.map(dt => dt.value);
      const allSettings = await invoke<{ [key: string]: string }>('get_local_settings');
      const commonPrompt = allSettings['ai_design_common_prompt'] || '';
      const existingContext = buildExistingContext(tableContexts);
      const systemPrompt = buildSystemPrompt(databaseType, typeNames, existingContext, commonPrompt);
      const jsonStr = await callAiApi(systemPrompt, prompt);
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error(t('ai_design_invalid_format'));
      }

      if (parsed.length === 0 || !parsed[0].columns) {
        throw new Error(t('ai_design_invalid_format'));
      }

      const normalizedTables = parsed.map(table => ({
        name: table.name,
        displayName: table.displayName,
        columns: table.columns.map((col: any) => ({
          name: col.name,
          displayName: col.displayName,
          type: typeNames.includes(col.type) ? col.type : 'varchar',
          length: col.length,
          nullable: col.nullable ?? true,
          primaryKey: col.primaryKey ?? false,
          autoIncrement: col.autoIncrement ?? false,
          defaultValue: col.defaultValue != null ? String(col.defaultValue) : undefined,
          defaultNull: false,
          comment: col.comment != null ? String(col.comment) : undefined
        }))
      }));

      setGeneratedTables(normalizedTables);
      message.success(t('ai_design_success', { count: normalizedTables.length }));
    } catch (error: any) {
      console.error('AI生成失败:', error);
      message.error(t('ai_design_fail') + ': ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTable = (tableName: string) => {
    setGeneratedTables(prev => prev.filter(t => t.name !== tableName));
  };

  const handleDeleteColumn = (tableName: string, colName: string) => {
    setGeneratedTables(prev => prev.map(t => {
      if (t.name !== tableName) return t;
      return { ...t, columns: t.columns.filter(c => c.name !== colName) };
    }));
  };

  const handleColumnChange = (tableName: string, colName: string, field: string, value: any) => {
    setGeneratedTables(prev => prev.map(t => {
      if (t.name !== tableName) return t;
      return {
        ...t,
        columns: t.columns.map(c => {
          if (c.name !== colName) return c;
          return { ...c, [field]: value };
        })
      };
    }));
  };

  const handleConfirm = () => {
    if (generatedTables.length === 0) {
      message.warning(t('ai_design_no_data'));
      return;
    }
    onTablesGenerated(generatedTables);
    setPrompt('');
    setGeneratedTables([]);
  };

  const handleClose = () => {
    setPrompt('');
    setGeneratedTables([]);
    onCancel();
  };

  const colColumns = (tableName: string) => [
    {
      title: t('col_name'),
      dataIndex: 'name',
      key: 'name',
      width: 130,
      render: (text: string) => <Text code>{text}</Text>
    },
    {
      title: t('col_display_name'),
      dataIndex: 'displayName',
      key: 'displayName',
      width: 120,
    },
    {
      title: t('col_data_type'),
      key: 'type',
      width: 140,
      render: (_: any, record: GeneratedColumn) => (
        <Space size={4}>
          <Select
            value={record.type}
            size="small"
            style={{ width: 110 }}
            showSearch
            optionFilterProp="children"
            onChange={(val) => handleColumnChange(tableName, record.name, 'type', val)}
          >
            {dataTypes.map(dt => <Option key={dt.value} value={dt.value}>{dt.label}</Option>)}
          </Select>
          {record.length && <Text type="secondary">({record.length})</Text>}
        </Space>
      )
    },
    {
      title: t('col_attribute'),
      key: 'props',
      width: 200,
      render: (_: any, record: GeneratedColumn) => (
        <Space size={4}>
          {record.primaryKey && <Tag color="blue">{t('col_primary_key')}</Tag>}
          {record.autoIncrement && <Tag color="cyan">{t('col_auto_increment')}</Tag>}
          <Switch
            checked={!record.nullable}
            size="small"
            checkedChildren={t('col_not_null')}
            unCheckedChildren="NULL"
            onChange={(checked) => handleColumnChange(tableName, record.name, 'nullable', !checked)}
          />
        </Space>
      )
    },
    {
      title: t('col_action'),
      key: 'action',
      width: 60,
      render: (_: any, record: GeneratedColumn) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteColumn(tableName, record.name)}
        />
      )
    }
  ];

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          {t('ai_design_title')}
        </Space>
      }
      open={open}
      onClose={handleClose}
      width={900}
      footer={
        generatedTables.length > 0 ? (
          <Space>
            <Button onClick={handleClose}>{t('cancel')}</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={handleConfirm}>
              {t('ai_design_confirm', { count: generatedTables.length })}
            </Button>
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>{t('ai_design_db_type')}</Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={databaseType}
            onChange={setDatabaseType}
          >
            {dbTypes.map(dt => (
              <Option key={dt.value} value={dt.value}>{dt.label}</Option>
            ))}
          </Select>
        </div>
        <div>
          <Text strong>{t('ai_design_requirement')}</Text>
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('ai_design_requirement_placeholder')}
            rows={4}
            style={{ marginTop: 8 }}
          />
        </div>

        <Button
          type="primary"
          icon={<RobotOutlined />}
          onClick={handleGenerate}
          loading={loading}
          block
        >
          {loading ? t('ai_design_generating') : t('ai_design_generate')}
        </Button>

        {loading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin tip={t('ai_design_tip')} />
          </div>
        )}

        {generatedTables.length > 0 && (
          <Collapse
            defaultActiveKey={generatedTables.map(t => t.name)}
            items={generatedTables.map(table => ({
              key: table.name,
              label: (
                <Space>
                  <Text strong>{table.displayName}</Text>
                  <Text type="secondary">({table.name})</Text>
                  <Tag>{t('ai_modify_col_count', { count: table.columns.length })}</Tag>
                </Space>
              ),
              extra: (
                <Popconfirm
                  title={t('ai_design_delete_confirm')}
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    handleDeleteTable(table.name);
                  }}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              ),
              children: (
                <Table
                  dataSource={table.columns}
                  columns={colColumns(table.name)}
                  pagination={false}
                  rowKey="name"
                  size="small"
                />
              )
            }))}
          />
        )}
      </Space>
    </Drawer>
  );
};

export default AiDesignModal;
