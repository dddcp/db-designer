import React, { useState, useEffect } from 'react';
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
import type { DatabaseConnection } from '../../types';

const { Title, Text } = Typography;
const { Option } = Select;

const DatabaseTab: React.FC = () => {
  const [dbForm] = Form.useForm();
  const [dbConnections, setDbConnections] = useState<DatabaseConnection[]>([]);
  const [isDbModalVisible, setIsDbModalVisible] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DatabaseConnection | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDatabaseConnections();
  }, []);

  const loadDatabaseConnections = async () => {
    try {
      const connections = await invoke<DatabaseConnection[]>('get_database_connections');
      setDbConnections(connections);
    } catch (error) {
      console.error('加载数据库连接配置失败:', error);
      message.error('加载数据库连接配置失败');
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
        message.success('数据库连接配置更新成功');
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
        message.success('数据库连接配置创建成功');
      }
      setIsDbModalVisible(false);
      dbForm.resetFields();
      setEditingConnection(null);
      await loadDatabaseConnections();
    } catch (error) {
      console.error('保存数据库连接配置失败:', error);
      message.error('保存数据库连接配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDatabaseConnection = async (id: number) => {
    try {
      await invoke('delete_database_connection', { id });
      message.success('数据库连接配置删除成功');
      await loadDatabaseConnections();
    } catch (error) {
      console.error('删除数据库连接配置失败:', error);
      message.error('删除数据库连接配置失败');
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
          <Title level={4} style={{ margin: 0 }}>数据库连接配置</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddDatabaseConnection}>
            添加连接
          </Button>
        </div>

        <List
          dataSource={dbConnections}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">暂无数据库连接配置，点击上方按钮添加</Text>
              </div>
            ),
          }}
          renderItem={(connection) => (
            <List.Item
              actions={[
                <Button type="link" icon={<EditOutlined />} onClick={() => handleEditDatabaseConnection(connection)}>
                  编辑
                </Button>,
                <Popconfirm
                  title="确定要删除这个数据库连接配置吗？"
                  onConfirm={() => handleDeleteDatabaseConnection(connection.id)}
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
                    <Text strong>{connection.name}</Text>
                    <Tag color={connection.type === 'mysql' ? 'green' : 'purple'}>
                      {connection.type === 'mysql' ? 'MySQL' : 'PostgreSQL'}
                    </Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary">{connection.host}:{connection.port} / {connection.database}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>用户: {connection.username}</Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Space>

      <Drawer
        title={editingConnection ? '编辑数据库连接' : '添加数据库连接'}
        open={isDbModalVisible}
        onClose={closeDrawer}
        footer={null}
        width={600}
      >
        <Form form={dbForm} layout="vertical" onFinish={handleSaveDatabaseConnection}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="连接名称" rules={[{ required: true, message: '请输入连接名称' }]}>
                <Input placeholder="请输入连接名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="type" label="数据库类型" rules={[{ required: true, message: '请选择数据库类型' }]}>
                <Select placeholder="请选择数据库类型">
                  <Option value="mysql">MySQL</Option>
                  <Option value="postgresql">PostgreSQL</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="host" label="主机地址" rules={[{ required: true, message: '请输入主机地址' }]}>
                <Input placeholder="请输入主机地址" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="port" label="端口" rules={[{ required: true, message: '请输入端口' }]}>
                <Input type="number" placeholder="请输入端口" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="password" label="密码">
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="database" label="数据库名" rules={[{ required: true, message: '请输入数据库名' }]}>
            <Input placeholder="请输入数据库名" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading} icon={<SaveOutlined />}>
                {editingConnection ? '更新' : '创建'}
              </Button>
              <Button onClick={closeDrawer}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

export default DatabaseTab;
