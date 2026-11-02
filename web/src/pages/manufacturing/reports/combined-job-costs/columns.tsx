import { Stack, Text } from '@mantine/core';
import type { CombinedJobCost } from '@/api/jobCosts/combinedJobCosts';
import type { MachiningJobEntry } from '@/api/jobCosts/machiningJobEntries';
import type { WeldingJobEntry } from '@/api/welding/jobCosts';
import { formatDate, formatNumber, toDate } from '@/lib/format';
import { StatusBadge, type DataTableColumn, type StatusFamily } from '@/ui';
import uiClasses from '@/ui/ui.module.css';

export const hours = (value: unknown) => formatNumber(Number(value) || 0, 1);
const num = (value: unknown): number => Number(value) || 0;

/** A summary table row (legacy processCombinedJobCostData). */
export interface CombinedJobCostRow {
  job_no: string;
  /** null when the job has no machining entries. */
  machining_total_hours: number | null;
  welding_total_hours: number | null;
  combined_total_hours: number;
  raw: CombinedJobCost;
}

export function machiningHours(job: CombinedJobCost): number | null {
  if (!job.machining) return null;
  const h = job.machining.hours ?? {};
  return num(h.weekday_work) + num(h.after_hours) + num(h.sunday);
}

export function weldingHours(job: CombinedJobCost): number | null {
  if (!job.welding) return null;
  const h = job.welding.hours ?? {};
  return num(h.regular) + num(h.after_hours) + num(h.holiday);
}

export function toCombinedRow(job: CombinedJobCost): CombinedJobCostRow {
  return {
    job_no: job.job_no,
    machining_total_hours: machiningHours(job),
    welding_total_hours: weldingHours(job),
    combined_total_hours: num(job.combined_total_hours),
    raw: job,
  };
}

const HOURS_FORMAT = '#,##0.0';

function optionalHours(value: number | null) {
  return value === null ? (
    <Text span size="sm" c="dimmed">
      -
    </Text>
  ) : (
    hours(value)
  );
}

// Module scope so DataTable rows stay memoized. Only İş No and Toplam Saat
// sort, on the server (legacy handleSort).
export const combinedJobCostColumns: DataTableColumn<CombinedJobCostRow>[] = [
  {
    key: 'job_no',
    header: 'İş No',
    sortable: true,
    render: (row) => <span className={uiClasses.code}>{row.job_no || '-'}</span>,
  },
  {
    key: 'machining_total_hours',
    header: 'Talaş Toplam Saat',
    align: 'right',
    render: (row) => optionalHours(row.machining_total_hours),
    exportFormat: HOURS_FORMAT,
  },
  {
    key: 'welding_total_hours',
    header: 'Kaynak Toplam Saat',
    align: 'right',
    render: (row) => optionalHours(row.welding_total_hours),
    exportFormat: HOURS_FORMAT,
  },
  {
    key: 'combined_total_hours',
    header: 'Toplam Saat',
    sortable: true,
    align: 'right',
    render: (row) => (
      <Text span size="sm" fw={600}>
        {hours(row.combined_total_hours)}
      </Text>
    ),
    exportFormat: HOURS_FORMAT,
  },
];

// ---- the entry tables of the department modals ----

function typeBadge(labels: Record<string, [string, StatusFamily]>, value: string | undefined) {
  const known = value ? labels[value] : undefined;
  return <StatusBadge color={known?.[1] ?? 'grey'}>{known?.[0] ?? (value || '-')}</StatusBadge>;
}

const MACHINING_TYPES: Record<string, [string, StatusFamily]> = {
  weekday_work: ['Hafta İçi', 'blue'],
  after_hours: ['Mesai', 'yellow'],
  sunday: ['Pazar', 'red'],
};

const WELDING_TYPES: Record<string, [string, StatusFamily]> = {
  regular: ['Normal', 'blue'],
  after_hours: ['Mesai', 'yellow'],
  holiday: ['Tatil', 'red'],
};

interface EmployeeFields {
  employee_full_name?: string;
  employee_username?: string;
}

function employeeColumn<T extends EmployeeFields>(): DataTableColumn<T> {
  return {
    key: 'employee_full_name',
    header: 'Çalışan',
    accessor: (row) => row.employee_full_name || row.employee_username || '',
    render: (row) => (
      <Stack gap={0}>
        <Text span size="sm" fw={600}>
          {row.employee_full_name || row.employee_username || '-'}
        </Text>
        {row.employee_username ? (
          <Text span size="xs" c="dimmed">
            {row.employee_username}
          </Text>
        ) : null}
      </Stack>
    ),
  };
}

function entryHoursColumn<T extends { hours?: number | string | null }>(): DataTableColumn<T> {
  return {
    key: 'hours',
    header: 'Saat',
    align: 'right',
    accessor: (row) => num(row.hours),
    render: (row) => (
      <Text span size="sm" fw={600}>
        {hours(row.hours)}
      </Text>
    ),
    exportFormat: HOURS_FORMAT,
  };
}

/** Legacy machining entries table; the date is the entry's start_time day. */
export const machiningEntryColumns: DataTableColumn<MachiningJobEntry>[] = [
  {
    key: 'date',
    header: 'Tarih',
    accessor: (row) => toDate(row.start_time)?.getTime() ?? null,
    render: (row) => (
      <Text span size="sm" fw={600}>
        {formatDate(row.start_time)}
      </Text>
    ),
    exportValue: (row) => toDate(row.start_time),
  },
  employeeColumn<MachiningJobEntry>(),
  {
    key: 'operation_key',
    header: 'Operasyon Anahtarı',
    render: (row) => <span className={uiClasses.code}>{row.operation_key || '-'}</span>,
  },
  { key: 'operation_name', header: 'Operasyon Adı' },
  entryHoursColumn<MachiningJobEntry>(),
  {
    key: 'work_type',
    header: 'Tip',
    render: (row) => typeBadge(MACHINING_TYPES, row.work_type),
  },
];

export const weldingEntryColumns: DataTableColumn<WeldingJobEntry>[] = [
  {
    key: 'date',
    header: 'Tarih',
    render: (row) => (
      <Text span size="sm" fw={600}>
        {formatDate(row.date)}
      </Text>
    ),
  },
  employeeColumn<WeldingJobEntry>(),
  entryHoursColumn<WeldingJobEntry>(),
  {
    key: 'overtime_type',
    header: 'Tip',
    render: (row) => typeBadge(WELDING_TYPES, row.overtime_type),
  },
];
