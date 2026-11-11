import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// Dönemsel iş maliyeti: each job's cost incurred in a month range
// (GET /projects/job-orders/period_cost/, projects.services.period_costing).
// Amounts are EUR strings.

export const PERIOD_COMPONENTS = [
  'labor',
  'employee_overhead',
  'material',
  'subcontractor',
  'paint',
  'paint_material',
  'qc',
  'shipping',
  'general_expenses',
  'machine_rental',
] as const;

export type PeriodComponent = (typeof PERIOD_COMPONENTS)[number];

export const COMPONENT_LABELS: Record<PeriodComponent, string> = {
  labor: 'İşçilik',
  employee_overhead: 'Personel Gideri',
  material: 'Malzeme',
  subcontractor: 'Taşeron',
  paint: 'Boya (Taşeron)',
  paint_material: 'Boya Malzemesi',
  qc: 'Kalite Kontrol',
  shipping: 'Nakliye',
  general_expenses: 'Genel Gider',
  machine_rental: 'Makine Kirası',
};

export type ComponentAmounts = Record<PeriodComponent, string>;

export interface PeriodCostRow {
  job_no: string;
  title: string;
  customer_name: string | null;
  status: string;
  total_weight_kg: string | null;
  components: ComponentAmounts;
  total: string;
  /** The part of `total` whose month came from a fallback, not a recorded date. */
  estimated: string;
  by_month: Record<string, string>;
  children: PeriodCostRow[];
}

export interface PeriodCostReport {
  start: string;
  end: string;
  months: string[];
  components: PeriodComponent[];
  totals: ComponentAmounts & { total: string };
  by_month: (ComponentAmounts & { month: string; total: string })[];
  rows: PeriodCostRow[];
}

export interface ReconcileComponent {
  component: PeriodComponent;
  /** The cost table's figure. */
  lifetime: string;
  /** Sum of every month. */
  dated: string;
  estimated: string;
  /** Belongs to no month yet (material not received, general expenses not produced). */
  not_dated: string;
  difference: string;
}

export interface PeriodCostReconciliation {
  job_no: string;
  job_nos: string[];
  first_month: string | null;
  last_month: string | null;
  material_not_received: string;
  material_undated: string;
  general_expenses_not_produced: string;
  components: ReconcileComponent[];
}

export const periodCostKeys = {
  all: ['periodCost'] as const,
  report: (start: string, end: string) => [...periodCostKeys.all, 'report', start, end] as const,
  reconcile: (jobNo: string) => [...periodCostKeys.all, 'reconcile', jobNo] as const,
};

const zeroAmounts = (): ComponentAmounts =>
  Object.fromEntries(PERIOD_COMPONENTS.map((c) => [c, '0.00'])) as ComponentAmounts;

function normalizeRow(row: Partial<PeriodCostRow>): PeriodCostRow {
  return {
    job_no: row.job_no ?? '',
    title: row.title ?? '',
    customer_name: row.customer_name ?? null,
    status: row.status ?? '',
    total_weight_kg: row.total_weight_kg ?? null,
    components: { ...zeroAmounts(), ...row.components },
    total: row.total ?? '0.00',
    estimated: row.estimated ?? '0.00',
    by_month: row.by_month ?? {},
    children: (row.children ?? []).map(normalizeRow),
  };
}

/** Fills whatever a response leaves out, so the page never reads a missing list. */
export function normalizePeriodReport(
  payload: Partial<PeriodCostReport> | null | undefined,
  start: string,
  end: string,
): PeriodCostReport {
  const body = payload ?? {};
  return {
    start: body.start ?? start,
    end: body.end ?? end,
    months: body.months ?? [],
    components: body.components ?? [...PERIOD_COMPONENTS],
    totals: { ...zeroAmounts(), total: '0.00', ...body.totals },
    by_month: body.by_month ?? [],
    rows: (body.rows ?? []).map(normalizeRow),
  };
}

/** GET /projects/job-orders/period_cost/?start=YYYY-MM&end=YYYY-MM */
export function periodCostQueryOptions(start: string, end: string) {
  return queryOptions({
    queryKey: periodCostKeys.report(start, end),
    queryFn: async ({ signal }) =>
      normalizePeriodReport(
        await apiFetch<Partial<PeriodCostReport>>('/projects/job-orders/period_cost/', {
          params: { start, end },
          signal,
        }),
        start,
        end,
      ),
    staleTime: 60_000,
  });
}

/** GET /projects/job-orders/{job_no}/period_cost_reconcile/ */
export function periodCostReconcileQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: periodCostKeys.reconcile(jobNo),
    queryFn: async ({ signal }) => {
      const body = await apiFetch<Partial<PeriodCostReconciliation>>(
        `/projects/job-orders/${encodeURIComponent(jobNo)}/period_cost_reconcile/`,
        { signal },
      );
      return {
        job_no: body?.job_no ?? jobNo,
        job_nos: body?.job_nos ?? [jobNo],
        first_month: body?.first_month ?? null,
        last_month: body?.last_month ?? null,
        material_not_received: body?.material_not_received ?? '0.00',
        material_undated: body?.material_undated ?? '0.00',
        general_expenses_not_produced: body?.general_expenses_not_produced ?? '0.00',
        components: body?.components ?? [],
      } satisfies PeriodCostReconciliation;
    },
    staleTime: 60_000,
  });
}
