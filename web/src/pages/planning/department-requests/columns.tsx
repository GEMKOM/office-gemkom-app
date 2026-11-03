import { Text } from '@mantine/core';
import type { DepartmentRequest } from '@/api/general/departmentRequests';
import type { PlanningRequest } from '@/api/planning/planningRequests';
import { formatDate } from '@/lib/format';
import { FaIcon, StatusBadge, type DataTableColumn } from '@/ui';
import {
  departmentLabel,
  itemsCount,
  RequestNo,
  RequestStatusBadge,
} from '../../general/department-requests/shared';
import { planningStatusFamily, priorityBadge } from './logic';

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const { color, label } = priorityBadge(priority);
  return <StatusBadge color={color}>{label}</StatusBadge>;
}

export function PlanningStatusBadge({
  row,
}: {
  row: Pick<PlanningRequest, 'status' | 'status_label'>;
}) {
  return (
    <StatusBadge color={planningStatusFamily(row.status)}>
      {row.status_label || row.status || 'Bilinmiyor'}
    </StatusBadge>
  );
}

function UserCell({ name }: { name: string | null | undefined }) {
  return (
    <Text size="sm" fw={500}>
      <FaIcon icon="fas fa-user-circle" /> {name || 'Bilinmiyor'}
    </Text>
  );
}

const dateCell = (value: string | null | undefined) => (value ? formatDate(value) : '-');

// Module scope so DataTable rows stay memoized. Sortable = DepartmentRequestViewSet
// .ordering_fields (id, created_at, needed_date, priority); legacy also offered
// requestor, department and status, which the backend ignores.
export const approvedRequestColumns: DataTableColumn<DepartmentRequest>[] = [
  { key: 'id', header: 'Talep No', sortable: true, render: (row) => <RequestNo id={row.id} /> },
  {
    key: 'requestor_username',
    header: 'Talep Eden',
    sortable: false,
    render: (row) => <UserCell name={row.requestor_username} />,
  },
  {
    key: 'department',
    header: 'Departman',
    sortable: false,
    render: (row) => departmentLabel(row),
  },
  {
    key: 'priority',
    header: 'Öncelik',
    sortable: true,
    render: (row) => <PriorityBadge priority={row.priority} />,
  },
  {
    key: 'needed_date',
    header: 'Talep Tarihi',
    sortable: true,
    render: (row) => dateCell(row.needed_date),
  },
  {
    key: 'items',
    header: 'Ürün Sayısı',
    sortable: false,
    render: (row) => `${itemsCount(row)} ürün`,
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: false,
    render: (row) => <RequestStatusBadge row={row} />,
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    render: (row) => dateCell(row.created_at),
  },
];

/** The planning-request tables (Planlama Talepleri, ERP Girişi Bekleyen). */
export const planningRequestColumns: DataTableColumn<PlanningRequest>[] = [
  { key: 'id', header: 'Talep No', sortable: true, render: (row) => <RequestNo id={row.id} /> },
  {
    key: 'request_number',
    header: 'Talep Numarası',
    sortable: true,
    render: (row) =>
      row.request_number ? (
        <Text size="sm" fw={600}>
          {row.request_number}
        </Text>
      ) : (
        '-'
      ),
  },
  {
    key: 'title',
    header: 'Başlık',
    sortable: true,
    render: (row) => (
      <Text size="sm" fw={500}>
        {row.title || '-'}
      </Text>
    ),
  },
  {
    key: 'created_by_username',
    header: 'Oluşturan',
    sortable: true,
    render: (row) => <UserCell name={row.created_by_username} />,
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
    key: 'items',
    header: 'Ürün Sayısı',
    sortable: false,
    render: (row) => `${row.items_count || row.items?.length || 0} ürün`,
  },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    render: (row) => <PlanningStatusBadge row={row} />,
  },
  {
    key: 'created_at',
    header: 'Oluşturulma',
    sortable: true,
    render: (row) => dateCell(row.created_at),
  },
];
