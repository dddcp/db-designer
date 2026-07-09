import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  message,
  Popconfirm,
  Row,
  Space,
  Switch,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  DatabaseOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { BUILT_IN_DATA_TYPES, loadCustomDataTypes, saveCustomDataTypes } from '../../data-types';
import type { DataTypeOption } from '../../data-types';

const { Text } = Typography;
const { useToken } = theme;

const DataTypeTab: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useToken();
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
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 内置类型卡片 */}
        <Card
          styles={{ header: { fontSize: 17 } }}
          title={
            <Space>
              <DatabaseOutlined style={{ color: token.colorPrimary }} />
              <span>{t('setting_card_builtin_types')}</span>
              <Tag>{BUILT_IN_DATA_TYPES.length}</Tag>
            </Space>
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {BUILT_IN_DATA_TYPES.map(dt => (
              <Tag key={dt.value} color="blue">{dt.label}</Tag>
            ))}
          </div>
        </Card>

        {/* 自定义类型卡片 */}
        <Card
          styles={{ header: { fontSize: 17 } }}
          title={
            <Space>
              <TagsOutlined style={{ color: token.colorPrimary }} />
              <span>{t('setting_card_custom_types')}</span>
              <Tag>{customDataTypes.length}</Tag>
            </Space>
          }
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDataType}>
              {t('data_type_add_btn')}
            </Button>
          }
        >
          {customDataTypes.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('data_type_empty_custom')}
              style={{ padding: '32px 0' }}
            />
          ) : (
            <Row gutter={[16, 16]}>
              {customDataTypes.map((dt) => (
                <Col key={dt.value} xs={24} sm={12} lg={8}>
                  <Card
                    size="small"
                    hoverable
                    style={{ height: '100%' }}
                    actions={[
                      <Tooltip title={t('data_type_edit')} key="edit">
                        <EditOutlined onClick={() => handleEditDataType(dt)} />
                      </Tooltip>,
                      <Popconfirm
                        key="delete"
                        title={t('data_type_delete_confirm')}
                        onConfirm={() => handleDeleteDataType(dt.value)}
                        okText={t('confirm')}
                        cancelText={t('cancel')}
                      >
                        <Tooltip title={t('delete')}>
                          <DeleteOutlined style={{ color: token.colorError }} />
                        </Tooltip>
                      </Popconfirm>,
                    ]}
                  >
                    <Space direction="vertical" size={6} style={{ width: '100%' }}>
                      <Space size={6} wrap>
                        <Text strong style={{ fontSize: 15 }}>{dt.label}</Text>
                        <Text type="secondary" style={{ fontSize: 13 }}>({dt.value})</Text>
                      </Space>
                      <Space size={4} wrap>
                        {dt.hasLength && <Tag color="cyan">{t('data_type_support_length')}</Tag>}
                        {dt.hasScale && <Tag color="purple">{t('data_type_support_scale')}</Tag>}
                        {!dt.hasLength && !dt.hasScale && (
                          <Text type="secondary" style={{ fontSize: 13 }}>{t('data_type_no_params')}</Text>
                        )}
                      </Space>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Card>
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
