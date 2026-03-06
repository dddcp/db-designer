import {
  ArrowLeftOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  RobotOutlined,
  TableOutlined
} from '@ant-design/icons';
import { HolderOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  Form,
  Input,
  Layout,
  List,
  message,
  Drawer,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  theme,
  Tooltip,
  Typography
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../../store/theme-context';
import { getAllDataTypes, findDataType } from '../../data-types';
import type { DataTypeOption } from '../../data-types';
import DatabaseCodeTab from './database-code-tab';
import IndexTab from './index-tab';
import InitDataTab from './init-data-tab';
import VersionTab from './version-tab';
import SyncTab from './sync-tab';
import SqlExportTab from './sql-export-tab';
import AiDesignModal from './ai-design-modal';
import type { GeneratedTable } from './ai-design-modal';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;
const { Option } = Select;

import type { Project, TableDef, ColumnDef, BackendTableDef, BackendColumnDef } from '../../types';

// 拖拽手柄 Context：将 listeners 从行组件传递给手柄图标（必须在组件外部定义，避免每次渲染重新创建）
const DragHandleContext = React.createContext<any>({});

const DragHandle: React.FC = () => {
  const { attributes, listeners } = React.useContext(DragHandleContext);
  const { token } = theme.useToken();
  return (
    <span
      {...attributes}
      {...listeners}
      style={{ cursor: 'grab', display: 'inline-flex', alignItems: 'center', padding: '4px 8px' }}
    >
      <HolderOutlined style={{ fontSize: 16, color: token.colorTextSecondary }} />
    </span>
  );
};

const DraggableRow: React.FC<any> = (props) => {
  const id = props['data-row-key'];
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  const { token } = theme.useToken();

  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform ? { ...transform, scaleY: 1 } : null),
    transition,
    ...(isDragging ? { opacity: 0.4, background: token.colorPrimaryBg } : {}),
  } as React.CSSProperties;

  return (
    <DragHandleContext.Provider value={{ attributes, listeners }}>
      <tr ref={setNodeRef} style={style} {...props} />
    </DragHandleContext.Provider>
  );
};

/**
 * 项目详情页面组件 - 表设计功能
 */
const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useToken();
  const { isDarkMode } = useTheme();

  const [project, setProject] = useState<Project | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableForm] = Form.useForm();
  const [isTableModalVisible, setIsTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<TableDef | null>(null);
  const [activeTab, setActiveTab] = useState('structure');
  const [projectView, setProjectView] = useState('design');
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);

  // 加载数据类型
  useEffect(() => {
    getAllDataTypes().then(setDataTypes);
  }, []);

  // 加载项目详情
  useEffect(() => {
    if (id) {
      loadProjectDetail();
    }
  }, [id]);

  // 切回表设计视图时静默刷新表列表
  useEffect(() => {
    if (projectView === 'design' && project) {
      loadTables(project.id);
    }
  }, [projectView]);

  /**
   * 显示通知
   */
  const showNotification = (type: 'success' | 'error' | 'warning' | 'info', msg: string, description?: string) => {
    const fullMessage = description ? `${msg}\n${description}` : msg;

    switch (type) {
      case 'success':
        message.success(fullMessage);
        break;
      case 'error':
        message.error(fullMessage);
        break;
      case 'warning':
        message.warning(fullMessage);
        break;
      case 'info':
        message.info(fullMessage);
        break;
    }
  };

  /**
   * 从后端加载表列表（静默，不影响 loading 状态）
   */
  const loadTables = async (projectId: number) => {
    try {
      const projectTables: BackendTableDef[] = await invoke('get_project_tables', {
        projectId,
      });
      const tablesData: TableDef[] = await Promise.all(
        projectTables.map(async (table) => {
          const columns: BackendColumnDef[] = await invoke('get_table_columns', {
            tableId: table.id,
          });
          return {
            id: table.id,
            name: table.name,
            displayName: table.display_name,
            columns: columns.map(col => ({
              id: col.id,
              name: col.name,
              displayName: col.display_name,
              type: col.data_type,
              length: col.length,
              nullable: col.nullable,
              primaryKey: col.primary_key,
              autoIncrement: col.auto_increment,
              defaultValue: col.default_value,
              comment: col.comment,
              order: col.sort_order,
            })),
          };
        })
      );
      setTables(tablesData);
      setSelectedTable(prev => {
        if (prev) {
          const updated = tablesData.find(t => t.id === prev.id);
          if (updated) return updated;
        }
        return tablesData.length > 0 ? tablesData[0] : null;
      });
    } catch (error) {
      console.error('加载表列表失败:', error);
    }
  };

  /**
   * 加载项目详情
   */
  const loadProjectDetail = async () => {
    setLoading(true);
    try {
      // 从后端加载项目数据
      const projects: Project[] = await invoke('get_projects');
      const currentProject = projects.find(p => p.id === parseInt(id || '0'));

      if (!currentProject) {
        showNotification('error', '项目不存在');
        navigate('/');
        return;
      }

      setProject(currentProject);
      await loadTables(currentProject.id);
    } catch (error) {
      console.error('加载项目详情失败:', error);
      showNotification('error', '加载项目详情失败');
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
  const handleDeleteTable = async (tableId: string) => {
    try {
      await invoke('delete_table', { tableId });
      setTables(tables.filter(table => table.id !== tableId));
      if (selectedTable?.id === tableId) {
        setSelectedTable(null);
      }
      showNotification('success', '表删除成功');
    } catch (error) {
      console.error('删除表失败:', error);
      showNotification('error', '删除表失败: ' + error);
    }
  };

  /**
   * 保存表
   */
  const handleSaveTable = async (values: any) => {
    if (!project) return;

    try {
      if (editingTable) {
        // 编辑现有表 - 调用后端保存
        const tableData = {
          id: editingTable.id,
          project_id: project.id,
          name: values.name,
          display_name: values.displayName,
          comment: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const columnsData = editingTable.columns.map(column => ({
          id: column.id,
          table_id: editingTable.id,
          name: column.name,
          display_name: column.displayName,
          data_type: column.type,
          length: column.length || null,
          scale: column.scale || null,
          nullable: column.nullable,
          primary_key: column.primaryKey,
          auto_increment: column.autoIncrement,
          default_value: column.defaultValue || null,
          comment: column.comment || null,
          sort_order: column.order,
        }));
        await invoke('save_table_structure', {
          projectId: project.id,
          table: tableData,
          columns: columnsData,
        });

        const updatedTable = { ...editingTable, name: values.name, displayName: values.displayName };
        setTables(tables.map(table =>
          table.id === editingTable.id ? updatedTable : table
        ));
        if (selectedTable?.id === editingTable.id) {
          setSelectedTable(updatedTable);
        }
        showNotification('success', '表更新成功');
      } else {
        // 创建新表 - 调用后端保存
        const newId = Date.now().toString();
        const tableData = {
          id: newId,
          project_id: project.id,
          name: values.name,
          display_name: values.displayName,
          comment: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await invoke('save_table_structure', {
          projectId: project.id,
          table: tableData,
          columns: [],
        });

        const newTable: TableDef = {
          id: newId,
          name: values.name,
          displayName: values.displayName,
          columns: []
        };
        setTables([...tables, newTable]);
        showNotification('success', '表创建成功');
      }
      setIsTableModalVisible(false);
    } catch (error) {
      console.error('保存表失败:', error);
      showNotification('error', '保存表失败: ' + error);
    }
  };

  /**
   * 添加列
   */
  const handleAddColumn = () => {
    if (!selectedTable) {
      showNotification('warning', '请先选择一个表');
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
      order: selectedTable.columns.length + 1
    };
    
    const updatedTable = {
      ...selectedTable,
      columns: [...selectedTable.columns, newColumn]
    };
    
    setTables(tables.map(table => 
      table.id === selectedTable.id ? updatedTable : table
    ));
    setSelectedTable(updatedTable);
  };

  /**
   * 保存列
   */
  const handleSaveColumn = (columnId: string, field: keyof ColumnDef, value: any) => {
    
    const updateObj = {[field]: value };
    if (field === 'primaryKey'){
      updateObj.nullable = false;
    }
    
    if (!selectedTable) return;
    
    const updatedTable = {
      ...selectedTable,
      columns: selectedTable.columns.map(col => 
        col.id === columnId 
          ? { ...col, ...updateObj }
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
    showNotification('success', '列删除成功');
  };

  /**
   * 拖拽排序处理
   */
  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (!selectedTable) return;
    if (!over) return;
    if (active.id === over.id) return;

    const oldIndex = selectedTable.columns.findIndex(col => col.id === active.id);
    const newIndex = selectedTable.columns.findIndex(col => col.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newColumns = arrayMove(selectedTable.columns, oldIndex, newIndex).map((col, idx) => ({
      ...col,
      order: idx + 1,
    }));

    const updatedTable = {
      ...selectedTable,
      columns: newColumns,
    };

    setTables(tables.map(table =>
      table.id === selectedTable.id ? updatedTable : table
    ));
    setSelectedTable(updatedTable);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  /**
   * 保存表结构
   */
  const handleSaveStructure = async () => {
    if (!selectedTable || !project) return;
    
    // 验证表基本信息
    if (!selectedTable.name.trim()) {
      message.warning('表名不能为空');
      return;
    }
    
    if (!selectedTable.displayName.trim()) {
      message.warning('表中文名称不能为空');
      return;
    }
    
    // 验证列数据
    if (selectedTable.columns.length === 0) {
      message.warning('请至少添加一个字段');
      return;
    }
    
    // 验证每个字段的必填项
    const invalidColumns = selectedTable.columns.filter(column => {
      const hasEmptyName = !column.name.trim();
      const hasEmptyDisplayName = !column.displayName.trim();
      const hasEmptyType = !column.type.trim();
      
      return hasEmptyName || hasEmptyDisplayName || hasEmptyType;
    });
    
    if (invalidColumns.length > 0) {
      // 找出具体哪些字段有问题
      const invalidDetails = invalidColumns.map(column => {
        const issues = [];
        if (!column.name.trim()) issues.push('字段名');
        if (!column.displayName.trim()) issues.push('中文名称');
        if (!column.type.trim()) issues.push('数据类型');
        return `${column.displayName || '未命名字段'} (${issues.join('、')})`;
      });
      
      message.warning('以下字段信息不完整: ' + invalidDetails.join(', '));
      return;
    }
    
    // 验证字段名重复
    const columnNames = selectedTable.columns.map(col => col.name.trim().toLowerCase());
    const duplicateNames = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      message.warning(`存在重复的字段名: ${[...new Set(duplicateNames)].join(', ')}`);
      return;
    }
    
    // 验证中文名称重复
    const displayNames = selectedTable.columns.map(col => col.displayName.trim());
    const duplicateDisplayNames = displayNames.filter((name, index) => displayNames.indexOf(name) !== index);
    if (duplicateDisplayNames.length > 0) {
      message.warning(`存在重复的中文名称: ${[...new Set(duplicateDisplayNames)].join(', ')}`);
      return;
    }
    
    // 验证主键设置
    const primaryKeyColumns = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeyColumns.length === 0) {
      message.warning('当前表没有设置主键，建议设置主键字段');
      return;
    }
    
    try {
      console.log('=== 前端开始保存表结构 ===');
      console.log('项目ID:', project.id);
      console.log('表信息:', selectedTable);
      
      // 转换数据结构以匹配后端接口
      const tableData = {
        id: selectedTable.id,
        project_id: project.id,
        name: selectedTable.name,
        display_name: selectedTable.displayName,
        comment: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const columnsData = selectedTable.columns.map(column => ({
        id: column.id,
        table_id: selectedTable.id,
        name: column.name,
        display_name: column.displayName,
        data_type: column.type,
        length: column.length || null,
        scale: column.scale || null,
        nullable: column.nullable,
        primary_key: column.primaryKey,
        auto_increment: column.autoIncrement,
        default_value: column.defaultValue || null,
        comment: column.comment || null,
        sort_order: column.order,
      }));
      
      
      // 调用后端接口保存表结构
      await invoke('save_table_structure', {
        projectId: project.id,
        table: tableData,
        columns: columnsData,
      });
      message.success("保存成功");
    } catch (error) {
      console.error('保存表结构失败:', error);
      message.error('保存表结构失败: ' + error);
    }
  };

  /**
   * AI生成表结构回调
   */
  const handleAiTablesGenerated = async (aiTables: GeneratedTable[]) => {
    if (!project) return;

    try {
      const newTables: TableDef[] = [];

      for (let i = 0; i < aiTables.length; i++) {
        const aiTable = aiTables[i];
        const newId = (Date.now() + i).toString();

        const columnsData = aiTable.columns.map((col, colIdx) => ({
          id: (Date.now() + i * 1000 + colIdx).toString(),
          table_id: newId,
          name: col.name,
          display_name: col.displayName,
          data_type: col.type,
          length: col.length || null,
          nullable: col.nullable,
          primary_key: col.primaryKey,
          auto_increment: col.autoIncrement,
          default_value: col.defaultValue || null,
          comment: col.comment || null,
          sort_order: colIdx + 1,
        }));

        const tableData = {
          id: newId,
          project_id: project.id,
          name: aiTable.name,
          display_name: aiTable.displayName,
          comment: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        await invoke('save_table_structure', {
          projectId: project.id,
          table: tableData,
          columns: columnsData,
        });

        newTables.push({
          id: newId,
          name: aiTable.name,
          displayName: aiTable.displayName,
          columns: aiTable.columns.map((col, colIdx) => ({
            id: columnsData[colIdx].id,
            name: col.name,
            displayName: col.displayName,
            type: col.type,
            length: col.length,
            nullable: col.nullable,
            primaryKey: col.primaryKey,
            autoIncrement: col.autoIncrement,
            defaultValue: col.defaultValue,
            comment: col.comment,
            order: colIdx + 1,
          }))
        });
      }

      setTables(prev => [...prev, ...newTables]);
      if (newTables.length > 0) {
        setSelectedTable(newTables[0]);
      }
      setIsAiModalVisible(false);
      message.success(`成功创建 ${newTables.length} 张表`);
    } catch (error) {
      console.error('创建AI生成的表失败:', error);
      message.error('创建表失败: ' + error);
    }
  };

  // 列定义
  const columnsColumns = [
    {
      title: '排序',
      dataIndex: 'order',
      key: 'order',
      width: 60,
      render: () => <DragHandle />,
    },
    {
      title: '字段名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'name', e.target.value)}
          placeholder="字段名"
          size="small"
        />
      ),
    },
    {
      title: '中文名称',
      dataIndex: 'displayName',
      key: 'displayName',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'displayName', e.target.value)}
          placeholder="中文名称"
          size="small"
        />
      ),
    },
    {
      title: '数据类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string, record: ColumnDef) => {
        const dt = findDataType(dataTypes, type);
        const showLength = dt ? dt.hasLength : false;
        const showScale = dt ? dt.hasScale : false;
        return (
        <Space>
          <Select
            value={type}
            onChange={(value) => handleSaveColumn(record.id, 'type', value)}
            size="small"
            style={{ width: 130 }}
            showSearch
            optionFilterProp="children"
          >
            {dataTypes.map(dataType => (
              <Option key={dataType.value} value={dataType.value}>
                {dataType.label}
              </Option>
            ))}
          </Select>
          {showLength && !showScale && (
            <Input
              value={record.length}
              onChange={(e) => handleSaveColumn(record.id, 'length', parseInt(e.target.value) || undefined)}
              placeholder="长度"
              size="small"
              style={{ width: 80 }}
              type="number"
            />
          )}
          {showScale && (
            <>
              <Input
                value={record.length}
                onChange={(e) => handleSaveColumn(record.id, 'length', parseInt(e.target.value) || undefined)}
                placeholder="精度"
                size="small"
                style={{ width: 70 }}
                type="number"
              />
              <Input
                value={record.scale}
                onChange={(e) => handleSaveColumn(record.id, 'scale', parseInt(e.target.value) || undefined)}
                placeholder="小数位"
                size="small"
                style={{ width: 70 }}
                type="number"
              />
            </>
          )}
        </Space>
        );
      },
    },
    {
      title: '属性',
      key: 'properties',
      render: (_text: string, record: ColumnDef) => (
        <Space size={[0, 4]} wrap>
          <Switch
            checked={record.primaryKey}
            onChange={(checked) => {
              // 如果设置为主键，则必须是非空的
              handleSaveColumn(record.id, 'primaryKey', checked);
            }}
            size="small"
            checkedChildren="主键"
            unCheckedChildren="普通"
          />
          <Switch
            checked={!record.nullable}
            onChange={(checked) => {
              // 如果已经是主键，则不能设置为可空
              if (record.primaryKey && !checked) {
                showNotification('warning', '主键字段不能设置为可空');
                return;
              }
              handleSaveColumn(record.id, 'nullable', !checked);
            }}
            size="small"
            checkedChildren="非空"
            unCheckedChildren="可空"
            disabled={record.primaryKey}
          />
          <Switch
            checked={record.autoIncrement}
            onChange={(checked) => handleSaveColumn(record.id, 'autoIncrement', checked)}
            size="small"
            checkedChildren="自增"
            unCheckedChildren="非自增"
          />
        </Space>
      ),
    },
    {
      title: '默认值',
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'defaultValue', e.target.value)}
          placeholder="默认值"
          size="small"
        />
      ),
    },
    {
      title: '说明',
      dataIndex: 'comment',
      key: 'comment',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'comment', e.target.value)}
          placeholder="字段说明"
          size="small"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_text: string, record: ColumnDef) => (
        <Space size="small">
          <Tooltip title="删除字段">
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteColumn(record.id)}
            />
          </Tooltip>
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
    <>
      <Layout style={{ minHeight: '100vh' }}>
        {/* 头部 */}
        <Header 
          style={{ 
            background: isDarkMode ? '#141414' : '#fff',
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
            <Title level={3} style={{ margin: 0, color: isDarkMode ? '#fff' : '#000' }}>
              {project.name}
            </Title>
          </Space>
        </Header>

        {/* 项目级视图切换 */}
        <div style={{ padding: '0 24px', background: isDarkMode ? '#141414' : '#fff', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Tabs
            activeKey={projectView}
            onChange={setProjectView}
            style={{ marginBottom: 0 }}
            items={[
              {
                key: 'design',
                label: <span><TableOutlined /> 表设计</span>,
              },
              {
                key: 'version',
                label: <span><HistoryOutlined /> 版本管理</span>,
              },
              {
                key: 'sync',
                label: <span><CloudSyncOutlined /> 数据库同步</span>,
              },
              {
                key: 'sqlexport',
                label: <span><ExportOutlined /> SQL导出</span>,
              },
            ]}
          />
        </div>

        {projectView === 'design' ? (
        <Layout>
          {/* 左侧边栏 - 表列表 */}
          <Sider 
            width={300} 
            style={{ 
              background: isDarkMode ? '#141414' : '#fff',
              borderRight: `1px solid ${token.colorBorderSecondary}`
            }}
          >
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>表列表</Title>
                <Space>
                  <Button
                    icon={<RobotOutlined />}
                    size="small"
                    onClick={() => setIsAiModalVisible(true)}
                  >
                    AI设计
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={handleCreateTable}
                  >
                    新建表
                  </Button>
                </Space>
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
          <Content style={{ padding: '24px', background: isDarkMode ? '#000' : '#f5f5f5' }}>
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
                  
                  </div>
                  
                  <Tabs 
                    activeKey={activeTab} 
                    onChange={setActiveTab}
                    items={[
                      {
                        key: 'structure',
                        label: (
                          <span>
                            <TableOutlined />
                            表结构
                          </span>
                        ),
                        children: (
                          <div>
                            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Button 
                                type="primary" 
                                icon={<PlusOutlined />}
                                onClick={handleAddColumn}
                              >
                                添加列
                              </Button>
                              <Button 
                                type="primary" 
                                onClick={handleSaveStructure}
                              >
                                保存表结构
                              </Button>
                            </div>
                            <DndContext
                              sensors={sensors}
                              onDragEnd={handleDragEnd}
                            >
                              <SortableContext
                                items={selectedTable.columns.map(col => col.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <Table
                                  dataSource={selectedTable.columns.sort((a, b) => a.order - b.order)}
                                  columns={columnsColumns}
                                  pagination={false}
                                  rowKey="id"
                                  size="middle"
                                  components={{
                                    body: {
                                      row: DraggableRow,
                                    },
                                  }}
                                />
                              </SortableContext>
                            </DndContext>
                          </div>
                        )
                      },
                      {
                        key: 'index',
                        label: (
                          <span>
                            <DatabaseOutlined />
                            索引
                          </span>
                        ),
                        children: <IndexTab selectedTable={selectedTable} />
                      },
                      {
                        key: 'initData',
                        label: (
                          <span>
                            <FileTextOutlined />
                            初始数据
                          </span>
                        ),
                        children: <InitDataTab selectedTable={selectedTable} />
                      },
                      {
                        key: 'sql',
                        label: (
                          <span>
                            <CodeOutlined />
                            SQL
                          </span>
                        ),
                        children: <DatabaseCodeTab selectedTable={selectedTable} />
                      }
                    ]}
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
        ) : projectView === 'version' ? (
          <VersionTab project={project} />
        ) : projectView === 'sync' ? (
          <SyncTab project={project} />
        ) : (
          <SqlExportTab project={project} />
        )}
      </Layout>

      {/* 表编辑模态框 */}
      <Drawer
        title={editingTable ? '编辑表' : '新建表'}
        open={isTableModalVisible}
        onClose={() => setIsTableModalVisible(false)}
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
      </Drawer>

      {/* AI设计弹窗 */}
      <AiDesignModal
        open={isAiModalVisible}
        onCancel={() => setIsAiModalVisible(false)}
        onTablesGenerated={handleAiTablesGenerated}
        databaseType={project.database_type}
      />
    </>
  );
};

export default ProjectDetail;
