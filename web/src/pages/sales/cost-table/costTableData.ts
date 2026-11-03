// Pure data shaping of the sales cost table, ported from sales/cost-table/costTable.js.
// Figures the legacy page computed in the browser live here; keep them in step.
import type { CostTableFilters } from '@/api/projects/cost';
import type { SubcontractingAssignment } from '@/api/subcontracting/assignments';
import type { StatusFamily } from '@/ui';
import { localDay, num } from '@/pages/management/analytics/analyticsData';

export const STATUS_OPTIONS = [
  { value: 'draft', label: 'Taslak' },
  { value: 'active', label: 'Aktif' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal Edildi' },
];

export const STATUS_FAMILY: Record<string, StatusFamily> = {
  active: 'green',
  completed: 'blue',
  on_hold: 'yellow',
  cancelled: 'red',
  draft: 'grey',
};

export const statusLabel = (status: string | null | undefined) =>
  STATUS_OPTIONS.find((o) => o.value === status)?.label ?? (status || '–');

export const DEFAULT_ORDERING = 'job_no';

const DATE_FIELD_PARAMS = {
  target: ['target_completion_date__gte', 'target_completion_date__lte'],
  created: ['created_at__date__gte', 'created_at__date__lte'],
  last_updated: ['cost_summary__last_updated__date__gte', 'cost_summary__last_updated__date__lte'],
} as const;

export interface CostTableFilterValues {
  status: string;
  search: string;
  customer: string;
  manufactured: string;
  /** '' (the placeholder, "Hedef Tarih") means the target completion date. */
  date_field: string;
  date: { start: string; end: string };
  /** Catalog item ids, comma-separated. */
  template_node: string;
}

/** Legacy loadData: the filters behind the table (and the catalog scope). */
export function tableFilters(values: CostTableFilterValues): CostTableFilters {
  const filters: CostTableFilters = {};
  if (values.status) filters.status = values.status;
  if (values.search) filters.search = values.search;
  if (values.customer) {
    const id = parseInt(values.customer, 10);
    if (!Number.isNaN(id)) filters.customer = id;
  }
  if (values.template_node) filters.template_node = values.template_node;
  if (values.manufactured === 'true' || values.manufactured === 'false')
    filters.manufactured = values.manufactured;
  const field = values.date_field in DATE_FIELD_PARAMS ? values.date_field : 'target';
  const [startParam, endParam] = DATE_FIELD_PARAMS[field as keyof typeof DATE_FIELD_PARAMS];
  if (values.date.start) filters[startParam] = values.date.start;
  if (values.date.end) filters[endParam] = values.date.end;
  return filters;
}

/**
 * Legacy price input: every dot is a thousands separator and the first comma
 * the decimal mark, so '90.000' is 90000 and '90.000,5' 90000.5. Null when
 * empty, NaN when not a number.
 */
export function parsePriceInput(raw: string): number | null {
  const text = raw.trim().replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.replace(/\./g, '').replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized) ? Number(normalized) : Number.NaN;
}

/** Legacy commit: a change under a cent is no change. */
export function samePrice(next: number, previous: unknown): boolean {
  if (previous === null || previous === undefined || previous === '') return false;
  const old = typeof previous === 'string' ? parseFloat(previous) : Number(previous);
  return Number.isFinite(old) && Math.abs(next - old) < 0.01;
}

/** Legacy general_expenses_rate: "0.1500" shows as 0.15. */
export function rateText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isNaN(n) ? null : String(n);
}

/* ── İşçilik (combined job costs) ─────────────────────────────────── */

export interface CombinedDepartment {
  total_cost?: number | null;
  hours?: Record<string, number | null | undefined>;
  costs?: Record<string, number | null | undefined>;
}

export interface CombinedJob {
  combined_total_cost?: number | null;
  combined_total_hours?: number | null;
  machining?: CombinedDepartment | null;
  welding?: CombinedDepartment | null;
}

export interface DepartmentFigures {
  totalCost: number;
  totalHours: number;
  overtimeCost: number;
  costPerHour: number;
}

function department(
  d: CombinedDepartment | null | undefined,
  hourKeys: string[],
  overtimeKeys: string[],
): DepartmentFigures | null {
  if (!d) return null;
  const totalHours = hourKeys.reduce((s, k) => s + num(d.hours?.[k]), 0);
  const totalCost = num(d.total_cost);
  return {
    totalCost,
    totalHours,
    overtimeCost: overtimeKeys.reduce((s, k) => s + num(d.costs?.[k]), 0),
    costPerHour: totalHours > 0 ? totalCost / totalHours : 0,
  };
}

/** Legacy showJobDetails: the summary cards and one block per department. */
export function jobCostFigures(job: CombinedJob) {
  const totalCost = num(job.combined_total_cost);
  const totalHours = num(job.combined_total_hours);
  return {
    totalCost,
    totalHours,
    costPerHour: totalHours > 0 ? totalCost / totalHours : 0,
    machining: department(
      job.machining,
      ['weekday_work', 'after_hours', 'sunday'],
      ['after_hours', 'sunday'],
    ),
    welding: department(
      job.welding,
      ['regular', 'after_hours', 'holiday'],
      ['after_hours', 'holiday'],
    ),
  };
}

/* ── Talaşlı / kaynaklı kayıtlar ──────────────────────────────────── */

export interface MachiningEntryLike {
  id?: number | string;
  start_time?: number | string | null;
  employee_full_name?: string;
  employee_username?: string;
  operation_key?: string;
  operation_name?: string;
  hours?: unknown;
  work_type?: string;
  entries?: MachiningEntryLike[];
}

export interface MachiningEntryRow {
  id: string;
  date: string;
  employee_full_name: string;
  employee_username: string;
  operation_key: string;
  operation_name: string;
  hours: number;
  work_type: string;
}

/**
 * Legacy showMachiningDetails rows, oldest first. The report may also send its
 * entries grouped per operation (each with an `entries` array); those are
 * flattened. The day is the local one (legacy took the UTC date).
 */
export function machiningEntryRows(entries: MachiningEntryLike[]): MachiningEntryRow[] {
  const flat = entries.flatMap((e) =>
    Array.isArray(e.entries)
      ? e.entries.map((inner) => ({
          ...inner,
          operation_key: inner.operation_key ?? e.operation_key,
          operation_name: inner.operation_name ?? e.operation_name,
        }))
      : [e],
  );
  return [...flat]
    .sort((a, b) => num(a.start_time) - num(b.start_time))
    .map((e, index) => ({
      id: String(e.id ?? index),
      date: localDay(e.start_time),
      employee_full_name: e.employee_full_name ?? '',
      employee_username: e.employee_username ?? '',
      operation_key: e.operation_key || '-',
      operation_name: e.operation_name || '-',
      hours: num(e.hours),
      work_type: e.work_type ?? '',
    }));
}

/** Legacy showWeldingDetails: entries by date, oldest first (missing dates first). */
export function sortByDate<T extends { date?: string | null }>(entries: T[]): T[] {
  const time = (e: T) => {
    const t = new Date(e.date || '').getTime();
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...entries].sort((a, b) => time(a) - time(b));
}

export const MACHINING_WORK_TYPES: Record<string, { label: string; color: StatusFamily }> = {
  weekday_work: { label: 'Hafta İçi', color: 'blue' },
  after_hours: { label: 'Mesai', color: 'yellow' },
  sunday: { label: 'Pazar', color: 'red' },
};

export const WELDING_OVERTIME_TYPES: Record<string, { label: string; color: StatusFamily }> = {
  regular: { label: 'Normal', color: 'blue' },
  after_hours: { label: 'Mesai', color: 'yellow' },
  holiday: { label: 'Tatil', color: 'red' },
};

/* ── Malzeme / taşeron ────────────────────────────────────────────── */

export function sumOf<T>(rows: T[], pick: (row: T) => unknown): number {
  return rows.reduce((s, row) => s + num(pick(row)), 0);
}

/** Legacy showSubcontractorDetails summary. */
export function assignmentTotals(rows: SubcontractingAssignment[]) {
  return {
    count: rows.length,
    cost: sumOf(rows, (a) => a.current_cost),
    unbilled: sumOf(rows, (a) => a.unbilled_cost),
    weight: sumOf(rows, (a) => a.allocated_weight_kg),
  };
}
