import {
  ArrowLeftOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FileTextOutlined,
  FunctionOutlined,
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
  Checkbox,
  Form,
  Input,
  Layout,
  List,
  message,
  Drawer,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  theme,
  Tooltip,
  Typography
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../store/theme-context';
import { getAllDataTypes, findDataType } from '../../data-types';
import type { DataTypeOption } from '../../data-types';
import DatabaseCodeTab from './database-code-tab';
import IndexTab from './index-tab';
import InitDataTab from './init-data-tab';
import VersionTab from './version-tab';
import SyncTab from './sync-tab';
import SqlExportTab from './sql-export-tab';
import RoutineTab from './routine-tab';
import AiDesignModal from './ai-design-modal';
import AiModifyTableModal from './ai-modify-table-modal';
import AiReviewTab from './ai-review-tab';
import AiSqlTab from './ai-sql-tab';
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
  const { t } = useTranslation();

  const [project, setProject] = useState<Project | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [selectedTable, setSelectedTable] = useState<TableDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableForm] = Form.useForm();
  const [isTableModalVisible, setIsTableModalVisible] = useState(false);
  const [editingTable, setEditingTable] = useState<TableDef | null>(null);
  const [activeTab, setActiveTab] = useState('structure');
  const [projectView, setProjectView] = useState('design');
  const [isAiCreateModalVisible, setIsAiCreateModalVisible] = useState(false);
  const [isAiModifyModalVisible, setIsAiModifyModalVisible] = useState(false);
  const [dataTypes, setDataTypes] = useState<DataTypeOption[]>([]);
  const [tableSearchKeyword, setTableSearchKeyword] = useState('');

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
              defaultNull: col.default_null ?? false,
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
      console.error('Failed to load table list:', error);
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
        showNotification('error', t('proj_not_exist'));
        navigate('/');
        return;
      }

      setProject(currentProject);
      await loadTables(currentProject.id);
    } catch (error) {
      console.error('Failed to load project detail:', error);
      showNotification('error', t('proj_load_fail'));
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
      showNotification('success', t('table_delete_success'));
    } catch (error) {
      console.error('Failed to delete table:', error);
      showNotification('error', `${t('table_delete_fail')}: ${error}`);
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
          default_null: column.defaultNull ?? false,
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
        showNotification('success', t('table_update_success'));
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
        showNotification('success', t('table_create_success'));
      }
      setIsTableModalVisible(false);
    } catch (error) {
      console.error('Failed to save table:', error);
      showNotification('error', `${t('table_save_fail')}: ${error}`);
    }
  };

  /**
   * 添加列
   */
  const handleAddColumn = () => {
    if (!selectedTable) {
      showNotification('warning', t('table_select_first'));
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
      defaultNull: false,
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
      updateObj.defaultNull = false;
    }
    // 非空字段不允许 DEFAULT NULL
    if (field === 'nullable' && value === false) {
      updateObj.defaultNull = false;
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
    showNotification('success', t('col_delete_success'));
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
      message.warning(t('col_table_name_empty'));
      return;
    }
    
    if (!selectedTable.displayName.trim()) {
      message.warning(t('col_table_display_name_empty'));
      return;
    }
    
    if (selectedTable.columns.length === 0) {
      message.warning(t('col_at_least_one'));
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
      const invalidDetails = invalidColumns.map(column => {
        const issues = [];
        if (!column.name.trim()) issues.push(t('col_name_empty'));
        if (!column.displayName.trim()) issues.push(t('col_display_name_empty'));
        if (!column.type.trim()) issues.push(t('col_data_type_empty'));
        return t('col_incomplete_item', { name: column.displayName || t('col_unnamed'), issues: issues.join(', ') });
      });
      
      message.warning(`${t('col_incomplete_prefix')} ${invalidDetails.join(', ')}`);
      return;
    }
    
    // 验证字段名重复
    const columnNames = selectedTable.columns.map(col => col.name.trim().toLowerCase());
    const duplicateNames = columnNames.filter((name, index) => columnNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      message.warning(t('col_duplicate_name', { names: [...new Set(duplicateNames)].join(', ') }));
      return;
    }
    
    // 验证中文名称重复
    const displayNames = selectedTable.columns.map(col => col.displayName.trim());
    const duplicateDisplayNames = displayNames.filter((name, index) => displayNames.indexOf(name) !== index);
    if (duplicateDisplayNames.length > 0) {
      message.warning(t('col_duplicate_display_name', { names: [...new Set(duplicateDisplayNames)].join(', ') }));
      return;
    }
    
    // 验证主键设置
    const primaryKeyColumns = selectedTable.columns.filter(col => col.primaryKey);
    if (primaryKeyColumns.length === 0) {
      message.warning(t('col_no_primary_key'));
      return;
    }
    
    try {
      console.log('=== Start saving table structure ===');
      console.log('Project ID:', project.id);
      console.log('Table info:', selectedTable);
      
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
        default_value: column.defaultValue != null ? String(column.defaultValue) : null,
        default_null: column.defaultNull ?? false,
        comment: column.comment != null ? String(column.comment) : null,
        sort_order: column.order,
      }));
      
      
      // 调用后端接口保存表结构
      await invoke('save_table_structure', {
        projectId: project.id,
        table: tableData,
        columns: columnsData,
      });
      message.success(t('save_success'));
    } catch (error) {
      console.error('Failed to save table structure:', error);
      message.error(`${t('table_save_fail')}: ${error}`);
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
          default_null: col.defaultNull ?? false,
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
            defaultNull: col.defaultNull ?? false,
            comment: col.comment,
            order: colIdx + 1,
          }))
        });
      }

      setTables(prev => [...prev, ...newTables]);
      if (newTables.length > 0) {
        setSelectedTable(newTables[0]);
      }
      setIsAiCreateModalVisible(false);
      message.success(t('ai_design_success', { count: newTables.length }));
    } catch (error) {
      console.error('Failed to create AI-generated tables:', error);
      message.error(`${t('table_create_fail')}: ${error}`);
    }
  };

  /**
   * AI修改表结构回调
   */
  const handleAiTableModified = (aiTable: GeneratedTable) => {
    if (!selectedTable) return;

    const updatedColumns = aiTable.columns.map((col, idx) => ({
      id: Date.now().toString() + idx,
      name: col.name,
      displayName: col.displayName,
      type: col.type,
      length: col.length,
      nullable: col.nullable,
      primaryKey: col.primaryKey,
      autoIncrement: col.autoIncrement,
      defaultValue: col.defaultValue,
      defaultNull: col.defaultNull ?? false,
      comment: col.comment,
      order: idx + 1,
    }));

    const updatedTable: TableDef = {
      ...selectedTable,
      columns: updatedColumns,
    };

    setTables(prev => prev.map(t => t.id === selectedTable.id ? updatedTable : t));
    setSelectedTable(updatedTable);
    setIsAiModifyModalVisible(false);
    message.success(t('ai_modify_applied'));
  };

  // 列定义
  const columnsColumns = [
    {
      title: t('col_order'),
      dataIndex: 'order',
      key: 'order',
      width: 60,
      render: () => <DragHandle />,
    },
    {
      title: t('col_name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'name', e.target.value)}
          placeholder={t('col_name_placeholder')}
          size="small"
        />
      ),
    },
    {
      title: t('col_display_name'),
      dataIndex: 'displayName',
      key: 'displayName',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'displayName', e.target.value)}
          placeholder={t('col_display_name_placeholder')}
          size="small"
        />
      ),
    },
    {
      title: t('col_data_type'),
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
              placeholder={t('col_length')}
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
                placeholder={t('col_precision')}
                size="small"
                style={{ width: 70 }}
                type="number"
              />
              <Input
                value={record.scale}
                onChange={(e) => handleSaveColumn(record.id, 'scale', parseInt(e.target.value) || undefined)}
                placeholder={t('col_scale')}
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
      title: t('col_attribute'),
      key: 'properties',
      render: (_text: string, record: ColumnDef) => (
        <Space size={[16, 4]} wrap>
          <Checkbox
            checked={record.primaryKey}
            onChange={(e) => {
              handleSaveColumn(record.id, 'primaryKey', e.target.checked);
            }}
          >
            {t('col_primary_key')}
          </Checkbox>
          <Checkbox
            checked={!record.nullable}
            onChange={(e) => {
              if (record.primaryKey && !e.target.checked) {
                showNotification('warning', t('col_primary_key_cannot_nullable'));
                return;
              }
              handleSaveColumn(record.id, 'nullable', !e.target.checked);
            }}
            disabled={record.primaryKey}
          >
            {t('col_not_null')}
          </Checkbox>
          <Checkbox
            checked={record.autoIncrement}
            onChange={(e) => handleSaveColumn(record.id, 'autoIncrement', e.target.checked)}
          >
            {t('col_auto_increment')}
          </Checkbox>
        </Space>
      ),
    },
    {
      title: t('col_default_value'),
      dataIndex: 'defaultValue',
      key: 'defaultValue',
      render: (text: string, record: ColumnDef) => (
        <Space size={4}>
          <Checkbox
            checked={record.defaultNull}
            onChange={(e) => handleSaveColumn(record.id, 'defaultNull', e.target.checked)}
            disabled={!record.nullable}
          >NULL</Checkbox>
          <Input
            value={text}
            onChange={(e) => handleSaveColumn(record.id, 'defaultValue', e.target.value)}
            placeholder={t('col_default_value_placeholder')}
            size="small"
            disabled={record.defaultNull}
          />
        </Space>
      ),
    },
    {
      title: t('col_comment'),
      dataIndex: 'comment',
      key: 'comment',
      render: (text: string, record: ColumnDef) => (
        <Input
          value={text}
          onChange={(e) => handleSaveColumn(record.id, 'comment', e.target.value)}
          placeholder={t('col_comment_placeholder')}
          size="small"
        />
      ),
    },
    {
      title: t('col_action'),
      key: 'action',
      render: (_text: string, record: ColumnDef) => (
        <Space size="small">
          <Tooltip title={t('col_delete_tooltip')}>
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
        <Text>{t('loading')}</Text>
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text>{t('proj_not_exist')}</Text>
      </div>
    );
  }

  return (
    <>
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
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
            <Tooltip title={t('proj_back_home')}>
              <Button 
                type="text" 
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
              >
                {t('proj_back')}
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
                label: <span><TableOutlined /> {t('tab_table_design')}</span>,
              },
              {
                key: 'routine',
                label: <span><FunctionOutlined /> {t('tab_routine')}</span>,
              },
              {
                key: 'version',
                label: <span><HistoryOutlined /> {t('tab_version')}</span>,
              },
              {
                key: 'sync',
                label: <span><CloudSyncOutlined /> {t('tab_sync')}</span>,
              },
              {
                key: 'sqlexport',
                label: <span><ExportOutlined /> {t('tab_sql_export')}</span>,
              },
              {
                key: 'aireview',
                label: <span><RobotOutlined /> {t('tab_ai_review')}</span>,
              },
              {
                key: 'aisql',
                label: <span><RobotOutlined /> {t('tab_ai_sql')}</span>,
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
              borderRight: `1px solid ${token.colorBorderSecondary}`,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
                <Title level={4} style={{ margin: 0 }}>{t('table_list')}</Title>
                <Space>
                  <Button
                    icon={<RobotOutlined />}
                    size="small"
                    onClick={() => setIsAiCreateModalVisible(true)}
                  >
                    {t('table_ai_design')}
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={handleCreateTable}
                  >
                    {t('table_new')}
                  </Button>
                </Space>
              </div>

              <Input.Search
                placeholder={t('table_search')}
                allowClear
                size="small"
                style={{ marginBottom: 12, flexShrink: 0 }}
                onSearch={(value) => setTableSearchKeyword(value)}
                onClear={() => setTableSearchKeyword('')}
              />

              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <List
                dataSource={tables.filter(t => {
                  if (!tableSearchKeyword) return true;
                  const kw = tableSearchKeyword.toLowerCase();
                  return t.name.toLowerCase().includes(kw) || t.displayName.toLowerCase().includes(kw);
                })}
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
                        title={t('table_confirm_delete')}
                        okText={t('confirm')}
                        cancelText={t('cancel')}
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
                      <div style={{ color: token.colorTextDisabled }}>{t('table_empty')}</div>
                    </div>
                  )
                }}
              />
              </div>
            </div>
          </Sider>

          {/* 右侧内容 - 表设计 */}
          <Content style={{ padding: '24px', background: isDarkMode ? '#000' : '#f5f5f5', overflowY: 'auto' }}>
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
                            {t('table_structure')}
                          </span>
                        ),
                        children: (
                          <div>
                            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Space>
                                <Button
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  onClick={handleAddColumn}
                                >
                                  {t('table_add_column')}
                                </Button>
                                <Button
                                  icon={<RobotOutlined />}
                                  onClick={() => setIsAiModifyModalVisible(true)}
                                >
                                  {t('table_ai_modify')}
                                </Button>
                              </Space>
                              <Button
                                type="primary"
                                onClick={handleSaveStructure}
                              >
                                {t('table_save_structure')}
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
                            {t('tab_index')}
                          </span>
                        ),
                        children: <IndexTab selectedTable={selectedTable} tables={tables} />
                      },
                      {
                        key: 'initData',
                        label: (
                          <span>
                            <FileTextOutlined />
                            {t('table_metadata')}
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
                  <div style={{ color: token.colorTextDisabled }}>{t('table_select_start')}</div>
                </div>
              )}
            </div>
          </Content>
        </Layout>
        ) : projectView === 'routine' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <RoutineTab project={project} />
          </div>
        ) : projectView === 'version' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <VersionTab project={project} />
          </div>
        ) : projectView === 'sync' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <SyncTab project={project} />
          </div>
        ) : projectView === 'aireview' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <AiReviewTab project={project} tables={tables} />
          </div>
        ) : projectView === 'aisql' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <AiSqlTab project={project} tables={tables} />
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <SqlExportTab project={project} />
          </div>
        )}
      </Layout>

      {/* 表编辑模态框 */}
      <Drawer
        title={editingTable ? t('table_edit') : t('table_new')}
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
            label={t('table_name_en')}
            rules={[{ required: true, message: t('table_name_en_required') }]}
          >
            <Input placeholder={t('table_name_en_placeholder')} />
          </Form.Item>

          <Form.Item
            name="displayName"
            label={t('table_display_name')}
            rules={[{ required: true, message: t('table_display_name_required') }]}
          >
            <Input placeholder={t('table_display_name_placeholder')} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingTable ? t('table_update') : t('create')}
              </Button>
              <Button onClick={() => setIsTableModalVisible(false)}>
                {t('cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      {/* AI设计弹窗 */}
      <AiDesignModal
        open={isAiCreateModalVisible}
        onCancel={() => setIsAiCreateModalVisible(false)}
        onTablesGenerated={handleAiTablesGenerated}
        tables={tables}
      />
      {selectedTable && (
        <AiModifyTableModal
          open={isAiModifyModalVisible}
          onCancel={() => setIsAiModifyModalVisible(false)}
          selectedTable={selectedTable}
          onTableModified={handleAiTableModified}
        />
      )}
    </>
  );
};

export default ProjectDetail;
