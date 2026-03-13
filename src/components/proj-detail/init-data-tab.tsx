import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Button,
  Card,
  DatePicker,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Space,
  Switch,
  Table,
  TimePicker,
  Typography,
  Upload,
} from 'antd';
import dayjs from 'dayjs';
import {
  PlusOutlined,
  DeleteOutlined,
  UploadOutlined,
  SaveOutlined,
  SearchOutlined,
  StopOutlined,
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
  const [searchText, setSearchText] = useState('');
  const [filterText, setFilterText] = useState('');

  // 当选中表变化时，从后端加载已保存的元数据
  useEffect(() => {
    if (selectedTable) {
      loadInitData();
    } else {
      setDataRows([]);
    }
    setSearchText('');
    setFilterText('');
  }, [selectedTable?.id]);

  // 搜索过滤后的数据
  const filteredRows = dataRows.filter(row => {
    if (!filterText) return true;
    if (!selectedTable) return false;
    // 仅搜索定义好的列内容
    return selectedTable.columns.some(col => {
      const val = row[col.name];
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(filterText.toLowerCase());
    });
  });

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
    
    // 如果有搜索内容，清除搜索以便看到新添加的行
    if (filterText) {
      setSearchText('');
      setFilterText('');
    }

    const newRow: DataRow = { _key: `row_${Date.now()}` };
    selectedTable.columns.forEach(col => {
      const type = col.type.toLowerCase();
      // 判断如果是可NULL且无默认值就是NULL，非NULL且无默认值就空字符串
      const hasDefaultValue = col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '';

      if (col.defaultNull) {
        newRow[col.name] = null;
      } else if (hasDefaultValue) {
        newRow[col.name] = col.defaultValue;
      } else {
        // 如果是日期类型且无默认值，默认为当前时间
        if (['datetime', 'timestamp'].includes(type)) {
          newRow[col.name] = dayjs().format('YYYY-MM-DD HH:mm:ss');
        } else if (type === 'date') {
          newRow[col.name] = dayjs().format('YYYY-MM-DD');
        } else if (type === 'time') {
          newRow[col.name] = dayjs().format('HH:mm:ss');
        } else if (col.nullable) {
          newRow[col.name] = null;
        } else {
          newRow[col.name] = '';
        }
      }
    });
    setDataRows([newRow, ...dataRows]);
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

    // 获取主键字段
    const pkColumns = selectedTable.columns.filter(c => c.primaryKey);
    const pkSet = new Set<string>();

    // 验证数据规则
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      // 1. 主键校验 (非空且唯一)
      if (pkColumns.length > 0) {
        const pkValues = pkColumns.map(col => {
          const val = row[col.name];
          if (val === null || val === undefined || String(val).trim() === '') {
            return null;
          }
          return String(val);
        });

        const hasNullPk = pkValues.some(v => v === null);
        if (hasNullPk) {
          // 校验所有为空的主键字段（自增字段允许为空，其余不允许）
          for (let j = 0; j < pkValues.length; j++) {
            if (pkValues[j] === null && !pkColumns[j].autoIncrement) {
              message.error(`第 ${i + 1} 行主键字段 "${pkColumns[j].displayName}" 不能为空`);
              return;
            }
          }
        }

        // 仅对所有主键均有值的行进行唯一性校验
        if (!hasNullPk) {
          const pkKey = pkValues.join('|');
          if (pkSet.has(pkKey)) {
            message.error(`第 ${i + 1} 行主键冲突: [${pkValues.join(', ')}] 已存在`);
            return;
          }
          pkSet.add(pkKey);
        }
      }

      for (const col of selectedTable.columns) {
        const value = row[col.name];
        
        // 2. 非空校验 (非主键字段的非空校验)
        if (!col.primaryKey && !col.nullable) {
          if (value === null || value === undefined) {
            message.error(`第 ${i + 1} 行 "${col.displayName}" 不能为空 (NULL)`);
            return;
          }
          // 数值类型不允许空字符串
          const type = col.type.toLowerCase();
          if (['int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'float', 'double', 'numeric'].includes(type)) {
            if (String(value).trim() === '') {
              message.error(`第 ${i + 1} 行 "${col.displayName}" 不能为空`);
              return;
            }
          }
        }

        // 3. 类型与规则校验
        if (value !== null && value !== undefined) {
          const type = col.type.toLowerCase();
          const strVal = String(value);

          // 时间类型非空字符串校验 (无论是否可 NULL，只要有值就不能是空字符串)
          if (['datetime', 'timestamp', 'date', 'time'].includes(type)) {
            if (strVal.trim() === '') {
              message.error(`第 ${i + 1} 行 "${col.displayName}" 格式错误：时间不能为空字符串`);
              return;
            }
          }

          // 字符串类型非空字符串校验 (仅针对非 NULL 字段)
          if (['varchar', 'char', 'text', 'string'].includes(type)) {
            if (!col.nullable && strVal.trim() === '') {
              message.error(`第 ${i + 1} 行 "${col.displayName}" 不能为空字符串`);
              return;
            }
          }

          // 其他类型校验 (需要排除空字符串，因为空字符串在上面已经处理或允许)
          if (strVal !== '') {
            // 整数校验
            if (['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type)) {
              if (isNaN(Number(value)) || !Number.isInteger(Number(value))) {
                message.error(`第 ${i + 1} 行 "${col.displayName}" 必须是整数`);
                return;
              }
            } 
            // 数字校验
            else if (['decimal', 'float', 'double', 'numeric'].includes(type)) {
              if (isNaN(Number(value))) {
                message.error(`第 ${i + 1} 行 "${col.displayName}" 必须是数字`);
                return;
              }
            }
            // 长度校验 (字符串类型)
            else if (['varchar', 'char', 'text', 'string'].includes(type)) {
              if (col.length && strVal.length > col.length) {
                message.error(`第 ${i + 1} 行 "${col.displayName}" 长度超出限制 (最大 ${col.length})`);
                return;
              }
            }
          }
        }
      }
    }

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
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
          message.warning('Excel 文件中没有数据');
          return;
        }

        const DATE_TYPES = ['date', 'datetime', 'timestamp', 'time'];

        const formatDateValue = (rawValue: any, colType: string): string => {
          let d: dayjs.Dayjs | null = null;

          if (rawValue instanceof Date) {
            // cellDates: true 解析出的 JS Date 对象
            d = dayjs(rawValue);
          } else if (typeof rawValue === 'number') {
            // Excel 日期序列号（如 45985.4667592593）
            // Excel 序列号起始日期为 1899-12-30，需加 Excel 1900 闰年 bug 修正
            const excelEpoch = dayjs('1899-12-30');
            d = excelEpoch.add(rawValue, 'day');
          } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
            // 字符串格式的日期，尝试解析
            const parsed = dayjs(rawValue);
            if (parsed.isValid()) {
              d = parsed;
            } else {
              return rawValue; // 无法解析，原样返回
            }
          }

          if (!d || !d.isValid()) return String(rawValue);

          if (colType === 'time') return d.format('HH:mm:ss');
          if (colType === 'date') return d.format('YYYY-MM-DD');
          return d.format('YYYY-MM-DD HH:mm:ss');
        };

        // 将 Excel 列名映射到表字段
        const importedRows: DataRow[] = jsonData.map((excelRow, idx) => {
          const row: DataRow = { _key: `import_${idx}_${Date.now()}` };
          selectedTable!.columns.forEach(col => {
            const rawValue = excelRow[col.name] !== undefined
              ? excelRow[col.name]
              : excelRow[col.displayName] !== undefined
                ? excelRow[col.displayName]
                : undefined;

            // 导入excel的时候如果字段是NULL，判断是否可以为NULL插入值，不要将NULL的字符串写入
            if (rawValue === undefined || rawValue === null || String(rawValue).toUpperCase() === 'NULL') {
              if (col.nullable) {
                row[col.name] = null;
              } else {
                row[col.name] = '';
              }
              return;
            }

            const colType = col.type.toLowerCase();
            if (DATE_TYPES.includes(colType)) {
              row[col.name] = formatDateValue(rawValue, colType);
            } else {
              row[col.name] = String(rawValue);
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
    const isNull = value === null;

    // 当点击 NULL 图标时切换 NULL 状态
    const handleSetNull = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isNull) {
        // 取消 NULL 状态，直接设置为空
        handleCellChange(rowKey, col.name, '');
      } else {
        // 设置为 NULL
        handleCellChange(rowKey, col.name, null);
      }
    };

    // 渲染 NULL 图标
    const renderNullIcon = () => {
      if (!col.nullable) return null;
      return (
        <Button
          type="text"
          size="small"
          onClick={handleSetNull}
          title={isNull ? "点击取消 NULL" : "点击设置为 NULL"}
          style={{ 
            color: isNull ? '#ff4d4f' : '#bfbfbf',
            padding: '0 4px',
            marginLeft: 4,
          }}
          icon={<StopOutlined />}
        />
      );
    };

    let editor;

    if (isNull) {
      editor = (
        <Input
          size="small"
          value="NULL"
          readOnly
          style={{ 
            width: '100%', 
            color: '#ff4d4f', 
            fontStyle: 'italic',
            backgroundColor: 'rgba(255, 77, 79, 0.05)'
          }}
          onClick={() => {
            // 点击 NULL 文本时也直接设置为空
            handleCellChange(rowKey, col.name, '');
          }}
        />
      );
    } else if (type === 'boolean') {
      editor = (
        <Switch
          size="small"
          checked={value === 'true' || value === '1' || value === true}
          onChange={(checked) => handleCellChange(rowKey, col.name, checked ? '1' : '0')}
        />
      );
    } else if (['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type)) {
      editor = (
        <InputNumber
          size="small"
          value={value !== '' ? Number(value) : undefined}
          onChange={(v) => handleCellChange(rowKey, col.name, v !== null ? String(v) : '')}
          style={{ width: '100%' }}
          placeholder={col.displayName}
        />
      );
    } else if (['decimal', 'float', 'double', 'numeric'].includes(type)) {
      editor = (
        <InputNumber
          size="small"
          value={value !== '' ? Number(value) : undefined}
          onChange={(v) => handleCellChange(rowKey, col.name, v !== null ? String(v) : '')}
          style={{ width: '100%' }}
          step={0.01}
          placeholder={col.displayName}
        />
      );
    } else if (['datetime', 'timestamp'].includes(type)) {
      editor = (
        <DatePicker
          showTime
          size="small"
          allowClear={false} // 去掉清除按钮
          value={value ? dayjs(value) : null}
          onChange={(_d, dateStr) => handleCellChange(rowKey, col.name, dateStr as string)}
          style={{ width: '100%' }}
          placeholder={col.displayName}
          format="YYYY-MM-DD HH:mm:ss"
        />
      );
    } else if (type === 'date') {
      editor = (
        <DatePicker
          size="small"
          allowClear={false} // 去掉清除按钮
          value={value ? dayjs(value) : null}
          onChange={(_d, dateStr) => handleCellChange(rowKey, col.name, dateStr as string)}
          style={{ width: '100%' }}
          placeholder={col.displayName}
          format="YYYY-MM-DD"
        />
      );
    } else if (type === 'time') {
      editor = (
        <TimePicker
          size="small"
          allowClear={false} // 去掉清除按钮
          value={value ? dayjs(value, 'HH:mm:ss') : null}
          onChange={(_t, timeStr) => handleCellChange(rowKey, col.name, timeStr as string)}
          style={{ width: '100%' }}
          placeholder={col.displayName}
          format="HH:mm:ss"
        />
      );
    } else {
      // 默认文本输入
      editor = (
        <Input
          size="small"
          value={value}
          onChange={(e) => handleCellChange(rowKey, col.name, e.target.value)}
          placeholder={col.displayName}
        />
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>{editor}</div>
        {renderNullIcon()}
      </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Title level={4} style={{ margin: 0 }}>元数据管理</Title>
            <Input
              placeholder="搜索所有字段（回车搜索）"
              prefix={<SearchOutlined />}
              allowClear
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (!e.target.value) {
                  setFilterText('');
                }
              }}
              onPressEnter={() => setFilterText(searchText)}
              style={{ width: 250 }}
            />
          </div>
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
          dataSource={filteredRows}
          columns={buildColumns()}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条`
          }}
          rowKey="_key"
          size="small"
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">
                  {filterText ? '未找到匹配结果' : '暂无数据，点击"添加行"或"导入 Excel"开始'}
                </Text>
              </div>
            ),
          }}
        />


      </Card>
    </div>
  );
};

export default InitDataTab;
