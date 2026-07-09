import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
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
  Select,
  Space,
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
  LinkOutlined,
} from '@ant-design/icons';
import type { DatabaseConnection, DatabaseTypeOption } from '../../types';
import styles from './setting.module.css';

const { Text } = Typography;
const { useToken } = theme;
const { Option } = Select;

const DatabaseTab: React.FC = () => {
  const { t } = useTranslation();
  const { token } = useToken();
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
      <Card
        styles={{ header: { fontSize: 17 } }}
        title={
          <Space>
            <DatabaseOutlined style={{ color: token.colorPrimary }} />
            <span>{t('setting_card_connections')}</span>
            <Tag>{dbConnections.length}</Tag>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDatabaseConnection}>
            {t('db_conn_add')}
          </Button>
        }
      >
        {dbConnections.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('db_conn_empty')}
            style={{ padding: '32px 0' }}
          />
        ) : (
          <Row gutter={[16, 16]}>
            {dbConnections.map((connection) => {
              const typeOption = dbTypes.find(dt => dt.value === connection.type);
              return (
                <Col key={connection.id} xs={24} sm={12} lg={8}>
                  <Card
                    size="small"
                    hoverable
                    style={{ height: '100%' }}
                    actions={[
                      <Tooltip title={t('db_conn_edit')} key="edit">
                        <EditOutlined onClick={() => handleEditDatabaseConnection(connection)} />
                      </Tooltip>,
                      <Popconfirm
                        key="delete"
                        title={t('db_conn_delete_confirm')}
                        onConfirm={() => handleDeleteDatabaseConnection(connection.id)}
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
                        <Text strong style={{ fontSize: 15 }}>{connection.name}</Text>
                        <Tag color={typeOption?.color || 'blue'}>
                          {typeOption?.label || connection.type}
                        </Tag>
                      </Space>
                      <Space size={4} style={{ width: '100%' }} align="start">
                        <LinkOutlined style={{ color: token.colorTextTertiary, fontSize: 13, marginTop: 3 }} />
                        <Tooltip
                          title={`${connection.host}:${connection.port} / ${connection.database}`}
                          placement="topLeft"
                        >
                          <div className={styles.lineClamp2} style={{ flex: 1, minWidth: 0, fontSize: 13, color: token.colorTextSecondary }}>
                            {connection.host}:{connection.port} / {connection.database}
                          </div>
                        </Tooltip>
                      </Space>
                      <Tooltip title={`${t('db_conn_user')}: ${connection.username}`} placement="topLeft">
                        <div
                          className={styles.lineClamp2}
                          style={{ fontSize: 13, color: token.colorTextSecondary }}
                        >
                          {t('db_conn_user')}: {connection.username}
                        </div>
                      </Tooltip>
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Card>

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
