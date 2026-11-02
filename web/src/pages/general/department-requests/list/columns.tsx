import { Group, Text } from '@mantine/core';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import { formatDate } from '@/lib/format';
import { StatusBadge, type DataTableColumn } from '@/ui';
import {
  departmentLabel,
  itemsCount,
  PriorityBadge,
  RequestNo,
  RequestStatusBadge,
} from '../shared';

function RequestKeys({ keys }: { keys: string[] | null | undefined }) {
  if (!keys || keys.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        -
      </Text>
    );
  }
  return (
    <Group gap={4}>
      {keys.map((key) => (
        <StatusBadge key={key} color="blue">
          {key}
        </StatusBadge>
      ))}
    </Group>
  );
}

// Module scope so DataTable rows stay memoized. Sortable set = legacy table.
export const departmentRequestColumns: DataTableColumn<DepartmentRequest>[] = [
  { key: 'id', header: 'Talep No', sortable: true, render: (row) => <RequestNo id={row.id} /> },
  {
    key: 'title',
    header: 'Başlık',
    sortable: true,
    render: (row) => (
      <Text fw={500} size="sm">
        {row.title || '-'}
      </Text>
    ),
  },
  { key: 'department', header: 'Departman', sortable: true, render: (row) => departmentLabel(row) },
  {
    key: 'priority',
    header: 'Öncelik',
    sortable: true,
    render: (row) => <PriorityBadge priority={row.priority} />,
  },
  {
    key: 'needed_date',
    header: 'İhtiyaç Tarihi',
    sortable: true,
    render: (row) => (row.needed_date ? formatDate(row.needed_date) : '-'),
  },
  {
    key: 'items_count',
    header: 'Ürün Sayısı',
    sortable: true,
    render: (row) => `${itemsCount(row)} ürün`,
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    render: (row) => <RequestStatusBadge row={row} />,
  },
  {
    key: 'planning_request_keys',
    header: 'Planlama Talepleri',
    sortable: false,
    render: (row) => <RequestKeys keys={row.planning_request_keys} />,
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    render: (row) => (row.created_at ? formatDate(row.created_at) : '-'),
  },
];
