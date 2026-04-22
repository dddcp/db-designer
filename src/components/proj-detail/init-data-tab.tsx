import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

type DataRow = Record<string, any>;

const InitDataTab: React.FC<InitDataTabProps> = ({ selectedTable }) => {
  const { t } = useTranslation();
  const [dataRows, setDataRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    if (selectedTable) {
      loadInitData();
    } else {
      setDataRows([]);
    }
    setSearchText('');
    setFilterText('');
  }, [selectedTable?.id]);

  const filteredRows = dataRows.filter(row => {
    if (!filterText) return true;
    if (!selectedTable) return false;
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

  const handleAddRow = () => {
    if (!selectedTable) {
      message.warning(t('init_data_select_table'));
      return;
    }
    
    if (filterText) {
      setSearchText('');
      setFilterText('');
    }

    const newRow: DataRow = { _key: `row_${Date.now()}` };
    selectedTable.columns.forEach(col => {
      const type = col.type.toLowerCase();
      const hasDefaultValue = col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue !== '';

      if (col.defaultNull) {
        newRow[col.name] = null;
      } else if (hasDefaultValue) {
        newRow[col.name] = col.defaultValue;
      } else {
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

  const handleCellChange = (rowKey: string, columnName: string, value: any) => {
    setDataRows(dataRows.map(row =>
      row._key === rowKey ? { ...row, [columnName]: value } : row
    ));
  };

  const handleDeleteRow = (rowKey: string) => {
    setDataRows(dataRows.filter(row => row._key !== rowKey));
  };

  const handleSave = async () => {
    if (!selectedTable) return;

    const pkColumns = selectedTable.columns.filter(c => c.primaryKey);
    const pkSet = new Set<string>();

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
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
          for (let j = 0; j < pkValues.length; j++) {
            if (pkValues[j] === null && !pkColumns[j].autoIncrement) {
              message.error(t('init_data_pk_not_null', { row: i + 1, column: pkColumns[j].displayName }));
              return;
            }
          }
        }

        if (!hasNullPk) {
          const pkKey = pkValues.join('|');
          if (pkSet.has(pkKey)) {
            message.error(t('init_data_pk_conflict', { row: i + 1, values: pkValues.join(', ') }));
            return;
          }
          pkSet.add(pkKey);
        }
      }

      for (const col of selectedTable.columns) {
        const value = row[col.name];
        
        if (!col.primaryKey && !col.nullable) {
          if (value === null || value === undefined) {
            message.error(t('init_data_not_null', { row: i + 1, column: col.displayName }));
            return;
          }
          const type = col.type.toLowerCase();
          if (['int', 'integer', 'bigint', 'smallint', 'tinyint', 'decimal', 'float', 'double', 'numeric'].includes(type)) {
            if (String(value).trim() === '') {
              message.error(t('init_data_must_integer', { row: i + 1, column: col.displayName }));
              return;
            }
          }
        }

        if (value !== null && value !== undefined) {
          const type = col.type.toLowerCase();
          const strVal = String(value);

          if (['datetime', 'timestamp', 'date', 'time'].includes(type)) {
            if (strVal.trim() === '') {
              message.error(t('init_data_time_empty', { row: i + 1, column: col.displayName }));
              return;
            }
          }

          if (['varchar', 'char', 'text', 'string'].includes(type)) {
            if (!col.nullable && strVal.trim() === '') {
              message.error(t('init_data_empty_string', { row: i + 1, column: col.displayName }));
              return;
            }
          }

          if (strVal !== '') {
            if (['int', 'integer', 'bigint', 'smallint', 'tinyint'].includes(type)) {
              if (isNaN(Number(value)) || !Number.isInteger(Number(value))) {
                message.error(t('init_data_must_integer', { row: i + 1, column: col.displayName }));
                return;
              }
            } 
            else if (['decimal', 'float', 'double', 'numeric'].includes(type)) {
              if (isNaN(Number(value))) {
                message.error(t('init_data_must_number', { row: i + 1, column: col.displayName }));
                return;
              }
            }
            else if (['varchar', 'char', 'text', 'string'].includes(type)) {
              if (col.length && strVal.length > col.length) {
                message.error(t('init_data_length_exceed', { row: i + 1, column: col.displayName, max: col.length }));
                return;
              }
            }
          }
        }
      }
    }

    try {
      const rowJsons = dataRows.map(row => {
        const { _key, ...rest } = row;
        return JSON.stringify(rest);
      });
      await invoke('save_init_data', {
        tableId: selectedTable.id,
        rows: rowJsons,
      });
      message.success(t('init_data_save_success'));
    } catch (error) {
      console.error('保存元数据失败:', error);
      message.error(t('init_data_save_fail'));
    }
  };

  const handleImportExcel = (file: File) => {
    if (!selectedTable) {
      message.warning(t('init_data_select_table'));
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
          message.warning(t('init_data_excel_empty'));
          return;
        }

        const DATE_TYPES = ['date', 'datetime', 'timestamp', 'time'];

        const formatDateValue = (rawValue: any, colType: string): string => {
          let d: dayjs.Dayjs | null = null;

          if (rawValue instanceof Date) {
            d = dayjs(rawValue);
          } else if (typeof rawValue === 'number') {
            const excelEpoch = dayjs('1899-12-30');
            d = excelEpoch.add(rawValue, 'day');
          } else if (typeof rawValue === 'string' && rawValue.trim() !== '') {
            const parsed = dayjs(rawValue);
            if (parsed.isValid()) {
              d = parsed;
            } else {
              return rawValue;
            }
          }

          if (!d || !d.isValid()) return String(rawValue);

          if (colType === 'time') return d.format('HH:mm:ss');
          if (colType === 'date') return d.format('YYYY-MM-DD');
          return d.format('YYYY-MM-DD HH:mm:ss');
        };

        const importedRows: DataRow[] = jsonData.map((excelRow, idx) => {
          const row: DataRow = { _key: `import_${idx}_${Date.now()}` };
          selectedTable!.columns.forEach(col => {
            const rawValue = excelRow[col.name] !== undefined
              ? excelRow[col.name]
              : excelRow[col.displayName] !== undefined
                ? excelRow[col.displayName]
                : undefined;

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
        message.success(t('init_data_import_success', { count: importedRows.length }));
      } catch (err) {
        console.error('Excel解析失败:', err);
        message.error(t('init_data_parse_fail'));
      }
    };
    reader.readAsArrayBuffer(file);

    return false;
  };

  const renderCellEditor = (col: ColumnDef, value: any, rowKey: string) => {
    const type = col.type.toLowerCase();
    const isNull = value === null;

    const handleSetNull = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isNull) {
        handleCellChange(rowKey, col.name, '');
      } else {
        handleCellChange(rowKey, col.name, null);
      }
    };

    const renderNullIcon = () => {
      if (!col.nullable) return null;
      return (
        <Button
          type="text"
          size="small"
          onClick={handleSetNull}
          title={isNull ? t('init_data_null_toggle') : t('init_data_set_null')}
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
          allowClear={false}
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
          allowClear={false}
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
          allowClear={false}
          value={value ? dayjs(value, 'HH:mm:ss') : null}
          onChange={(_t, timeStr) => handleCellChange(rowKey, col.name, timeStr as string)}
          style={{ width: '100%' }}
          placeholder={col.displayName}
          format="HH:mm:ss"
        />
      );
    } else {
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

    cols.push({
      title: t('col_action'),
      key: '_action',
      width: 60,
      fixed: 'right' as const,
      render: (_: any, record: DataRow) => (
        <Popconfirm title={t('init_data_delete_row')} okText={t('confirm')} cancelText={t('cancel')} onConfirm={() => handleDeleteRow(record._key)}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    });

    return cols;
  };

  if (!selectedTable) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">{t('init_data_select_table_first')}</Text>
      </div>
    );
  }

  if (selectedTable.columns.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Text type="secondary">{t('init_data_no_columns')}</Text>
      </div>
    );
  }

  return (
    <div>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Title level={4} style={{ margin: 0 }}>{t('init_data_title')}</Title>
            <Input
              placeholder={t('init_data_search')}
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
              <Button icon={<UploadOutlined />}>{t('init_data_import_excel')}</Button>
            </Upload>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddRow}
            >
              {t('init_data_add_row')}
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
            >
              {t('save')}
            </Button>
          </Space>
        </div>

        <Table
          dataSource={filteredRows}
          columns={buildColumns()}
          pagination={{ 
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => t('init_data_total', { total })
          }}
          rowKey="_key"
          size="small"
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">
                  {filterText ? t('init_data_not_found') : t('init_data_empty_data')}
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