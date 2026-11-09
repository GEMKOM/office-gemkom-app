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

/** GET /projects/job-orders/period_cost/?start=YYYY-MM&end=YYYY-MM */
export function periodCostQueryOptions(start: string, end: string) {
  return queryOptions({
    queryKey: periodCostKeys.report(start, end),
    queryFn: ({ signal }) =>
      apiFetch<PeriodCostReport>('/projects/job-orders/period_cost/', {
        params: { start, end },
        signal,
      }),
    staleTime: 60_000,
  });
}

/** GET /projects/job-orders/{job_no}/period_cost_reconcile/ */
export function periodCostReconcileQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: periodCostKeys.reconcile(jobNo),
    queryFn: ({ signal }) =>
      apiFetch<PeriodCostReconciliation>(
        `/projects/job-orders/${encodeURIComponent(jobNo)}/period_cost_reconcile/`,
        { signal },
      ),
    staleTime: 60_000,
  });
}
