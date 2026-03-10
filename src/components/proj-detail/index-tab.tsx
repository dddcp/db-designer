import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Card,
  Button,
  Space,
  Typography,
  Table,
  Input,
  Select,
  Tag,
  message,
  Popconfirm,
  Drawer,
  Form,
  Row,
  Col
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  RobotOutlined
} from '@ant-design/icons';
import AiRecommendIndexModal from './ai-recommend-index-modal';

const { Title, Text } = Typography;
const { Option } = Select;

import type { IndexDef, TableDef } from '../../types';

interface IndexTabProps {
  selectedTable: TableDef | null;
  tables: TableDef[];
}

// 后端索引数据结构
interface BackendIndexDef {
  id: string;
  table_id: string;
  name: string;
  index_type: string;
  comment?: string;
  fields: Array<{ column_id: string; sort_order: number }>;
}

/**
 * 索引管理组件
 */
const IndexTab: React.FC<IndexTabProps> = ({ selectedTable, tables }) => {
  const [indexes, setIndexes] = useState<IndexDef[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<IndexDef | null>(null);
  const [isAiRecommendVisible, setIsAiRecommendVisible] = useState(false);
  const [form] = Form.useForm();

  // 加载索引
  useEffect(() => {
    if (selectedTable) {
      loadIndexes();
    } else {
      setIndexes([]);
    }
  }, [selectedTable?.id]);

  const loadIndexes = async () => {
    if (!selectedTable) return;
    try {
      const backendIndexes = await invoke<BackendIndexDef[]>('get_table_indexes', {
        tableId: selectedTable.id
      });
      const frontendIndexes: IndexDef[] = backendIndexes.map(idx => ({
        id: idx.id,
        name: idx.name,
        type: idx.index_type as IndexDef['type'],
        comment: idx.comment,
        columns: idx.fields
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(f => {
            const col = selectedTable.columns.find(c => c.id === f.column_id);
            return col ? col.name : f.column_id;
          })
      }));
      setIndexes(frontendIndexes);
    } catch (error) {
      console.error('加载索引失败:', error);
    }
  };

  /**
   * 将索引列表保存到后端
   */
  const saveIndexesToBackend = async (newIndexes: IndexDef[]) => {
    if (!selectedTable) return;
    try {
      const indexesData = newIndexes.map(index => ({
        id: index.id,
        table_id: selectedTable.id,
        name: index.name,
        index_type: index.type,
        comment: index.comment,
        fields: index.columns.map((columnName, i) => ({
          column_id: selectedTable.columns.find(col => col.name === columnName)?.id || '',
          sort_order: i + 1
        }))
      }));
      await invoke('save_table_indexes', {
        tableId: selectedTable.id,
        indexes: indexesData,
      });
    } catch (error) {
      console.error('保存索引失败:', error);
      message.error('保存索引失败');
    }
  };

  /**
   * 添加索引
   */
  const handleAddIndex = () => {
    if (!selectedTable) {
      message.warning('请先选择一个表');
      return;
    }
    setEditingIndex(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  /**
   * 编辑索引
   */
  const handleEditIndex = (index: IndexDef) => {
    setEditingIndex(index);
    form.setFieldsValue({
      name: index.name,
      type: index.type,
      columns: index.columns,
      comment: index.comment
    });
    setIsModalVisible(true);
  };

  /**
   * 删除索引（直接保存）
   */
  const handleDeleteIndex = async (indexId: string) => {
    const newIndexes = indexes.filter(index => index.id !== indexId);
    setIndexes(newIndexes);
    await saveIndexesToBackend(newIndexes);
    message.success('索引删除成功');
  };

  /**
   * 新建/编辑索引后保存（直接保存到后端）
   */
  const handleSaveIndex = async (values: any) => {
    const invalidColumns = values.columns.filter((columnName: string) =>
      !selectedTable?.columns.some(col => col.name === columnName)
    );

    if (invalidColumns.length > 0) {
      message.error(`以下字段不存在: ${invalidColumns.join(', ')}`);
      return;
    }

    let newIndexes: IndexDef[];
    if (editingIndex) {
      newIndexes = indexes.map(index =>
        index.id === editingIndex.id
          ? { ...index, ...values }
          : index
      );
    } else {
      const newIndex: IndexDef = {
        id: Date.now().toString(),
        ...values
      };
      newIndexes = [...indexes, newIndex];
    }

    setIndexes(newIndexes);
    setIsModalVisible(false);
    await saveIndexesToBackend(newIndexes);
    message.success(editingIndex ? '索引更新成功' : '索引创建成功');
  };

  // 索引列定义
  const indexColumns = [
    {
      title: '索引名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap = {
          normal: { color: 'blue', text: '普通索引' },
          unique: { color: 'green', text: '唯一索引' },
          fulltext: { color: 'orange', text: '全文索引' }
        };
        const config = typeMap[type as keyof typeof typeMap] || typeMap.normal;
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '包含列',
      dataIndex: 'columns',
      key: 'columns',
      render: (columns: string[]) => (
        <Space wrap>
          {columns.map(column => (
            <Tag key={column} color="purple">{column}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '说明',
      dataIndex: 'comment',
      key: 'comment',
      render: (text: string) => <Text type="secondary">{text || '-'}</Text>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (record: IndexDef) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            size="small"
            onClick={() => handleEditIndex(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此索引吗？"
            onConfirm={() => handleDeleteIndex(record.id)}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!selectedTable) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">请从左侧选择一个表开始管理索引</Text>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>索引管理</Title>
          <Space>
            <Button
              icon={<RobotOutlined />}
              onClick={() => setIsAiRecommendVisible(true)}
            >
              AI 推荐索引
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddIndex}
            >
              添加索引
            </Button>
          </Space>
        </div>

        <Table
          dataSource={indexes}
          columns={indexColumns}
          pagination={false}
          rowKey="id"
          size="middle"
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">暂无索引，点击上方按钮创建第一个索引</Text>
              </div>
            )
          }}
        />
      </Card>

      {/* 索引编辑模态框 */}
      <Drawer
        title={editingIndex ? '编辑索引' : '添加索引'}
        open={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveIndex}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="索引名称"
                rules={[{ required: true, message: '请输入索引名称' }]}
              >
                <Input placeholder="请输入索引名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label="索引类型"
                rules={[{ required: true, message: '请选择索引类型' }]}
              >
                <Select placeholder="请选择索引类型">
                  <Option value="normal">普通索引</Option>
                  <Option value="unique">唯一索引</Option>
                  <Option value="fulltext">全文索引</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="columns"
            label="包含列"
            rules={[{ required: true, message: '请选择至少一个列' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择索引包含的列"
              allowClear
            >
              {selectedTable.columns.map(column => (
                <Option key={column.id} value={column.name}>
                  {column.displayName} ({column.name})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="comment"
            label="说明"
          >
            <Input.TextArea
              placeholder="请输入索引说明"
              rows={3}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingIndex ? '更新' : '创建'}
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      {/* AI 推荐索引 */}
      <AiRecommendIndexModal
        open={isAiRecommendVisible}
        onCancel={() => setIsAiRecommendVisible(false)}
        selectedTable={selectedTable}
        tables={tables}
        existingIndexes={indexes}
        onIndexesCreated={async (newIndexes) => {
          const merged = [...indexes, ...newIndexes];
          setIndexes(merged);
          await saveIndexesToBackend(merged);
          setIsAiRecommendVisible(false);
          message.success(`成功创建 ${newIndexes.length} 个索引`);
        }}
      />
    </div>
  );
};

export default IndexTab;
