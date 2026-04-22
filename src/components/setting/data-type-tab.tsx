import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    if (BUILT_IN_DATA_TYPES.some(dt => dt.value === valueLower)) {
      message.error(t('data_type_duplicate_builtin'));
      return;
    }
    const duplicate = customDataTypes.some(
      dt => dt.value.toLowerCase() === valueLower && (!editingDataType || dt.value !== editingDataType.value),
    );
    if (duplicate) {
      message.error(t('data_type_duplicate_custom'));
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
      updated = customDataTypes.map(dt => (dt.value === editingDataType.value ? newType : dt));
    } else {
      updated = [...customDataTypes, newType];
    }

    try {
      await saveCustomDataTypes(updated);
      setCustomDataTypes(updated);
      setIsDataTypeDrawerVisible(false);
      message.success(editingDataType ? t('data_type_update_success') : t('data_type_add_success'));
    } catch {
      message.error(t('data_type_save_fail'));
    }
  };

  const handleDeleteDataType = async (value: string) => {
    const updated = customDataTypes.filter(dt => dt.value !== value);
    try {
      await saveCustomDataTypes(updated);
      setCustomDataTypes(updated);
      message.success(t('data_type_delete_success'));
    } catch {
      message.error(t('data_type_delete_fail'));
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
        <Title level={4}>{t('data_type_builtin')}</Title>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {BUILT_IN_DATA_TYPES.map(dt => (
            <Tag key={dt.value} color="blue">{dt.label}</Tag>
          ))}
        </div>

        <Divider />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>{t('data_type_custom')}</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDataType}>
            {t('data_type_add_btn')}
          </Button>
        </div>

        <List
          dataSource={customDataTypes}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">{t('data_type_empty_custom')}</Text>
              </div>
            ),
          }}
          renderItem={(dt) => (
            <List.Item
              actions={[
                <Button type="link" icon={<EditOutlined />} onClick={() => handleEditDataType(dt)}>
                  {t('data_type_edit')}
                </Button>,
                <Popconfirm
                  title={t('data_type_delete_confirm')}
                  onConfirm={() => handleDeleteDataType(dt.value)}
                  okText={t('confirm')}
                  cancelText={t('cancel')}
                >
                  <Button type="link" danger icon={<DeleteOutlined />}>
                    {t('delete')}
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
                    {dt.hasLength && <Tag>{t('data_type_support_length')}</Tag>}
                    {dt.hasScale && <Tag>{t('data_type_support_scale')}</Tag>}
                    {!dt.hasLength && !dt.hasScale && <Text type="secondary">{t('data_type_no_params')}</Text>}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Space>

      <Drawer
        title={editingDataType ? t('data_type_edit_drawer') : t('data_type_add_drawer')}
        open={isDataTypeDrawerVisible}
        onClose={closeDrawer}
        footer={null}
        width={480}
      >
        <Form form={dataTypeForm} layout="vertical" onFinish={handleSaveDataType}>
          <Form.Item
            name="value"
            label={t('data_type_value_label')}
            rules={[{ required: true, message: t('data_type_value_required') }]}
            extra={t('data_type_value_extra')}
          >
            <Input placeholder={t('data_type_value_placeholder')} disabled={!!editingDataType} />
          </Form.Item>

          <Form.Item
            name="label"
            label={t('data_type_label_label')}
            rules={[{ required: true, message: t('data_type_label_required') }]}
            extra={t('data_type_label_extra')}
          >
            <Input placeholder={t('data_type_label_placeholder')} />
          </Form.Item>

          <Form.Item name="hasLength" label={t('data_type_has_length')} valuePropName="checked">
            <Switch checkedChildren={t('data_type_yes')} unCheckedChildren={t('data_type_no')} />
          </Form.Item>

          <Form.Item name="hasScale" label={t('data_type_has_scale')} valuePropName="checked">
            <Switch checkedChildren={t('data_type_yes')} unCheckedChildren={t('data_type_no')} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                {editingDataType ? t('db_conn_update_btn') : t('create')}
              </Button>
              <Button onClick={closeDrawer}>{t('cancel')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

export default DataTypeTab;