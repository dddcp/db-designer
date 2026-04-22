import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

interface BackendIndexDef {
  id: string;
  table_id: string;
  name: string;
  index_type: string;
  comment?: string;
  fields: Array<{ column_id: string; sort_order: number }>;
}

const IndexTab: React.FC<IndexTabProps> = ({ selectedTable, tables }) => {
  const { t } = useTranslation();
  const [indexes, setIndexes] = useState<IndexDef[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<IndexDef | null>(null);
  const [isAiRecommendVisible, setIsAiRecommendVisible] = useState(false);
  const [form] = Form.useForm();

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
      message.error(t('idx_save_fail'));
    }
  };

  const handleAddIndex = () => {
    if (!selectedTable) {
      message.warning(t('idx_select_table'));
      return;
    }
    setEditingIndex(null);
    form.resetFields();
    setIsModalVisible(true);
  };

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

  const handleDeleteIndex = async (indexId: string) => {
    const newIndexes = indexes.filter(index => index.id !== indexId);
    setIndexes(newIndexes);
    await saveIndexesToBackend(newIndexes);
    message.success(t('idx_delete_success'));
  };

  const handleSaveIndex = async (values: any) => {
    const invalidColumns = values.columns.filter((columnName: string) =>
      !selectedTable?.columns.some(col => col.name === columnName)
    );

    if (invalidColumns.length > 0) {
      message.error(t('idx_invalid_columns', { columns: invalidColumns.join(', ') }));
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
    message.success(editingIndex ? t('idx_update_success') : t('idx_create_success'));
  };

  const indexColumns = [
    {
      title: t('idx_name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: t('idx_type'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: Record<string, { color: string; text: string }> = {
          normal: { color: 'blue', text: t('idx_type_normal') },
          unique: { color: 'green', text: t('idx_type_unique') },
          fulltext: { color: 'orange', text: t('idx_type_fulltext') }
        };
        const config = typeMap[type] || typeMap.normal;
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: t('idx_columns'),
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
      title: t('idx_comment'),
      dataIndex: 'comment',
      key: 'comment',
      render: (text: string) => <Text type="secondary">{text || '-'}</Text>,
    },
    {
      title: t('col_action'),
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
            {t('edit')}
          </Button>
          <Popconfirm
            title={t('idx_delete_confirm')}
            okText={t('confirm')}
            cancelText={t('cancel')}
            onConfirm={() => handleDeleteIndex(record.id)}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              {t('delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!selectedTable) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">{t('idx_select_table')}</Text>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>{t('idx_title')}</Title>
          <Space>
            <Button
              icon={<RobotOutlined />}
              onClick={() => setIsAiRecommendVisible(true)}
            >
              {t('idx_ai_recommend')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddIndex}
            >
              {t('idx_add')}
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
                <Text type="secondary">{t('idx_empty')}</Text>
              </div>
            )
          }}
        />
      </Card>

      <Drawer
        title={editingIndex ? t('idx_edit') : t('idx_add')}
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
                label={t('idx_name')}
                rules={[{ required: true, message: t('idx_name_required') }]}
              >
                <Input placeholder={t('idx_name_placeholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label={t('idx_type')}
                rules={[{ required: true, message: t('idx_type_required') }]}
              >
                <Select placeholder={t('idx_type_placeholder')}>
                  <Option value="normal">{t('idx_type_normal')}</Option>
                  <Option value="unique">{t('idx_type_unique')}</Option>
                  <Option value="fulltext">{t('idx_type_fulltext')}</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="columns"
            label={t('idx_columns')}
            rules={[{ required: true, message: t('idx_columns_required') }]}
          >
            <Select
              mode="multiple"
              placeholder={t('idx_columns_placeholder')}
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
            label={t('idx_comment')}
          >
            <Input.TextArea
              placeholder={t('idx_comment_placeholder')}
              rows={3}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingIndex ? t('table_update') : t('create')}
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                {t('cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

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
          message.success(t('idx_create_count', { count: newIndexes.length }));
        }}
      />
    </div>
  );
};

export default IndexTab;