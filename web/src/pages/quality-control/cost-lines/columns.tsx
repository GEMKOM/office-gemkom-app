import type { CostJobOrder } from '@/api/quality-control/costLines';
import { formatDate, toDate, toNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export const JOB_STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'draft', label: 'Taslak' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
];

const STATUS_LABELS: Record<string, string> = {
  active: 'Aktif',
  draft: 'Taslak',
  on_hold: 'Beklemede',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

const STATUS_COLORS: Record<string, StatusFamily> = {
  active: 'green',
  completed: 'blue',
  on_hold: 'yellow',
  cancelled: 'red',
};

export function jobStatusLabel(value: string | undefined): string {
  return (value && STATUS_LABELS[value]) || value || '–';
}

/** Legacy formatEur: "€1.234,50", '–' when empty. */
export function formatEur(value: CostJobOrder['qc_total_eur']): string {
  const n = toNumber(value ?? null);
  if (n === null) return '–';
  return `€${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const baseColumns: DataTableColumn<CostJobOrder>[] = [
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
      <StatusBadge color={(row.status && STATUS_COLORS[row.status]) || 'grey'}>
        {jobStatusLabel(row.status)}
      </StatusBadge>
    ),
    exportValue: (row) => jobStatusLabel(row.status),
  },
  {
    key: 'target_completion_date',
    header: 'Hedef Bitiş',
    sortable: true,
    render: (row) => (row.target_completion_date ? formatDate(row.target_completion_date) : '–'),
    exportValue: (row) => toDate(row.target_completion_date ?? null),
  },
];

export const pendingColumns = baseColumns;

export const hasEntriesColumns: DataTableColumn<CostJobOrder>[] = [
  ...baseColumns,
  {
    key: 'qc_total_eur',
    header: 'Toplam (EUR)',
    sortable: false,
    align: 'right',
    render: (row) => formatEur(row.qc_total_eur),
    exportValue: (row) => toNumber(row.qc_total_eur ?? null),
  },
];
