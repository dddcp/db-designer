import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Col,
  Drawer,
  Form,
  Input,
  List,
  message,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { DatabaseConnection, DatabaseTypeOption } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const DatabaseTab: React.FC = () => {
  const { t } = useTranslation();
  const [dbForm] = Form.useForm();
  const [dbConnections, setDbConnections] = useState<DatabaseConnection[]>([]);
  const [isDbModalVisible, setIsDbModalVisible] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbTypes, setDbTypes] = useState<DatabaseTypeOption[]>([]);

  useEffect(() => {
    loadDatabaseConnections();
    invoke<DatabaseTypeOption[]>('get_supported_database_types').then(setDbTypes);
  }, []);

  const loadDatabaseConnections = async () => {
    try {
      const connections = await invoke<DatabaseConnection[]>('get_database_connections');
      setDbConnections(connections);
    } catch (error) {
      console.error(t('db_conn_load_fail'), error);
      message.error(t('db_conn_load_fail'));
    }
  };

  const handleAddDatabaseConnection = () => {
    setEditingConnection(null);
    dbForm.resetFields();
    setIsDbModalVisible(true);
  };

  const handleEditDatabaseConnection = (connection: DatabaseConnection) => {
    setEditingConnection(connection);
    dbForm.setFieldsValue({
      name: connection.name,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database,
    });
    setIsDbModalVisible(true);
  };

  const handleSaveDatabaseConnection = async (values: any) => {
    setLoading(true);
    try {
      if (editingConnection) {
        await invoke('update_database_connection', {
          connection: {
            id: editingConnection.id,
            name: values.name,
            type: values.type,
            host: values.host,
            port: Number(values.port),
            username: values.username,
            password: values.password,
            database: values.database,
          },
        });
        message.success(t('db_conn_update_success'));
      } else {
        await invoke('create_database_connection', {
          connection: {
            name: values.name,
            type: values.type,
            host: values.host,
            port: Number(values.port),
            username: values.username,
            password: values.password,
            database: values.database,
          },
        });
        message.success(t('db_conn_create_success'));
      }
      setIsDbModalVisible(false);
      dbForm.resetFields();
      setEditingConnection(null);
      await loadDatabaseConnections();
    } catch (error) {
      console.error(t('db_conn_save_fail'), error);
      message.error(t('db_conn_save_fail'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDatabaseConnection = async (id: number) => {
    try {
      await invoke('delete_database_connection', { id });
      message.success(t('db_conn_delete_success'));
      await loadDatabaseConnections();
    } catch (error) {
      console.error(t('db_conn_delete_fail'), error);
      message.error(t('db_conn_delete_fail'));
    }
  };

  const closeDrawer = () => {
    setIsDbModalVisible(false);
    dbForm.resetFields();
    setEditingConnection(null);
  };

  return (
    <>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>{t('db_conn_title')}</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDatabaseConnection}>
            {t('db_conn_add')}
          </Button>
        </div>

        <List
          dataSource={dbConnections}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">{t('db_conn_empty')}</Text>
              </div>
            ),
          }}
          renderItem={(connection) => (
            <List.Item
              actions={[
                <Button type="link" icon={<EditOutlined />} onClick={() => handleEditDatabaseConnection(connection)}>
                  {t('db_conn_edit')}
                </Button>,
                <Popconfirm
                  title={t('db_conn_confirm_delete')}
                  onConfirm={() => handleDeleteDatabaseConnection(connection.id)}
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
                    <Text strong>{connection.name}</Text>
                    <Tag color={dbTypes.find(dt => dt.value === connection.type)?.color || 'blue'}>
                      {dbTypes.find(dt => dt.value === connection.type)?.label || connection.type}
                    </Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary">{connection.host}:{connection.port} / {connection.database}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{t('db_conn_user')}: {connection.username}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Space>

      <Drawer
        title={editingConnection ? t('db_conn_edit_drawer') : t('db_conn_add_drawer')}
        open={isDbModalVisible}
        onClose={closeDrawer}
        footer={null}
        width={600}
      >
        <Form form={dbForm} layout="vertical" onFinish={handleSaveDatabaseConnection}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label={t('db_conn_name')} rules={[{ required: true, message: t('db_conn_name_required') }]}>
                <Input placeholder={t('db_conn_name_placeholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label={t('db_conn_type')} rules={[{ required: true, message: t('db_conn_type_required') }]}>
                <Select placeholder={t('db_conn_type_placeholder')}>
                  {dbTypes.map(dt => (
                    <Option key={dt.value} value={dt.value}>{dt.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="host" label={t('db_conn_host')} rules={[{ required: true, message: t('db_conn_host_required') }]}>
                <Input placeholder={t('db_conn_host_placeholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="port" label={t('db_conn_port')} rules={[{ required: true, message: t('db_conn_port_required') }]}>
                <Input type="number" placeholder={t('db_conn_port_placeholder')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="username" label={t('db_conn_user')} rules={[{ required: true, message: t('db_conn_user_required') }]}>
                <Input placeholder={t('db_conn_user_placeholder')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="password" label={t('db_conn_password')}>
                <Input.Password placeholder={t('db_conn_password_placeholder')} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="database" label={t('db_conn_database')} rules={[{ required: true, message: t('db_conn_database_required') }]}>
            <Input placeholder={t('db_conn_database_placeholder')} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                {editingConnection ? t('db_conn_update_btn') : t('db_conn_create_btn')}
              </Button>
              <Button onClick={closeDrawer}>{t('cancel')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

export default DatabaseTab;