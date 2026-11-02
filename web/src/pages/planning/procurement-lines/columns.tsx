import type { ProcurementJobOrder } from '@/api/planning/procurementLines';
import { formatDate, toDate } from '@/lib/format';
import { StatusBadge, type DataTableColumn, type FilterOption, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  draft: 'Taslak',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

const STATUS_FAMILY: Record<string, StatusFamily> = {
  active: 'green',
  completed: 'blue',
  on_hold: 'yellow',
  cancelled: 'red',
};

/** The Durum filter of both tables. */
export const STATUS_FILTER_OPTIONS: FilterOption[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'draft', label: 'Taslak' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
];

/** The Maliyet Durumu filter of the has-entries table. */
export const COST_NA_FILTER_OPTIONS: FilterOption[] = [
  { value: 'false', label: 'Maliyet Girilmiş' },
  { value: 'true', label: 'Maliyet Uygulanamaz' },
];

export function statusLabel(value: string | null | undefined): string {
  return (value && STATUS_LABELS[value]) || value || '–';
}

const jobNo: DataTableColumn<ProcurementJobOrder> = {
  key: 'job_no',
  header: 'İş Emri No',
  sortable: true,
  render: (row) => <span className={uiClasses.code}>{row.job_no || '–'}</span>,
};
const title: DataTableColumn<ProcurementJobOrder> = {
  key: 'title',
  header: 'Başlık',
  sortable: true,
};
const customer: DataTableColumn<ProcurementJobOrder> = {
  key: 'customer_name',
  header: 'Müşteri',
  sortable: false,
};
const status: DataTableColumn<ProcurementJobOrder> = {
  key: 'status',
  header: 'Durum',
  sortable: true,
  render: (row) => (
    <StatusBadge color={(row.status && STATUS_FAMILY[row.status]) || 'grey'}>
      {statusLabel(row.status)}
    </StatusBadge>
  ),
  exportValue: (row) => statusLabel(row.status),
};
const target: DataTableColumn<ProcurementJobOrder> = {
  key: 'target_completion_date',
  header: 'Hedef Bitiş',
  sortable: true,
  render: (row) => (row.target_completion_date ? formatDate(row.target_completion_date) : '–'),
  exportValue: (row) => toDate(row.target_completion_date),
};

// Module scope so DataTable rows stay memoized. Sortable set = legacy tables.
export const pendingColumns: DataTableColumn<ProcurementJobOrder>[] = [
  jobNo,
  title,
  customer,
  status,
  target,
];

export const hasEntriesColumns: DataTableColumn<ProcurementJobOrder>[] = [
  jobNo,
  title,
  customer,
  {
    key: 'cost_not_applicable',
    header: 'Maliyet',
    sortable: false,
    render: (row) =>
      row.cost_not_applicable ? (
        <StatusBadge color="red">Uygulanamaz</StatusBadge>
      ) : (
        <StatusBadge color="green">Girilmiş</StatusBadge>
      ),
    exportValue: (row) => (row.cost_not_applicable ? 'Uygulanamaz' : 'Girilmiş'),
  },
  status,
  target,
];
