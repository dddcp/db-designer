import React, { useState, useEffect } from 'react';
import { getAllDataTypes } from '../../data-types';
import type { DataTypeOption } from '../../data-types';
import type { TableDef } from '../../types';
import { callAiApi } from './ai-design-modal';
import type { GeneratedColumn, GeneratedTable } from './ai-design-modal';
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

interface AiModifyTableModalProps {
  open: boolean;
  onCancel: () => void;
  selectedTable: TableDef;
  onTableModified: (table: GeneratedTable) => void;
}

const buildModifySystemPrompt = (table: TableDef, typeNames: string[]) => {
  const columnsDesc = table.columns
    .sort((a, b) => a.order - b.order)
    .map(col => {
      const parts = [`名称: ${col.name}`, `中文名: ${col.displayName}`, `类型: ${col.type}`];
      if (col.length) parts.push(`长度: ${col.length}`);
      parts.push(`可空: ${col.nullable ? '是' : '否'}`);
      parts.push(`主键: ${col.primaryKey ? '是' : '否'}`);
      parts.push(`自增: ${col.autoIncrement ? '是' : '否'}`);
      if (col.defaultValue) parts.push(`默认值: ${col.defaultValue}`);
      if (col.comment) parts.push(`说明: ${col.comment}`);
      return `  - ${parts.join(', ')}`;
    })
    .join('\n');

  return `你是一个专业的数据库架构师。用户会描述对现有表的修改需求，你需要返回修改后的完整表结构。

当前表信息：
- 表名: ${table.name}
- 中文名: ${table.displayName}
- 现有字段:
${columnsDesc}

要求：
1. 输出必须是合法 JSON 对象（不是数组），不要包含任何其他文本、markdown标记或代码块标记
2. 返回修改后的完整表结构，包含 name、displayName、columns 数组
3. 字段类型只能从以下枚举中选择：${typeNames.join(', ')}
4. 保持用户未提及的字段不变
5. varchar 类型请给出合理的 length 值
6. 保持原有主键设置不变，除非用户明确要求修改

输出格式示例：
{
  "name": "${table.name}",
  "displayName": "${table.displayName}",
  "columns": [
    { "name": "id", "displayName": "主键ID", "type": "int", "nullable": false, "primaryKey": true, "autoIncrement": true },
    { "name": "new_field", "displayName": "新字段", "type": "varchar", "length": 50, "nullable": true, "primaryKey": false, "autoIncrement": false }
  ]
}`;
};

const AiModifyTableModal: React.FC<AiModifyTableModalProps> = ({ open, onCancel, selectedTable, onTableModified }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedTable, setGeneratedTable] = useState<GeneratedTable | null>(null);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);

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
      const typeNames = dataTypes.map(t => t.value);
      const systemPrompt = buildModifySystemPrompt(selectedTable, typeNames);
      const jsonStr = await callAiApi(systemPrompt, prompt);
      const parsed = JSON.parse(jsonStr);

      // 兼容对象和数组（取第一个）
      const tableObj = Array.isArray(parsed) ? parsed[0] : parsed;

      if (!tableObj || !tableObj.columns) {
        throw new Error('AI返回的数据格式不正确，请重试');
      }

      const normalized: GeneratedTable = {
        name: tableObj.name,
        displayName: tableObj.displayName,
        columns: tableObj.columns.map((col: any) => ({
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
      };

      setGeneratedTable(normalized);
      message.success('成功生成修改方案');
    } catch (error: any) {
      console.error('AI生成失败:', error);
      message.error('AI生成失败: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteColumn = (colName: string) => {
    if (!generatedTable) return;
    setGeneratedTable({
      ...generatedTable,
      columns: generatedTable.columns.filter(c => c.name !== colName)
    });
  };

  const handleColumnChange = (colName: string, field: string, value: any) => {
    if (!generatedTable) return;
    setGeneratedTable({
      ...generatedTable,
      columns: generatedTable.columns.map(c => {
        if (c.name !== colName) return c;
        return { ...c, [field]: value };
      })
    });
  };

  const handleConfirm = () => {
    if (!generatedTable) {
      message.warning('没有可用的数据');
      return;
    }
    onTableModified(generatedTable);
    setPrompt('');
    setGeneratedTable(null);
  };

  const handleClose = () => {
    setPrompt('');
    setGeneratedTable(null);
    onCancel();
  };

  const colColumns = [
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
            onChange={(val) => handleColumnChange(record.name, 'type', val)}
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
            onChange={(checked) => handleColumnChange(record.name, 'nullable', !checked)}
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
          onClick={() => handleDeleteColumn(record.name)}
        />
      )
    }
  ];

  const tableItems = generatedTable ? [{
    key: generatedTable.name,
    label: (
      <Space>
        <Text strong>{generatedTable.displayName}</Text>
        <Text type="secondary">({generatedTable.name})</Text>
        <Tag>{generatedTable.columns.length} 个字段</Tag>
      </Space>
    ),
    children: (
      <Table
        dataSource={generatedTable.columns}
        columns={colColumns}
        pagination={false}
        rowKey="name"
        size="small"
      />
    )
  }] : [];

  return (
    <Drawer
      title={
        <Space>
          <RobotOutlined />
          {`AI 修改表结构 - ${selectedTable.displayName}(${selectedTable.name})`}
        </Space>
      }
      open={open}
      onClose={handleClose}
      width={900}
      footer={
        generatedTable ? (
          <Space>
            <Button onClick={handleClose}>取消</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={handleConfirm}>
              确认修改
            </Button>
          </Space>
        ) : null
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Text strong>需求描述</Text>
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="请描述对表的修改需求..."
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
          {loading ? 'AI 生成中...' : '生成修改方案'}
        </Button>

        {loading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin tip="正在调用AI生成修改方案，请稍候..." />
          </div>
        )}

        {generatedTable && (
          <Collapse
            defaultActiveKey={[generatedTable.name]}
            items={tableItems}
          />
        )}
      </Space>
    </Drawer>
  );
};

export default AiModifyTableModal;
