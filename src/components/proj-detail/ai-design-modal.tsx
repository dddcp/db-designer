import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getAllDataTypes } from '../../data-types';
import type { DataTypeOption } from '../../data-types';
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
  comment?: string;
}

export interface GeneratedTable {
  name: string;
  displayName: string;
  columns: GeneratedColumn[];
}

interface AiDesignModalProps {
  open: boolean;
  onCancel: () => void;
  onTablesGenerated: (tables: GeneratedTable[]) => void;
}

const buildSystemPrompt = (databaseType: string, typeNames: string[]) => `你是一个专业的数据库架构师。用户会用自然语言描述需求，你需要设计完整的数据库表结构。

要求：
1. 输出必须是合法 JSON 数组，不要包含任何其他文本、markdown标记或代码块标记
2. 每个表包含 name（英文蛇形命名）、displayName（中文名称）、columns 数组
3. 字段类型只能从以下枚举中选择：${typeNames.join(', ')}
4. 每张表必须有一个主键字段，标记 primaryKey: true
5. 数据库类型为 ${databaseType}，请根据该数据库的命名惯例设计
6. varchar 类型请给出合理的 length 值
7. 每张表应包含 created_at 和 updated_at 时间字段

输出格式示例：
[
  {
    "name": "users",
    "displayName": "用户表",
    "columns": [
      { "name": "id", "displayName": "主键ID", "type": "int", "nullable": false, "primaryKey": true, "autoIncrement": true },
      { "name": "username", "displayName": "用户名", "type": "varchar", "length": 50, "nullable": false, "primaryKey": false, "autoIncrement": false },
      { "name": "created_at", "displayName": "创建时间", "type": "datetime", "nullable": false, "primaryKey": false, "autoIncrement": false }
    ]
  }
]`;

const AiDesignModal: React.FC<AiDesignModalProps> = ({ open, onCancel, onTablesGenerated }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedTables, setGeneratedTables] = useState<GeneratedTable[]>([]);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);
  const [databaseType, setDatabaseType] = useState<string>('mysql');

  useEffect(() => {
    getAllDataTypes().then(setDataTypes);
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      message.warning('请输入需求描述');
      return;
    }

    setLoading(true);
    try {
      const allSettings = await invoke<{ [key: string]: string }>('get_all_settings');
      const baseUrl = allSettings['ai_base_url'];
      const apiKey = allSettings['ai_api_key'];
      const model = allSettings['ai_model'];

      if (!baseUrl || !apiKey || !model) {
        message.error('请先在设置页面配置AI参数（API地址、API Key、模型名称）');
        return;
      }

      const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
      const typeNames = dataTypes.map(t => t.value);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: buildSystemPrompt(databaseType, typeNames) },
            { role: 'user', content: prompt }
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

      // Extract JSON from response (handle possible markdown code blocks)
      let jsonStr = content.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      const tables: GeneratedTable[] = JSON.parse(jsonStr);

      // Validate and normalize
      if (!Array.isArray(tables) || tables.length === 0) {
        throw new Error('AI返回的数据格式不正确，请重试');
      }

      const normalizedTables = tables.map(table => ({
        name: table.name,
        displayName: table.displayName,
        columns: table.columns.map(col => ({
          name: col.name,
          displayName: col.displayName,
          type: typeNames.includes(col.type) ? col.type : 'varchar',
          length: col.length,
          nullable: col.nullable ?? true,
          primaryKey: col.primaryKey ?? false,
          autoIncrement: col.autoIncrement ?? false,
          defaultValue: col.defaultValue,
          comment: col.comment
        }))
      }));

      setGeneratedTables(normalizedTables);
      message.success(`成功生成 ${normalizedTables.length} 张表`);
    } catch (error: any) {
      console.error('AI生成失败:', error);
      message.error('AI生成失败: ' + (error.message || error));
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
      message.warning('没有可创建的表');
      return;
    }
    onTablesGenerated(generatedTables);
    // Reset state
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
      title: '字段名',
      dataIndex: 'name',
      key: 'name',
      width: 130,
      render: (text: string) => <Text code>{text}</Text>
    },
    {
      title: '中文名',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 120,
    },
    {
      title: '类型',
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
            {dataTypes.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
          </Select>
          {record.length && <Text type="secondary">({record.length})</Text>}
        </Space>
      )
    },
    {
      title: '属性',
      key: 'props',
      width: 200,
      render: (_: any, record: GeneratedColumn) => (
        <Space size={4}>
          {record.primaryKey && <Tag color="blue">主键</Tag>}
          {record.autoIncrement && <Tag color="cyan">自增</Tag>}
          <Switch
            checked={!record.nullable}
            size="small"
            checkedChildren="非空"
            unCheckedChildren="可空"
            onChange={(checked) => handleColumnChange(tableName, record.name, 'nullable', !checked)}
          />
        </Space>
      )
    },
    {
      title: '操作',
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
      title={<Space><RobotOutlined /> AI 自动设计表结构</Space>}
      open={open}
      onClose={handleClose}
      width={900}
      footer={
        generatedTables.length > 0 ? (
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={handleConfirm}>
              确认创建 ({generatedTables.length} 张表)
            </Button>
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>数据库类型(仅让AI做命名参考)</Text>
          <Select
            style={{ width: '100%', marginTop: 4 }}
            value={databaseType}
            onChange={setDatabaseType}
          >
            <Option value="mysql">MySQL</Option>
            <Option value="postgresql">PostgreSQL</Option>
          </Select>
        </div>
        <div>
          <Text strong>需求描述</Text>
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="请描述你的需求，例如：设计一个电商系统，包含用户、商品、订单、购物车等模块"
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
          {loading ? 'AI 生成中...' : '生成表结构'}
        </Button>

        {loading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin tip="正在调用AI生成表结构，请稍候..." />
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
                  <Tag>{table.columns.length} 个字段</Tag>
                </Space>
              ),
              extra: (
                <Popconfirm
                  title="确定删除此表吗？"
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
