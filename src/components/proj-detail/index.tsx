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
  notification,
  Tooltip,
  Modal,
  Popconfirm,
  Tabs
} from 'antd';
import { 
  ArrowLeftOutlined,
  DatabaseOutlined,
  TableOutlined,
  CodeOutlined,
  SettingOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import IndexTab from './index-tab';
import DatabaseCodeTab from './database-code-tab';
import SortableTableRow from './sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;
const { useToken } = theme;
const { Option } = Select;
const { TabPane } = Tabs;

// 项目类型定义
interface Project {
  id: number;
  name: string;
  description?: string;
  database_type: string;
  created_at: string;
  updated_at: string;
}

// 前端表定义
interface TableDef {
  id: string;
  name: string;        // 表名（英文）
  displayName: string; // 中文名
  columns: ColumnDef[];
}

// 前端列定义
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
}

// 后端表定义
interface BackendTableDef {
  id: string;
  project_id: number;
  name: string;
  display_name: string;
  comment?: string;
  created_at: string;
  updated_at: string;
}

// 后端列定义
interface BackendColumnDef {
  id: string;
  table_id: string;
  name: string;
  display_name: string;
  data_type: string;
  length?: number;
  nullable: boolean;
  primary_key: boolean;
  auto_increment: boolean;
  default_value?: string;
  comment?: string;
  sort_order: number;
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
  const [activeTab, setActiveTab] = useState('structure');

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
   * 显示通知
   */
  const showNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string, description?: string) => {
    notification[type]({
      message,
      description,
      placement: 'topRight',
      duration: 3,
    });
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

      // 从后端加载表数据
      const projectTables: BackendTableDef[] = await invoke('get_project_tables', {
        projectId: currentProject.id
      });
      
      // 转换数据结构以匹配前端接口
      const tablesData: TableDef[] = await Promise.all(
        projectTables.map(async (table) => {
          const columns: BackendColumnDef[] = await invoke('get_table_columns', {
            tableId: table.id
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
              order: col.sort_order
            }))
          };
        })
      );
      
      setTables(tablesData);
      if (tablesData.length > 0) {
        setSelectedTable(tablesData[0]);
      }
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
  const handleDeleteTable = (tableId: string) => {
    setTables(tables.filter(table => table.id !== tableId));
    if (selectedTable?.id === tableId) {
      setSelectedTable(null);
    }
    showNotification('success', '表删除成功');
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
      showNotification('success', '表更新成功');
    } else {
      // 创建新表
      const newTable: TableDef = {
        id: Date.now().toString(),
        name: values.name,
        displayName: values.displayName,
        columns: []
      };
      setTables([...tables, newTable]);
      showNotification('success', '表创建成功');
    }
    setIsTableModalVisible(false);
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
    if (!selectedTable) return;
    
    const updatedTable = {
      ...selectedTable,
      columns: selectedTable.columns.map(col => 
        col.id === columnId 
          ? { ...col, [field]: value }
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

    if (active.id !== over?.id && selectedTable) {
      const oldIndex = selectedTable.columns.findIndex(col => col.id === active.id);
      const newIndex = selectedTable.columns.findIndex(col => col.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newColumns = arrayMove(selectedTable.columns, oldIndex, newIndex);
        
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
      }
    }
  };

  // 拖拽传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /**
   * 保存表结构
   */
  const handleSaveStructure = async () => {
    if (!selectedTable || !project) return;
    
    // 验证表基本信息
    if (!selectedTable.name.trim()) {
      showNotification('error', '表名不能为空');
      return;
    }
    
    if (!selectedTable.displayName.trim()) {
      showNotification('error', '表中文名称不能为空');
      return;
    }
    
    // 验证列数据
    if (selectedTable.columns.length === 0) {
      showNotification('error', '请至少添加一个字段');
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
      
      showNotification('error', '以下字段信息不完整', invalidDetails.join('\n'));
      return;
    
    // 验证字段名重复
    const columnNames = selectedTable.columns.map(col => col.name.trim().toLowerCase());
    const duplicateNames = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      showNotification('error', `存在重复的字段名: ${[...new Set(duplicateNames)].join(', ')}`);
      return;
    }
    
    // 验证中文名称重复
    const displayNames = selectedTable.columns.map(col => col.displayName.trim());
    const duplicateDisplayNames = displayNames.filter((name, index) => displayNames.indexOf(name) !== index);
    if (duplicateDisplayNames.length > 0) {
      showNotification('error', `存在重复的中文名称: ${[...new Set(duplicateDisplayNames)].join(', ')}`);
      return;
    }
    
    // 验证主键设置
    const primaryKeyColumns = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeyColumns.length === 0) {
      showNotification('warning', '当前表没有设置主键，建议设置主键字段');
    }
    
    try {
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
        length: column.length,
        nullable: column.nullable,
        primary_key: column.primaryKey,
        auto_increment: column.autoIncrement,
        default_value: column.defaultValue,
        comment: column.comment,
        sort_order: column.order,
      }));
      
      // 调用后端接口保存表结构
      await invoke('save_table_structure', {
        projectId: project.id,
        table: tableData,
        columns: columnsData,
      });
      showNotification('success', '表结构保存成功');
    } catch (error) {
      console.error('保存表结构失败:', error);
      showNotification('error', '保存表结构失败');
    }
  };

  // 列定义
  const columnsColumns = [
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
      render: (type: string, record: ColumnDef) => (
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
      ),
    },
    {
      title: '属性',
      key: 'properties',
      render: (text: string, record: ColumnDef) => (
        <Space size={[0, 4]} wrap>
          <Switch
            checked={record.primaryKey}
            onChange={(checked, event) => {
              event.stopPropagation();
              // 如果设置为主键，则必须是非空的
              handleSaveColumn(record.id, 'primaryKey', checked);
              if (checked) {
                handleSaveColumn(record.id, 'nullable', false);
              }
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
            checked
