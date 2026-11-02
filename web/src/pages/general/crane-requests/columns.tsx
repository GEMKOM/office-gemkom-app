import { Text } from '@mantine/core';
import type { CraneRequest } from '@/api/general/craneRequests';
import { formatDate } from '@/lib/format';
import type { DataTableColumn } from '@/ui';
import { CranePriorityBadge, CraneStatusBadge, RequestNumber } from './CraneRequestDetailModal';
import { formatDurationSummary, formatMoney, neededTimeSuffix } from './crane';

// Column building blocks shared by the list and pending tables.
type Col = DataTableColumn<CraneRequest>;

const dash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : String(value);

export const requestNumberColumn: Col = {
  key: 'request_number',
  header: 'Talep No',
  sortable: false,
  render: (row) => <RequestNumber value={row.request_number} />,
};

export const requestorColumn: Col = {
  key: 'requestor_full_name',
  header: 'Talep Eden',
  sortable: false,
  render: (row) => row.requestor_full_name || row.requestor_username || 'Bilinmiyor',
};

export const craneTypeColumn: Col = {
  key: 'crane_type_name',
  header: 'Ekipman',
  sortable: false,
  render: (row) => (
    <Text fz="sm" fw={500}>
      {dash(row.crane_type_name)}
    </Text>
  ),
};

export const jobNoColumn: Col = {
  key: 'job_no',
  header: 'İş Emri',
  sortable: false,
  render: (row) => (
    <Text fz="sm" fw={600}>
      {dash(row.job_no)}
    </Text>
  ),
};

export const departmentColumn: Col = { key: 'department', header: 'Departman', sortable: false };

export const durationColumn: Col = {
  key: 'pricing_option',
  header: 'Süre',
  sortable: false,
  render: (row) => formatDurationSummary(row),
};

/** List shows the time next to the date; pending shows the date only (legacy). */
export function neededDateColumn(withTime: boolean): Col {
  return {
    key: 'needed_date',
    header: 'İhtiyaç Tarihi',
    sortable: true,
    render: (row) =>
      row.needed_date
        ? `${formatDate(row.needed_date)}${withTime ? neededTimeSuffix(row.needed_time) : ''}`
        : '-',
  };
}

export const estimatedCostColumn: Col = {
  key: 'estimated_cost',
  header: 'Tahmini Maliyet',
  sortable: false,
  render: (row) => (
    <Text fz="sm" fw={600}>
      {formatMoney(row.estimated_cost, row.estimated_cost_currency)}
    </Text>
  ),
};

export const actualCostColumn: Col = {
  key: 'actual_cost',
  header: 'Fiili Maliyet',
  sortable: false,
  render: (row) =>
    row.actual_cost === null || row.actual_cost === undefined ? (
      <Text fz="sm" c="dimmed">
        -
      </Text>
    ) : (
      <Text fz="sm" fw={600} c="green.8">
        {formatMoney(row.actual_cost, row.actual_cost_currency)}
      </Text>
    ),
};

export const priorityColumn: Col = {
  key: 'priority',
  header: 'Öncelik',
  sortable: true,
  render: (row) => <CranePriorityBadge priority={row.priority} />,
};

export const statusColumn: Col = {
  key: 'status',
  header: 'Durum',
  sortable: true,
  render: (row) => <CraneStatusBadge status={row.status} label={row.status_label} />,
};

export const createdAtColumn: Col = {
  key: 'created_at',
  header: 'Oluşturulma',
  sortable: true,
  render: (row) => formatDate(row.created_at),
};
