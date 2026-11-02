// Pure data shaping of the Analitik page, ported from management/analytics/analytics.js.
// The figures here are what the legacy page computed in the browser; keep them in step.
import type { CostTableFilters, CostTableRow } from '@/api/projects/cost';

/** Legacy toNumber: null, '' and non-numbers count as 0. */
export function num(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** null for null/''/non-numbers; for cells that show '-' instead of 0. */
export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ── filters → API params ─────────────────────────────────────────── */

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'on_hold', label: 'Beklemede' },
  { value: 'draft', label: 'Taslak' },
  { value: 'cancelled', label: 'İptal' },
];

export const FACILITY_OPTIONS = [
  { value: 'rolling_mill', label: 'Haddehane' },
  { value: 'meltshop', label: 'Çelikhane' },
];

export const MANUFACTURED_OPTIONS = [
  { value: 'true', label: 'İmalatı Bizde' },
  { value: 'false', label: 'İmalat Harici' },
];

/** '' (the placeholder, "Hedef Tarih") means the target completion date. */
export const DATE_FIELD_OPTIONS = [
  { value: 'created', label: 'Oluşturulma Tarihi' },
  { value: 'last_updated', label: 'Son Maliyet Güncellemesi' },
];

export const ORDERING_OPTIONS = [
  { value: '-date', label: 'Hedef tarih (yeni önce)' },
  { value: 'date', label: 'Hedef tarih (eski önce)' },
  { value: 'job_no', label: 'İş No (A→Z)' },
  { value: '-job_no', label: 'İş No (Z→A)' },
  { value: 'title', label: 'Başlık (A→Z)' },
  { value: '-title', label: 'Başlık (Z→A)' },
  { value: 'weight', label: 'Ağırlık (artan)' },
  { value: '-weight', label: 'Ağırlık (azalan)' },
  { value: '-actual_cost', label: 'Toplam maliyet (azalan)' },
  { value: 'actual_cost', label: 'Toplam maliyet (artan)' },
  { value: 'price_per_kg', label: 'Kg maliyeti (artan)' },
  { value: '-price_per_kg', label: 'Kg maliyeti (azalan)' },
  { value: 'selling_price', label: 'Satış fiyatı (artan)' },
  { value: '-selling_price', label: 'Satış fiyatı (azalan)' },
  { value: 'margin_eur', label: 'Marj € (artan)' },
  { value: '-margin_eur', label: 'Marj € (azalan)' },
  { value: 'margin_pct', label: 'Marj % (artan)' },
  { value: '-margin_pct', label: 'Marj % (azalan)' },
  { value: 'completion_pct', label: 'Tamamlanma (artan)' },
  { value: '-completion_pct', label: 'Tamamlanma (azalan)' },
];

export const DEFAULT_ORDERING = '-date';

const DATE_FIELD_PARAMS = {
  target: ['target_completion_date__gte', 'target_completion_date__lte'],
  created: ['created_at__date__gte', 'created_at__date__lte'],
  last_updated: ['cost_summary__last_updated__date__gte', 'cost_summary__last_updated__date__lte'],
} as const;

export interface AnalyticsFilterValues {
  status: string[];
  search: string;
  customer: string;
  facility: string;
  manufactured: string;
  date_field: string;
  date: { start: string; end: string };
  /** Catalog item ids, comma-separated. */
  template_node: string;
}

/** Legacy loadData: the filters behind the table (and the catalog scope). */
export function tableFilters(values: AnalyticsFilterValues): CostTableFilters {
  const filters: CostTableFilters = {};
  const statusIn = values.status.join(',');
  if (statusIn) filters.status__in = statusIn;
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
  if (values.facility === 'rolling_mill' || values.facility === 'meltshop')
    filters.facility = values.facility;
  return filters;
}

/* ── tree rows ────────────────────────────────────────────────────── */

export type TreeRow = CostTableRow & { hierarchy_level: number };

/** Legacy mergeExpandedChildren: each expanded row is followed by its children, recursively. */
export function mergeExpandedChildren(
  roots: CostTableRow[],
  expanded: ReadonlySet<string>,
  children: ReadonlyMap<string, CostTableRow[]>,
  level = 0,
): TreeRow[] {
  const merged: TreeRow[] = [];
  for (const row of roots) {
    merged.push({ ...row, hierarchy_level: level });
    if (expanded.has(row.job_no)) {
      merged.push(
        ...mergeExpandedChildren(children.get(row.job_no) ?? [], expanded, children, level + 1),
      );
    }
  }
  return merged;
}

/* ── per-row figures ──────────────────────────────────────────────── */

/** İşçilik + Vergi: labor plus the employee overhead (vergi / genel gider). */
export const laborWithTax = (row: CostTableRow) =>
  num(row.labor_cost) + num(row.employee_overhead_cost);
/** Boya + Malzeme. */
export const paintWithMaterial = (row: CostTableRow) =>
  num(row.paint_cost) + num(row.paint_material_cost);

export type MarginTone = 'green' | 'amber' | 'red' | 'none';

/**
 * Legacy marginChip: no price → amber '—'; else > 15 green, >= 5 amber, < 5 red.
 * The price is the derived one for rows without their own.
 */
export function marginTone(marginPct: unknown, sellingPrice: unknown): MarginTone | null {
  if (marginPct === null || marginPct === undefined || marginPct === '') return null;
  const sp = numOrNull(sellingPrice);
  if (sp === null || sp <= 0) return 'none';
  const m = num(marginPct);
  return m > 15 ? 'green' : m >= 5 ? 'amber' : 'red';
}

/** The price the margin chip compares against. */
export const marginBasePrice = (row: CostTableRow) =>
  row.selling_price_is_derived ? row.selling_price_display : row.selling_price;

/* ── summary footer ───────────────────────────────────────────────── */

export interface CostTotals {
  /** Top-level rows counted. */
  rows: number;
  laborWithTax: number;
  material: number;
  subcontractor: number;
  paintWithMaterial: number;
  qc: number;
  shipping: number;
  machineRental: number;
  generalExpenses: number;
  /** Average of the non-zero general expenses rates; null without any. */
  generalExpensesRateAvg: number | null;
  weightKg: number;
  actualTotalCost: number;
  estimatedTotalCost: number;
  sellingPrice: number;
  marginEur: number;
  /** Weighted €/kg: total cost / total weight. */
  pricePerKg: number | null;
  sellingPricePerKg: number | null;
  marginPct: number | null;
}

/**
 * Legacy buildFooter. Only top-level rows: a parent's figures are already
 * subtree totals, so expanded children would count twice.
 */
export function costTotals(displayed: TreeRow[]): CostTotals {
  const rows = displayed.filter((r) => (r.hierarchy_level ?? 0) === 0);
  const t = {
    laborWithTax: 0,
    material: 0,
    subcontractor: 0,
    paintWithMaterial: 0,
    qc: 0,
    shipping: 0,
    machineRental: 0,
    generalExpenses: 0,
    weightKg: 0,
    actualTotalCost: 0,
    estimatedTotalCost: 0,
    sellingPrice: 0,
  };
  let rateSum = 0;
  let rateCount = 0;
  for (const r of rows) {
    t.laborWithTax += laborWithTax(r);
    t.material += num(r.material_cost);
    t.subcontractor += num(r.subcontractor_cost);
    t.paintWithMaterial += paintWithMaterial(r);
    t.qc += num(r.qc_cost);
    t.shipping += num(r.shipping_cost);
    t.machineRental += num(r.machine_rental_cost);
    t.generalExpenses += num(r.general_expenses_cost);
    t.weightKg += num(r.total_weight_kg);
    t.actualTotalCost += num(r.actual_total_cost);
    t.estimatedTotalCost += num(r.estimated_total_cost);
    // The entered price, or the rolled-up one for parents without their own;
    // never 'allocated_from_parent' (already on the ancestor).
    t.sellingPrice +=
      r.selling_price_display_source === 'rolled_up_from_children'
        ? num(r.selling_price_display)
        : num(r.selling_price);
    const rate = r.general_expenses_rate;
    if (rate !== null && rate !== undefined && rate !== '') {
      const rv = num(rate);
      if (rv !== 0) {
        rateSum += rv;
        rateCount += 1;
      }
    }
  }
  // From the totals, not a sum of per-row margins (they mix price bases).
  const marginEur = t.sellingPrice - t.actualTotalCost;
  return {
    rows: rows.length,
    ...t,
    generalExpensesRateAvg: rateCount > 0 ? rateSum / rateCount : null,
    marginEur,
    pricePerKg: t.weightKg > 0 ? t.actualTotalCost / t.weightKg : null,
    sellingPricePerKg: t.weightKg > 0 && t.sellingPrice > 0 ? t.sellingPrice / t.weightKg : null,
    marginPct: t.sellingPrice > 0 ? (marginEur / t.sellingPrice) * 100 : null,
  };
}

/* ── header figures and the chart ─────────────────────────────────── */

export interface SummaryFigures {
  avgMarginPct: number;
  totalRevenue: number;
  totalCost: number;
}

/**
 * Legacy updateSummary over the rows of the page: the average margin of
 * rows with an entered price, and the sums of entered prices and costs.
 */
export function summaryFigures(rows: CostTableRow[]): SummaryFigures {
  const withPrice = rows.filter((r) => num(r.selling_price) > 0);
  return {
    avgMarginPct: withPrice.length
      ? withPrice.reduce((s, r) => s + num(r.margin_pct), 0) / withPrice.length
      : 0,
    totalRevenue: rows.reduce((s, r) => s + num(r.selling_price), 0),
    totalCost: rows.reduce((s, r) => s + num(r.actual_total_cost), 0),
  };
}

export interface CostStackRow {
  job_no: string;
  labor: number;
  material: number;
  subcontractor: number;
  other: number;
  total: number;
}

/** Legacy updateChart: the 15 costliest jobs of the page, cost split four ways. */
export function topCostStack(rows: CostTableRow[], limit = 15): CostStackRow[] {
  return [...rows]
    .sort((a, b) => num(b.actual_total_cost) - num(a.actual_total_cost))
    .slice(0, limit)
    .map((r) => {
      const labor = laborWithTax(r);
      const material = num(r.material_cost);
      const subcontractor = num(r.subcontractor_cost);
      const total = num(r.actual_total_cost);
      return {
        job_no: r.job_no,
        labor,
        material,
        subcontractor,
        other: Math.max(0, total - labor - material - subcontractor),
        total,
      };
    });
}

/* ── labor drill-downs ────────────────────────────────────────────── */

/** Legacy splitEmployeeOverheadByLaborCost: the job's vergi split by net labor share. */
export function splitOverhead(overhead: unknown, machBase: unknown, weldBase: unknown) {
  const o = num(overhead);
  const m = num(machBase);
  const w = num(weldBase);
  const sum = m + w;
  if (sum <= 0) {
    if (m > 0) return { mach: o, weld: 0 };
    if (w > 0) return { mach: 0, weld: o };
    return { mach: 0, weld: 0 };
  }
  const mach = o * (m / sum);
  return { mach, weld: o - mach };
}

export interface LaborByJob {
  job_no: string;
  machining_cost?: unknown;
  welding_cost?: unknown;
  machining_hours?: unknown;
  welding_hours?: unknown;
}

export interface SubtreeLabor {
  job_no?: string;
  machining?: {
    total_cost?: unknown;
    hours?: { weekday_work?: unknown; after_hours?: unknown; sunday?: unknown };
    costs?: { after_hours?: unknown; sunday?: unknown };
  } | null;
  welding?: {
    total_cost?: unknown;
    hours?: { regular?: unknown; after_hours?: unknown; holiday?: unknown };
    costs?: { after_hours?: unknown; holiday?: unknown };
  } | null;
  combined_total_hours?: unknown;
  by_job?: LaborByJob[];
}

/** Legacy fetchSubtreeLabor: the combined row for the job (or the first). */
export function pickSubtreeLabor(results: SubtreeLabor[], jobNo: string): SubtreeLabor | null {
  return results.find((r) => r.job_no === jobNo) ?? results[0] ?? null;
}

export interface JobLaborFigures {
  laborNet: number;
  overhead: number;
  laborWithTax: number;
  totalHours: number;
  costPerHourWithTax: number;
  multiJob: boolean;
  machining: DepartmentFigures | null;
  welding: DepartmentFigures | null;
}

export interface DepartmentFigures {
  base: number;
  tax: number;
  withTax: number;
  hours: number;
  overtimeCost: number;
  costPerHourWithTax: number;
}

/**
 * Legacy showJobDetails. Özet follows the cost table row (cached summary);
 * the departments come from the combined report and the vergi is split
 * between them by net labor share.
 */
export function jobLaborFigures(job: SubtreeLabor, costRow: CostTableRow | null): JobLaborFigures {
  const mach = job.machining ?? null;
  const weld = job.welding ?? null;
  const machBase = num(mach?.total_cost);
  const weldBase = num(weld?.total_cost);
  const laborNet = costRow ? num(costRow.labor_cost) : machBase + weldBase;
  const overhead = costRow ? num(costRow.employee_overhead_cost) : 0;
  const total = laborNet + overhead;
  const split = splitOverhead(overhead, machBase, weldBase);
  const totalHours = num(job.combined_total_hours);

  const department = (
    base: number,
    tax: number,
    hours: number,
    overtimeCost: number,
  ): DepartmentFigures => ({
    base,
    tax,
    withTax: base + tax,
    hours,
    overtimeCost,
    costPerHourWithTax: hours > 0 ? (base + tax) / hours : 0,
  });

  return {
    laborNet,
    overhead,
    laborWithTax: total,
    totalHours,
    costPerHourWithTax: totalHours > 0 ? total / totalHours : 0,
    multiJob: (job.by_job ?? []).length > 1,
    machining: mach
      ? department(
          machBase,
          split.mach,
          num(mach.hours?.weekday_work) + num(mach.hours?.after_hours) + num(mach.hours?.sunday),
          num(mach.costs?.after_hours) + num(mach.costs?.sunday),
        )
      : null,
    welding: weld
      ? department(
          weldBase,
          split.weld,
          num(weld.hours?.regular) + num(weld.hours?.after_hours) + num(weld.hours?.holiday),
          num(weld.costs?.after_hours) + num(weld.costs?.holiday),
        )
      : null,
  };
}

/** Legacy laborByJobTable rows and totals (costs without vergi). */
export function laborByJobRows(byJob: LaborByJob[]) {
  const rows = byJob.map((j) => ({
    job_no: j.job_no,
    machining: num(j.machining_cost),
    welding: num(j.welding_cost),
    total: num(j.machining_cost) + num(j.welding_cost),
    hours: num(j.machining_hours) + num(j.welding_hours),
  }));
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + pick(r), 0);
  return {
    rows,
    total: {
      machining: sum((r) => r.machining),
      welding: sum((r) => r.welding),
      total: sum((r) => r.total),
      hours: sum((r) => r.hours),
    },
  };
}

/* ── machining entries ────────────────────────────────────────────── */

export interface MachiningOperation {
  job_no?: string;
  operation_key?: string;
  operation_name?: string;
  total_hours?: unknown;
  total_cost?: unknown;
  entries?: MachiningEntryRaw[];
}

export interface MachiningEntryRaw {
  id?: number | string;
  start_time?: number | string | null;
  employee_full_name?: string;
  employee_username?: string;
  hours?: unknown;
  cost?: unknown;
  work_type?: string;
  job_no?: string;
  operation_key?: string;
  operation_name?: string;
}

export interface MachiningTableRow {
  id: string;
  group: string;
  summary: boolean;
  job_no: string;
  operation_key: string;
  operation_name: string;
  /** Local day (YYYY-MM-DD) of the entry; '' on summary rows. */
  date: string;
  employee: string;
  hours: number;
  cost: number;
  work_type: string;
}

/** Local YYYY-MM-DD of an epoch-ms or ISO time; '-' when missing. */
export function localDay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const d = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  if (Number.isNaN(d.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The machining report groups entries per operation (job order + operation
 * when a subtree is shown). Flat entries (no `entries` array) are grouped
 * here by job order and operation, so both shapes give the same table.
 */
export function machiningOperations(entries: unknown[]): MachiningOperation[] {
  if (
    entries.every(
      (e) => e && typeof e === 'object' && Array.isArray((e as MachiningOperation).entries),
    )
  )
    return entries as MachiningOperation[];
  const groups = new Map<string, MachiningOperation>();
  for (const raw of entries as MachiningEntryRaw[]) {
    const key = `${raw.job_no ?? ''}|${raw.operation_key ?? '-'}`;
    let op = groups.get(key);
    if (!op) {
      op = {
        job_no: raw.job_no,
        operation_key: raw.operation_key,
        operation_name: raw.operation_name,
        total_hours: 0,
        total_cost: 0,
        entries: [],
      };
      groups.set(key, op);
    }
    op.total_hours = num(op.total_hours) + num(raw.hours);
    op.total_cost = num(op.total_cost) + num(raw.cost);
    op.entries!.push(raw);
  }
  return [...groups.values()];
}

/** Legacy showMachiningDetails table: a Toplam row per operation, then its entries by start time. */
export function machiningTableRows(ops: MachiningOperation[]): {
  rows: MachiningTableRow[];
  multiJob: boolean;
} {
  const multiJob = new Set(ops.map((op) => op.job_no)).size > 1;
  const rows: MachiningTableRow[] = [];
  for (const op of ops) {
    const group = multiJob
      ? `${op.job_no ?? ''} | ${op.operation_key || '-'}`
      : op.operation_key || '-';
    const base = {
      group,
      job_no: op.job_no ?? '',
      operation_key: op.operation_key || '-',
      operation_name: op.operation_name || '-',
    };
    rows.push({
      ...base,
      id: `summary-${group}`,
      summary: true,
      date: '',
      employee: '',
      hours: num(op.total_hours),
      cost: num(op.total_cost),
      work_type: '',
    });
    const entries = [...(op.entries ?? [])].sort((a, b) => num(a.start_time) - num(b.start_time));
    entries.forEach((e, index) => {
      rows.push({
        ...base,
        id: `${group}-${e.id ?? index}`,
        summary: false,
        date: localDay(e.start_time),
        employee: e.employee_full_name || e.employee_username || '-',
        hours: num(e.hours),
        cost: num(e.cost),
        work_type: e.work_type ?? '',
      });
    });
  }
  return { rows, multiJob };
}

export const MACHINING_WORK_TYPES: Record<string, string> = {
  weekday_work: 'Hafta İçi',
  after_hours: 'Mesai',
  sunday: 'Pazar',
};

export const WELDING_OVERTIME_TYPES: Record<string, string> = {
  regular: 'Normal',
  after_hours: 'Mesai',
  holiday: 'Tatil',
};

export interface WeldingEntryLike {
  job_no?: string;
  date?: string;
  hours?: unknown;
  cost?: unknown;
}

/** Legacy showWeldingDetails: entries by date; per job order when a subtree is shown. */
export function weldingGroups<T extends WeldingEntryLike>(entries: T[]) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime() || 0,
  );
  const multiJob = new Set(entries.map((e) => e.job_no)).size > 1;
  const groups = new Map<string, T[]>();
  for (const e of sorted) {
    const key = e.job_no ?? '-';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return {
    sorted,
    multiJob,
    groups: [...groups.entries()].map(([jobNo, rows]) => ({
      jobNo,
      rows,
      hours: rows.reduce((s, r) => s + num(r.hours), 0),
      cost: rows.reduce((s, r) => s + num(r.cost), 0),
    })),
  };
}

/* ── estimated cost breakdown ─────────────────────────────────────── */

export const PRICE_SOURCE_LABELS: Record<string, string> = {
  po_line: 'PO satırı',
  recommended_offer: 'Önerilen teklif',
  any_offer: 'Tedarikçi teklifi',
  historical_po: 'Geçmiş PO',
  procurement_line: 'Kayıtlı malzeme satırı',
  none: 'Fiyat yok',
};

/** Weight for €/kg: the subtree's, else the job's, else the table row's. */
export function breakdownWeight(
  data: { subtree_weight_kg?: unknown; total_weight_kg?: unknown },
  costRow: CostTableRow | null,
): number {
  return num(data.subtree_weight_kg) || num(data.total_weight_kg) || num(costRow?.total_weight_kg);
}

/** Selling price for the marj tiles: the breakdown's EUR price, else the row's display price. */
export function breakdownSellingPrice(
  data: { selling_price_eur?: unknown },
  costRow: CostTableRow | null,
): number {
  const own = num(data.selling_price_eur);
  if (own) return own;
  if (!costRow) return 0;
  const primary =
    costRow.selling_price_display_source === 'rolled_up_from_children'
      ? num(costRow.selling_price_display)
      : num(costRow.selling_price);
  return primary || num(costRow.selling_price_display);
}

/** Marj % of a cost against a price; null without a price. */
export function marginPctOf(sellingPrice: number, cost: unknown): number | null {
  const c = num(cost);
  return sellingPrice > 0 ? ((sellingPrice - c) / sellingPrice) * 100 : null;
}

/** Fark (Gerçek − Tahmini). */
export function costDiff(estimated: unknown, actual: unknown): number {
  return num(actual) - num(estimated);
}

/* ── derived selling prices ───────────────────────────────────────── */

const money2 = (v: unknown) =>
  `€${num(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kg = (v: unknown) => `${num(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`;

export const DERIVED_PRICE_META: Record<string, { icon: string; label: string }> = {
  allocated_from_parent: { icon: 'fas fa-turn-down', label: 'ağırlığa göre dağıtıldı' },
  rolled_up_from_children: { icon: 'fas fa-turn-up', label: 'alt işlerin toplamı' },
};

/** Legacy describeDerivedPrice (apis/formatters.js). */
export function describeDerivedPrice(
  source: string | null | undefined,
  basis: CostTableRow['selling_price_derived_basis'],
) {
  if (source === 'allocated_from_parent' && basis) {
    return (
      'Bu iş emrinin kendi satış fiyatı girilmemiş. ' +
      `${basis.from_job_no} iş emrinin ${money2(basis.from_amount_eur)} tutarından ` +
      `ağırlık oranına göre hesaplandı (${kg(basis.weight_kg)} / ${kg(basis.total_weight_kg)}).`
    );
  }
  if (source === 'rolled_up_from_children') {
    return 'Bu iş emrinin kendi satış fiyatı girilmemiş. Alt iş emirlerinde girili satış fiyatlarının toplamı gösteriliyor.';
  }
  return '';
}
