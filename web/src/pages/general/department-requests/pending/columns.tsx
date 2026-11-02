import { Group, Text } from '@mantine/core';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import { formatDate } from '@/lib/format';
import { FaIcon, type DataTableColumn } from '@/ui';
import {
  departmentLabel,
  itemsCount,
  PriorityBadge,
  RequestNo,
  RequestStatusBadge,
} from '../shared';

const dateCell = (value: string | null | undefined) => (value ? formatDate(value) : '-');

// Module scope so DataTable rows stay memoized. Same columns as pending.js.
export const pendingColumns: DataTableColumn<DepartmentRequest>[] = [
  { key: 'id', header: 'Talep No', sortable: true, render: (row) => <RequestNo id={row.id} /> },
  {
    key: 'requestor_username',
    header: 'Talep Eden',
    sortable: true,
    render: (row) => (
      <Group gap={6} wrap="nowrap">
        <Text c="dimmed" span>
          <FaIcon icon="fas fa-user-circle" />
        </Text>
        <Text size="sm" fw={500} span>
          {row.requestor_username || 'Bilinmiyor'}
        </Text>
      </Group>
    ),
  },
  {
    key: 'department',
    header: 'Departman',
    sortable: true,
    accessor: (row) => departmentLabel(row),
  },
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
    render: (row) => dateCell(row.needed_date),
  },
  {
    key: 'items_count',
    header: 'Ürün Sayısı',
    sortable: true,
    accessor: (row) => itemsCount(row),
    render: (row) => `${itemsCount(row)} ürün`,
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    render: (row) => <RequestStatusBadge row={row} />,
  },
];

export const approvedColumns: DataTableColumn<DepartmentRequest>[] = [
  ...pendingColumns,
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    render: (row) => dateCell(row.created_at),
  },
];
