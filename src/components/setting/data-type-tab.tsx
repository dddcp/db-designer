import React, { useState, useEffect } from 'react';
import {
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  List,
  message,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { BUILT_IN_DATA_TYPES, loadCustomDataTypes, saveCustomDataTypes } from '../../data-types';
import type { DataTypeOption } from '../../data-types';

const { Title, Text } = Typography;

const DataTypeTab: React.FC = () => {
  const [dataTypeForm] = Form.useForm();
  const [customDataTypes, setCustomDataTypes] = useState<DataTypeOption[]>([]);
  const [isDataTypeDrawerVisible, setIsDataTypeDrawerVisible] = useState(false);
  const [editingDataType, setEditingDataType] = useState<DataTypeOption | null>(null);

  useEffect(() => {
    loadCustomDataTypesList();
  }, []);

  const loadCustomDataTypesList = async () => {
    const types = await loadCustomDataTypes();
    setCustomDataTypes(types);
  };

  const handleAddDataType = () => {
    setEditingDataType(null);
    dataTypeForm.resetFields();
    dataTypeForm.setFieldsValue({ hasLength: false, hasScale: false });
    setIsDataTypeDrawerVisible(true);
  };

  const handleEditDataType = (dt: DataTypeOption) => {
    setEditingDataType(dt);
    dataTypeForm.setFieldsValue({
      value: dt.value,
      label: dt.label,
      hasLength: dt.hasLength,
      hasScale: dt.hasScale,
    });
    setIsDataTypeDrawerVisible(true);
  };

  const handleSaveDataType = async (values: any) => {
    const valueLower = values.value.toLowerCase().trim();
    if (BUILT_IN_DATA_TYPES.some(t => t.value === valueLower)) {
      message.error('不允许与内置类型重名');
      return;
    }
    const duplicate = customDataTypes.some(
      t => t.value.toLowerCase() === valueLower && (!editingDataType || t.value !== editingDataType.value),
    );
    if (duplicate) {
      message.error('已存在相同标识的自定义类型');
      return;
    }

    const newType: DataTypeOption = {
      value: valueLower,
      label: values.label.trim().toUpperCase(),
      hasLength: values.hasLength ?? false,
      hasScale: values.hasScale ?? false,
      builtIn: false,
    };

    let updated: DataTypeOption[];
    if (editingDataType) {
      updated = customDataTypes.map(t => (t.value === editingDataType.value ? newType : t));
    } else {
      updated = [...customDataTypes, newType];
    }

    try {
      await saveCustomDataTypes(updated);
      setCustomDataTypes(updated);
      setIsDataTypeDrawerVisible(false);
      message.success(editingDataType ? '数据类型更新成功' : '数据类型添加成功');
    } catch {
      message.error('保存数据类型失败');
    }
  };

  const handleDeleteDataType = async (value: string) => {
    const updated = customDataTypes.filter(t => t.value !== value);
    try {
      await saveCustomDataTypes(updated);
      setCustomDataTypes(updated);
      message.success('数据类型删除成功');
    } catch {
      message.error('删除数据类型失败');
    }
  };

  const closeDrawer = () => {
    setIsDataTypeDrawerVisible(false);
    dataTypeForm.resetFields();
    setEditingDataType(null);
  };

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Title level={4}>内置类型</Title>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {BUILT_IN_DATA_TYPES.map(dt => (
            <Tag key={dt.value} color="blue">{dt.label}</Tag>
          ))}
        </div>

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>自定义类型</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDataType}>
            添加类型
          </Button>
        </div>

        <List
          dataSource={customDataTypes}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">暂无自定义数据类型，点击上方按钮添加</Text>
              </div>
            ),
          }}
          renderItem={(dt) => (
            <List.Item
              actions={[
                <Button type="link" icon={<EditOutlined />} onClick={() => handleEditDataType(dt)}>
                  编辑
                </Button>,
                <Popconfirm
                  title="确定要删除这个数据类型吗？"
                  onConfirm={() => handleDeleteDataType(dt.value)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{dt.label}</Text>
                    <Text type="secondary">({dt.value})</Text>
                  </Space>
                }
                description={
                  <Space>
                    {dt.hasLength && <Tag>支持长度</Tag>}
                    {dt.hasScale && <Tag>支持精度/小数位</Tag>}
                    {!dt.hasLength && !dt.hasScale && <Text type="secondary">无长度/精度参数</Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Space>

      <Drawer
        title={editingDataType ? '编辑数据类型' : '添加数据类型'}
        open={isDataTypeDrawerVisible}
        onClose={closeDrawer}
        footer={null}
        width={480}
      >
        <Form form={dataTypeForm} layout="vertical" onFinish={handleSaveDataType}>
          <Form.Item
            name="value"
            label="类型标识"
            rules={[{ required: true, message: '请输入类型标识' }]}
            extra="存储用标识，如 enum、money（小写英文）"
          >
            <Input placeholder="请输入类型标识" disabled={!!editingDataType} />
          </Form.Item>

          <Form.Item
            name="label"
            label="显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
            extra="下拉框中显示的名称，如 ENUM、MONEY"
          >
            <Input placeholder="请输入显示名称" />
          </Form.Item>

          <Form.Item name="hasLength" label="支持长度" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <Form.Item name="hasScale" label="支持精度/小数位" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                {editingDataType ? '更新' : '创建'}
              </Button>
              <Button onClick={closeDrawer}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

export default DataTypeTab;
