import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Space } from 'antd';
import { MenuOutlined } from '@ant-design/icons';

interface SortableTableRowProps {
  id: string;
  children: React.ReactNode;
}

/**
 * 可拖拽表格行组件
 */
const SortableTableRow: React.FC<SortableTableRowProps> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td style={{ width: 40, textAlign: 'center' }}>
        <Space {...listeners} style={{ cursor: 'grab' }}>
          <MenuOutlined style={{ color: '#999' }} />
        </Space>
      </td>
      {children}
    </tr>
  );
};

export default SortableTableRow;
