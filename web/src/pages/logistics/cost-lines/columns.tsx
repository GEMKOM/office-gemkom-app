import type { ShippingJobOrder } from '@/api/logistics/costLines';
import { formatCurrency, formatDate, toDate, toNumber } from '@/lib/format';
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

/** The Durum filter of both tables (cancelled job orders are never listed). */
export const STATUS_FILTER_OPTIONS: FilterOption[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'draft', label: 'Taslak' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
];

export function statusLabel(value: string | null | undefined): string {
  return (value && STATUS_LABELS[value]) || value || '-';
}

const baseColumns: DataTableColumn<ShippingJobOrder>[] = [
  {
    key: 'job_no',
    header: 'İş Emri No',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.job_no || '-'}</span>,
  },
  { key: 'title', header: 'Başlık', sortable: true },
  { key: 'customer_name', header: 'Müşteri', sortable: false },
  {
    key: 'status',
    header: 'Durum',
    sortable: true,
    render: (row) => (
      <StatusBadge color={(row.status && STATUS_FAMILY[row.status]) || 'grey'}>
        {statusLabel(row.status)}
      </StatusBadge>
    ),
    exportValue: (row) => statusLabel(row.status),
  },
  {
    key: 'target_completion_date',
    header: 'Hedef Bitiş',
    sortable: true,
    render: (row) => formatDate(row.target_completion_date),
    exportValue: (row) => toDate(row.target_completion_date),
  },
];

// Module scope so DataTable rows stay memoized. Sortable set = legacy tables.
export const pendingColumns: DataTableColumn<ShippingJobOrder>[] = baseColumns;

export const hasEntriesColumns: DataTableColumn<ShippingJobOrder>[] = [
  ...baseColumns,
  {
    key: 'shipping_total_eur',
    header: 'Toplam (EUR)',
    sortable: false,
    align: 'right',
    render: (row) => formatCurrency(row.shipping_total_eur, 'EUR'),
    exportValue: (row) => toNumber(row.shipping_total_eur),
  },
];
