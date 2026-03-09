import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Space,
  Switch,
  Table,
  Typography,
  Upload,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { TableDef, ColumnDef } from '../../types';
import * as XLSX from 'xlsx';

const { Title, Text } = Typography;

interface InitDataTabProps {
  selectedTable: TableDef | null;
}

// 一行元数据 = { _key: string, [columnName]: value }
type DataRow = Record<string, any>;

const InitDataTab: React.FC<InitDataTabProps> = ({ selectedTable }) => {
  const [dataRows, setDataRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 当选中表变化时，从后端加载已保存的元数据
  useEffect(() => {
    if (selectedTable) {
      loadInitData();
    } else {
      setDataRows([]);
    }
  }, [selectedTable?.id]);

  const loadInitData = async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const result = await invoke<Array<{ id: number; table_id: string; data: string; created_at: string }>>(
        'get_init_data',
        { tableId: selectedTable.id }
      );
      const rows: DataRow[] = result.map((item, index) => {
        const parsed = JSON.parse(item.data);
        return { _key: `row_${index}_${Date.now()}`, ...parsed };
      });
      setDataRows(rows);
    } catch (error) {
      console.error('加载元数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 添加空行
  const handleAddRow = () => {
    if (!selectedTable) {
      message.warning('请先选择一个表');
      return;
    }
    const newRow: DataRow = { _key: `row_${Date.now()}` };
    selectedTable.columns.forEach(col => {
      newRow[col.name] = col.defaultValue ?? '';
    });
    setDataRows([...dataRows, newRow]);
  };

  // 修改单元格
  const handleCellChange = (rowKey: string, columnName: string, value: any) => {
    setDataRows(dataRows.map(row =>
      row._key === rowKey ? { ...row, [columnName]: value } : row
    ));
  };

  // 删除行
  const handleDeleteRow = (rowKey: string) => {
    setDataRows(dataRows.filter(row => row._key !== rowKey));
  };

  // 保存到后端
  const handleSave = async () => {
    if (!selectedTable) return;
    try {
      // 将每行数据转为 JSON（去掉 _key）
      const rowJsons = dataRows.map(row => {
        const { _key, ...rest } = row;
        return JSON.stringify(rest);
      });
      await invoke('save_init_data', {
        tableId: selectedTable.id,
        rows: rowJsons,
      });
      message.success('元数据保存成功');
    } catch (error) {
      console.error('保存元数据失败:', error);
      message.error('保存元数据失败');
    }
  };

  // Excel 导入
  const handleImportExcel = (file: File) => {
    if (!selectedTable) {
      message.warning('请先选择一个表');
      return false;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
          message.warning('Excel 文件中没有数据');
          return;
        }

        // 将 Excel 列名映射到表字段
        const importedRows: DataRow[] = jsonData.map((excelRow, idx) => {
          const row: DataRow = { _key: `import_${idx}_${Date.now()}` };
          selectedTable!.columns.forEach(col => {
            // 优先匹配字段名，其次匹配中文名
            if (excelRow[col.name] !== undefined) {
              row[col.name] = String(excelRow[col.name]);
            } else if (excelRow[col.displayName] !== undefined) {
              row[col.name] = String(excelRow[col.displayName]);
            } else {
              row[col.name] = '';
            }
          });
          return row;
        });

        setDataRows([...dataRows, ...importedRows]);
        message.success(`成功导入 ${importedRows.length} 条数据`);
      } catch (err) {
        console.error('Excel解析失败:', err);
        message.error('Excel 文件解析失败');
      }
    };
    reader.readAsArrayBuffer(file);

    return false; // 阻止 antd Upload 默认上传
  };

  // 根据列类型渲染编辑控件
  const renderCellEditor = (col: ColumnDef, value: any, rowKey: string) => {
    const type = col.type.toLowerCase();

    if (type === 'boolean') {
      return (
        <Switch
          size="small"
          checked={value === 'true' || value === '1' || value === true}
          onChange={(checked) => handleCellChange(rowKey, col.name, checked ? '1' : '0')}
        />
      );
    }

    if (['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type)) {
      return (
        <InputNumber
          size="small"
          value={value !== '' ? Number(value) : undefined}
          onChange={(v) => handleCellChange(rowKey, col.name, v !== null ? String(v) : '')}
          style={{ width: '100%' }}
          placeholder={col.displayName}
        />
      );
    }

    if (['decimal', 'float', 'double', 'numeric'].includes(type)) {
      return (
        <InputNumber
          size="small"
          value={value !== '' ? Number(value) : undefined}
          onChange={(v) => handleCellChange(rowKey, col.name, v !== null ? String(v) : '')}
          style={{ width: '100%' }}
          step={0.01}
          placeholder={col.displayName}
        />
      );
    }

    // 默认文本输入
    return (
      <Input
        size="small"
        value={value}
        onChange={(e) => handleCellChange(rowKey, col.name, e.target.value)}
        placeholder={col.displayName}
      />
    );
  };

  // 动态生成表格列
  const buildColumns = () => {
    if (!selectedTable) return [];

    const cols: any[] = selectedTable.columns.map(col => ({
      title: (
        <span>
          {col.displayName}
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{col.name}</Text>
        </span>
      ),
      dataIndex: col.name,
      key: col.name,
      width: 150,
      render: (value: any, record: DataRow) => renderCellEditor(col, value, record._key),
    }));

    // 操作列
    cols.push({
      title: '操作',
      key: '_action',
      width: 60,
      fixed: 'right' as const,
      render: (_: any, record: DataRow) => (
        <Popconfirm title="确定删除此行？" onConfirm={() => handleDeleteRow(record._key)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    });

    return cols;
  };

  if (!selectedTable) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">请从左侧选择一个表管理元数据</Text>
      </div>
    );
  }

  if (selectedTable.columns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">当前表尚未定义字段，请先在"表结构"中添加字段</Text>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>元数据管理</Title>
          <Space>
            <Upload
              accept=".xlsx,.xls,.csv"
              showUploadList={false}
              beforeUpload={handleImportExcel}
            >
              <Button icon={<UploadOutlined />}>导入 Excel</Button>
            </Upload>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddRow}
            >
              添加行
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
            >
              保存
            </Button>
          </Space>
        </div>

        <Table
          dataSource={dataRows}
          columns={buildColumns()}
          pagination={false}
          rowKey="_key"
          size="small"
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">暂无数据，点击"添加行"或"导入 Excel"开始</Text>
              </div>
            ),
          }}
        />

        <div style={{ marginTop: 12 }}>
          <Text type="secondary">
            共 {dataRows.length} 条数据。支持导入 .xlsx / .xls / .csv 文件，Excel 表头需与字段名或中文名匹配。
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default InitDataTab;
