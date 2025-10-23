import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { 
  Layout, 
  Card, 
  Button, 
  Space, 
  Typography, 
  theme, 
  ConfigProvider, 
  List,
  Input,
  Form,
  Select,
  Switch,
  Table,
  Tag,
  message,
  Tooltip,
  Divider,
  Row,
  Col,
  Modal,
  Popconfirm
} from 'antd';
import { 
  ArrowLeftOutlined,
  DatabaseOutlined,
  TableOutlined,
  CodeOutlined,
  SettingOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UpOutlined,
  DownOutlined,
  CheckOutlined,
  CloseOutlined
} from '@ant-design/icons';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;
const { Option } = Select;

// 项目类型定义
interface Project {
  id: number;
  name: string;
  description?: string;
  database_type: string;
  created_at: string;
  updated_at: string;
}

// 表定义
interface TableDef {
  id: string;
  name: string;        // 表名（英文）
  displayName: string; // 中文名
  columns: ColumnDef[];
}

// 列定义
interface ColumnDef {
  id: string;
  name: string;        // 字段名（英文）
  displayName: string; // 中文名称
  type: string;        // 数据类型
  length?: number;     // 长度/精度
  nullable: boolean;   // 是否为空
  primaryKey: boolean; // 是否为主键
  autoIncrement: boolean; // 是否自增
  defaultValue?: string;  // 默认值
  comment?: string;    // 说明
  order: number;       // 排序
  isNew?: boolean;     // 是否是新添加的列
}

/**
 * 项目详情页面组件 - 表设计功能
 */
const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useToken();
  
  const [project, setProject] = useState<Project | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableForm] = Form.useForm();
  const [isTableModalVisible, setIsTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<TableDef | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

  // 默认设置
  const [settings] = useState({
    isDarkMode: false
  });

  // 数据类型选项
  const dataTypes = [
    { value: 'int', label: 'INT' },
    { value: 'varchar', label: 'VARCHAR' },
    { value: 'text', label: 'TEXT' },
    { value: 'decimal', label: 'DECIMAL' },
    { value: 'datetime', label: 'DATETIME' },
    { value: 'timestamp', label: 'TIMESTAMP' },
    { value: 'boolean', label: 'BOOLEAN' },
  ];

  // 加载项目详情
  useEffect(() => {
    if (id) {
      loadProjectDetail();
    }
  }, [id]);

  /**
   * 加载项目详情
   */
  const loadProjectDetail = async () => {
    setLoading(true);
    try {
      // 模拟加载项目数据
      const mockProject: Project = {
        id: parseInt(id || '0'),
        name: `项目 ${id}`,
        description: `这是项目 ${id} 的详细描述`,
        database_type: 'mysql',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      setProject(mockProject);

      // 模拟加载表数据
      const mockTables: TableDef[] = [
        {
          id: '1',
          name: 'users',
          displayName: '用户表',
          columns: [
            {
              id: '1',
              name: 'id',
              displayName: '用户ID',
              type: 'int',
              nullable: false,
              primaryKey: true,
              autoIncrement: true,
              comment: '用户唯一标识',
              order: 1
            },
            {
              id: '2',
              name: 'username',
              displayName: '用户名',
              type: 'varchar',
              length: 50,
              nullable: false,
              primaryKey: false,
              autoIncrement: false,
              comment: '用户登录名',
              order: 2
            }
          ]
        }
      ];
      setTables(mockTables);
      if (mockTables.length > 0) {
        setSelectedTable(mockTables[0]);
      }
    } catch (error) {
      console.error('加载项目详情失败:', error);
      message.error('加载项目详情失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 返回主页
   */
  const handleBack = () => {
    navigate('/');
  };

  /**
   * 创建新表
   */
  const handleCreateTable = () => {
    setEditingTable(null);
    tableForm.resetFields();
    setIsTableModalVisible(true);
  };

  /**
   * 编辑表
   */
  const handleEditTable = (table: TableDef) => {
    setEditingTable(table);
    tableForm.setFieldsValue({
      name: table.name,
      displayName: table.displayName
    });
    setIsTableModalVisible(true);
  };

  /**
   * 删除表
   */
  const handleDeleteTable = (tableId: string) => {
    setTables(tables.filter(table => table.id !== tableId));
    if (selectedTable?.id === tableId) {
      setSelectedTable(null);
    }
    message.success('表删除成功');
  };

  /**
   * 保存表
   */
  const handleSaveTable = (values: any) => {
    if (editingTable) {
      // 编辑现有表
      setTables(tables.map(table => 
        table.id === editingTable.id 
          ? { ...table, ...values }
          : table
      ));
      if (selectedTable?.id === editingTable.id) {
        setSelectedTable({ ...selectedTable, ...values });
      }
      message.success('表更新成功');
    } else {
      // 创建新表
      const newTable: TableDef = {
        id: Date.now().toString(),
        name: values.name,
        displayName: values.displayName,
        columns: []
      };
      setTables([...tables, newTable]);
      message.success('表创建成功');
    }
    setIsTableModalVisible(false);
  };

  /**
   * 添加列
   */
  const handleAddColumn = () => {
    if (!selectedTable) {
      message.warning('请先选择一个表');
      return;
    }
    
    const newColumn: ColumnDef = {
      id: Date.now().toString(),
      name: '',
      displayName: '',
      type: 'varchar',
      nullable: true,
      primaryKey: false,
      autoIncrement: false,
      order: selectedTable.columns.length + 1,
      isNew: true
    };
    
    const updatedTable = {
      ...selectedTable,
      columns: [...selectedTable.columns, newColumn]
    };
    
    setTables(tables.map(table => 
      table.id === selectedTable.id ? updatedTable : table
    ));
    setSelectedTable(updatedTable);
    setEditingColumnId(newColumn.id);
  };

  /**
   * 开始编辑列
   */
  const handleStartEditColumn = (columnId: string) => {
    setEditingColumnId(columnId);
  };

  /**
   * 取消编辑列
   */
  const handleCancelEditColumn = (columnId: string) => {
    if (!selectedTable) return;
    
    const column = selectedTable.columns.find(col => col.id === columnId);
    if (column?.isNew) {
      // 如果是新列，直接删除
      handleDeleteColumn(columnId);
    }
    setEditingColumnId(null);
  };

  /**
   * 保存列
   */
  const handleSaveColumn = (columnId: string, field: keyof ColumnDef, value: any) => {
    if (!selectedTable) return;
    
    const updatedTable = {
      ...selectedTable,
      columns: selectedTable.columns.map(col => 
        col.id === columnId 
          ? { ...col, [field]: value, isNew: false }
          : col
      )
    };
    
    setTables(tables.map(table => 
      table.id === selectedTable.id ? updatedTable : table
    ));
    setSelectedTable(updatedTable);
  };

  /**
   * 删除列
   */
  const handleDeleteColumn = (columnId: string) => {
    if (!selectedTable) return;
    
    const updatedTable = {
      ...selectedTable,
      columns: selectedTable.columns.filter(col => col.id !== columnId)
    };
    
    setTables(tables.map(table => 
      table.id === selectedTable.id ? updatedTable : table
    ));
    setSelectedTable(updatedTable);
    setEditingColumnId(null);
    message.success('列删除成功');
  };

  /**
   * 移动列顺序
   */
  const handleMoveColumn = (columnId: string, direction: 'up' | 'down') => {
    if (!selectedTable) return;
    
    const columnIndex = selectedTable.columns.findIndex(col => col.id === columnId);
    if (columnIndex === -1) return;
    
    const newIndex = direction === 'up' ? columnIndex - 1 : columnIndex + 1;
    if (newIndex < 0 || newIndex >= selectedTable.columns.length) return;
    
    const newColumns = [...selectedTable.columns];
    [newColumns[columnIndex], newColumns[newIndex]] = [newColumns[newIndex], newColumns[columnIndex]];
    
    // 更新排序值
    newColumns.forEach((col, index) => {
      col.order = index + 1;
    });
    
    const updatedTable = {
      ...selectedTable,
      columns: newColumns
    };
    
    setTables(tables.map(table => 
      table.id === selectedTable.id ? updatedTable : table
    ));
    setSelectedTable(updatedTable);
  };

  // 列定义
  const columnsColumns = [
    {
      title: '排序',
      dataIndex: 'order',
      key: 'order',
      width: 60,
      render: (order: number) => (
        <Text strong>{order}</Text>
      ),
    },
    {
      title: '字段名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ColumnDef) => (
        editingColumnId === record.id ? (
          <Input
            value={text}
            onChange={(e) => handleSaveColumn(record.id, 'name', e.target.value)}
            placeholder="字段名"
            size="small"
          />
        ) : (
          <Text strong>{text || '未命名'}</Text>
        )
      ),
    },
    {
      title: '中文名称',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (text: string, record: ColumnDef) => (
        editingColumnId === record.id ? (
          <Input
            value={text}
            onChange={(e) => handleSaveColumn(record.id, 'displayName', e.target.value)}
            placeholder="中文名称"
            size="small"
          />
        ) : (
          <Text>{text || '-'}</Text>
        )
      ),
    },
    {
      title: '数据类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string, record: ColumnDef) => (
        editingColumnId === record.id ? (
          <Space>
            <Select
              value={type}
              onChange={(value) => handleSaveColumn(record.id, 'type', value)}
              size="small"
              style={{ width: 120 }}
            >
              {dataTypes.map(dataType => (
                <Option key={dataType.value} value={dataType.value}>
                  {dataType.label}
                </Option>
              ))}
            </Select>
            {['varchar', 'char', 'decimal'].includes(type) && (
              <Input
                value={record.length}
                onChange={(e) => handleSaveColumn(record.id, 'length', parseInt(e.target.value) || undefined)}
                placeholder="长度"
                size="small"
                style={{ width: 80 }}
                type="number"
              />
            )}
          </Space>
        ) : (
          <Space>
            <Text>{type}</Text>
            {record.length && <Text type="secondary">({record.length})</Text>}
          </Space>
        )
      ),
    },
    {
      title: '属性',
      key: 'properties',
      render: (record: ColumnDef) => (
        editingColumnId === record.id ? (
          <Space size={[0, 4]} wrap>
            <Switch
              checked={!record.nullable}
              onChange={(checked) => handleSaveColumn(record.id, 'nullable', !checked)}
              size="small"
              checkedChildren="非空"
              unCheckedChildren="可空"
            />
            <Switch
              checked={record.primaryKey}
              onChange={(checked) => handleSaveColumn(record.id, 'primaryKey', checked)}
              size="small"
              checkedChildren="主键"
              unCheckedChildren="普通"
            />
            <Switch
              checked={record.autoIncrement}
              onChange={(checked) => handleSaveColumn(record.id, 'autoIncrement', checked)}
              size="small"
              checkedChildren="自增"
              unCheckedChildren="非自增"
            />
          </Space>
        ) : (
          <Space size={[0, 4]} wrap>
            {record.primaryKey && <Tag color="red">主键</Tag>}
            {record.autoIncrement && <Tag color="blue">自增</Tag>}
            {record.nullable ? <Tag color="orange">可空</Tag> : <Tag color="green">非空</Tag>}
          </Space>
        )
      ),
    },
    {
      title: '默认值',
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      render: (text: string, record: ColumnDef) => (
        editingColumnId === record.id ? (
          <Input
            value={text}
            onChange={(e) => handleSaveColumn(record.id, 'defaultValue', e.target.value)}
            placeholder="默认值"
            size="small"
            style={{ width: 120 }}
          />
        ) : (
          <Text type="secondary">{text || '-'}</Text>
        )
      ),
    },
    {
      title: '说明',
      dataIndex: 'comment',
      key: 'comment',
      render: (text: string, record: ColumnDef) => (
        editingColumnId === record.id ? (
          <Input
            value={text}
            onChange={(e) => handleSaveColumn(record.id, 'comment', e.target.value)}
            placeholder="字段说明"
            size="small"
          />
        ) : (
          <Text type="secondary">{text || '-'}</Text>
        )
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (record: ColumnDef) => (
        <Space>
          <Button 
            type="text" 
            icon={<UpOutlined />}
            size="small"
            onClick={() => handleMoveColumn(record.id, 'up')}
            disabled={record.order === 1}
          />
          <Button 
            type="text" 
            icon={<DownOutlined />}
            size="small"
            onClick={() => handleMoveColumn(record.id, 'down')}
            disabled={record.order === selectedTable?.columns.length}
          />
          {editingColumnId === record.id ? (
            <>
              <Button 
                type="link" 
                icon={<CheckOutlined />}
                size="small"
                onClick={() => setEditingColumnId(null)}
              >
                完成
              </Button>
              <Button 
                type="link" 
                danger 
                icon={<CloseOutlined />}
                size="small"
                onClick={() => handleCancelEditColumn(record.id)}
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <Button 
                type="link" 
                icon={<EditOutlined />}
                size="small"
                onClick={() => handleStartEditColumn(record.id)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定删除此列吗？"
                onConfirm={() => handleDeleteColumn(record.id)}
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
            </>
          )}
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text>加载中...</Text>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text>项目不存在</Text>
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: settings.isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 8,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        {/* 头部 */}
        <Header 
          style={{ 
            background: settings.isDarkMode ? '#141414' : '#fff',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Space>
            <Tooltip title="返回主页">
              <Button 
                type="text" 
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
              >
                返回
              </Button>
            </Tooltip>
            <DatabaseOutlined style={{ fontSize: 24, color: token.colorPrimary }} />
            <Title level={3} style={{ margin: 0, color: settings.isDarkMode ? '#fff' : '#000' }}>
              {project.name}
            </Title>
            <Tag color={project.database_type === 'mysql' ? 'green' : 'purple'}>
              {project.database_type === 'mysql' ? 'MySQL' : 'PostgreSQL'}
            </Tag>
          </Space>
          
          <Space>
            <Tooltip title="生成SQL">
              <Button 
                type="text" 
                icon={<CodeOutlined />}
              >
                生成SQL
              </Button>
            </Tooltip>
            <Tooltip title="项目设置">
              <Button 
                type="text" 
                icon={<SettingOutlined />}
              >
                设置
              </Button>
            </Tooltip>
          </Space>
        </Header>

        <Layout>
          {/* 左侧边栏 - 表列表 */}
          <Sider 
            width={300} 
            style={{ 
              background: settings.isDarkMode ? '#141414' : '#fff',
              borderRight: `1px solid ${token.colorBorderSecondary}`
            }}
          >
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>表列表</Title>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                  size="small"
                  onClick={handleCreateTable}
                >
                  新建表
                </Button>
              </div>
              
              <List
                dataSource={tables}
                renderItem={(table) => (
                  <List.Item
                    style={{ 
                      cursor: 'pointer',
                      background: selectedTable?.id === table.id ? token.colorPrimaryBg : 'transparent',
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: selectedTable?.id === table.id ? `1px solid ${token.colorPrimaryBorder}` : '1px solid transparent'
                    }}
                    onClick={() => setSelectedTable(table)}
                    actions={[
                      <Button 
                        type="text" 
                        icon={<EditOutlined />}
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTable(table);
                        }}
                      />,
                      <Popconfirm
                        title="确定删除此表吗？"
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          handleDeleteTable(table.id);
                        }}
                      >
                        <Button 
                          type="text" 
                          danger 
                          icon={<DeleteOutlined />}
                          size="small"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space direction="vertical" size={0}>
                          <Text strong>{table.displayName}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{table.name}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
                locale={{
                  emptyText: (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                      <TableOutlined style={{ fontSize: 32, color: token.colorTextDisabled, marginBottom: 8 }} />
                      <div style={{ color: token.colorTextDisabled }}>暂无表，点击上方按钮创建第一个表</div>
                    </div>
                  )
                }}
              />
            </div>
          </Sider>

          {/* 右侧内容 - 表设计 */}
          <Content style={{ padding: '24px', background: settings.isDarkMode ? '#000' : '#f5f5f5' }}>
            <div style={{ maxWidth: '100%', margin: '0 auto' }}>
              {selectedTable ? (
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Space>
                      <TableOutlined />
                      <Title level={4} style={{ margin: 0 }}>
                        {selectedTable.displayName} ({selectedTable.name})
                      </Title>
                    </Space>
                    <Button 
                      type="primary" 
                      icon={<PlusOutlined />}
                      onClick={handleAddColumn}
                    >
                      添加列
                    </Button>
                  </div>
                  
                  <Table
                    dataSource={selectedTable.columns.sort((a, b) => a.order - b.order)}
                    columns={columnsColumns}
                    pagination={false}
                    rowKey="id"
                    size="middle"
                  />
                </Card>
              ) : (
                <div style={{ textAlign: 'center', padding: 50 }}>
                  <TableOutlined style={{ fontSize: 48, color: token.colorTextDisabled, marginBottom: 16 }} />
                  <div style={{ color: token.colorTextDisabled }}>请从左侧选择一个表开始设计</div>
                </div>
              )}
            </div>
          </Content>
        </Layout>
      </Layout>

      {/* 表编辑模态框 */}
      <Modal
        title={editingTable ? '编辑表' : '新建表'}
        open={isTableModalVisible}
        onCancel={() => setIsTableModalVisible(false)}
        footer={null}
      >
        <Form
          form={tableForm}
          layout="vertical"
          onFinish={handleSaveTable}
        >
          <Form.Item
            name="name"
            label="表名（英文）"
            rules={[{ required: true, message: '请输入表名' }]}
          >
            <Input placeholder="请输入表名，如：users" />
          </Form.Item>
          
          <Form.Item
            name="displayName"
            label="中文名"
            rules={[{ required: true, message: '请输入中文名' }]}
          >
            <Input placeholder="请输入表的中文名，如：用户表" />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTable ? '更新' : '创建'}
              </Button>
              <Button onClick={() => setIsTableModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </ConfigProvider>
  );
};

export default ProjectDetail;
