import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// GET /reports/overview/{slice}/ from apis/reports/overview.js, for the
// management overview report (management/reports/overview). The report is
// split into five slices; each tab of the page loads the ones it needs.

export type ApiNumber = number | string | null | undefined;

export type OverviewSlice =
  'job-orders' | 'operations' | 'sales' | 'subcontracting' | 'procurement';

export type OverviewPreset =
  'current_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'all_time';

export interface OverviewMeta {
  preset?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  prev_date_from?: string | null;
  prev_date_to?: string | null;
  compare?: boolean;
}

export interface OverviewManufacturing {
  welding_hours?: ApiNumber;
  machining_hours?: ApiNumber;
  cnc_hours?: ApiNumber;
  maintenance_hours?: ApiNumber;
  manufactured_tonnage_kg?: ApiNumber;
  manufacturedTonnageKg?: ApiNumber;
  total_productive_hours?: ApiNumber;
  machining_parts_completed?: ApiNumber;
  machining_parts_remaining?: ApiNumber;
  cnc_tasks_completed?: ApiNumber;
  cnc_tasks_remaining?: ApiNumber;
  welding_active_users?: ApiNumber;
  machining_active_users?: ApiNumber;
  cnc_active_users?: ApiNumber;
  maintenance_active_users?: ApiNumber;
}

export interface OverviewMaintenance {
  maintenance_hours?: ApiNumber;
  maintenance_active_users?: ApiNumber;
  faults_resolved_in_range?: ApiNumber;
  faults_open?: ApiNumber;
}

export interface OverviewOvertimeTeam {
  team?: string;
  team_name?: string;
  Team?: string;
  hours?: ApiNumber;
  Hours?: ApiNumber;
}

export interface OverviewOvertime {
  requests_in_range?: ApiNumber;
  requestsInRange?: ApiNumber;
  requests_approved_in_range?: ApiNumber;
  requestsApprovedInRange?: ApiNumber;
  total_approved_hours?: ApiNumber;
  totalApprovedHours?: ApiNumber;
  by_team?: OverviewOvertimeTeam[];
  byTeam?: OverviewOvertimeTeam[];
}

export interface OverviewSales {
  offers_created_in_range?: ApiNumber;
  offers_won_in_range?: ApiNumber;
  offers_lost_in_range?: ApiNumber;
  total_won_value_eur?: ApiNumber;
  total_lost_value_eur?: ApiNumber;
  total_pending_value_eur?: ApiNumber;
  sales_consults_by_department?: Record<string, ApiNumber>;
}

export interface OverviewJobOrders {
  total_active?: ApiNumber;
  total_completed_in_range?: ApiNumber;
  total_started_in_range?: ApiNumber;
  overdue?: ApiNumber;
  avg_completion_pct?: ApiNumber;
  by_status?: Record<string, ApiNumber>;
}

export interface OverviewJobOrderCosts {
  jobs_with_cost_data?: ApiNumber;
  jobs_with_selling_price?: ApiNumber;
  total_selling_price_eur?: ApiNumber;
  total_actual_cost_eur?: ApiNumber;
  total_labor_cost_eur?: ApiNumber;
  total_material_cost_eur?: ApiNumber;
  total_subcontractor_cost_eur?: ApiNumber;
  avg_margin_pct?: ApiNumber;
}

export interface OverviewSubcontractorRow {
  name?: string | null;
  approved_total?: ApiNumber;
  currency?: string | null;
  total_awarded_weight_kg?: ApiNumber;
  totalAwardedWeightKg?: ApiNumber;
}

export interface OverviewSubcontracting {
  by_subcontractor?: OverviewSubcontractorRow[];
  total_approved_value?: ApiNumber;
  total_approved_currency?: string | null;
  currency?: string | null;
  total_awarded_weight_kg?: ApiNumber;
  total_unbilled_accrual_eur?: ApiNumber;
}

export interface OverviewProcurementItem {
  item_code?: string | null;
  item_name?: string | null;
  unit?: string | null;
  total_quantity?: ApiNumber;
  total_cost_eur?: ApiNumber;
}

export interface OverviewProcurementSupplier {
  supplier_name?: string | null;
  total_cost_eur?: ApiNumber;
}

export interface OverviewProcurementJobOrder {
  job_no?: string | null;
  total_cost_eur?: ApiNumber;
}

export interface OverviewProcurement {
  requests_submitted_in_range?: ApiNumber;
  requests_in_range?: ApiNumber;
  orders_created_in_range?: ApiNumber;
  total_ordered_value_eur?: ApiNumber;
  payments_due_in_range?: ApiNumber;
  payments_overdue?: ApiNumber;
  total_payments_due_eur?: ApiNumber;
  top_items_by_quantity?: OverviewProcurementItem[];
  top_items_by_cost?: OverviewProcurementItem[];
  top_suppliers_by_cost?: OverviewProcurementSupplier[];
  top_job_orders_by_cost?: OverviewProcurementJobOrder[];
}

export interface OverviewQuality {
  ncrs_opened_in_range?: ApiNumber;
  ncrs_closed_in_range?: ApiNumber;
  ncrs_open_total?: ApiNumber;
  qc_reviews_in_range?: ApiNumber;
  qc_reviews_approved?: ApiNumber;
  qc_reviews_rejected?: ApiNumber;
  ncrs_by_severity?: { critical?: ApiNumber; major?: ApiNumber; minor?: ApiNumber };
  ncrs_by_defect_type?: Record<string, ApiNumber>;
}

/** One slice response; each slice fills some of these. */
export interface OverviewSliceResponse {
  meta?: OverviewMeta;
  manufacturing?: OverviewManufacturing;
  maintenance?: OverviewMaintenance;
  overtime?: OverviewOvertime;
  sales?: OverviewSales;
  costs?: OverviewJobOrderCosts;
  job_orders?: OverviewJobOrders;
  quality?: OverviewQuality;
  subcontracting?: OverviewSubcontracting;
  procurement?: OverviewProcurement;
  previous_period?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OverviewPreviousPeriod {
  manufacturing: OverviewManufacturing;
  maintenance: OverviewMaintenance;
  overtime: OverviewOvertime;
  sales?: OverviewSales;
  costs?: OverviewJobOrderCosts;
  subcontracting?: OverviewSubcontracting;
  procurement?: OverviewProcurement;
  quality?: OverviewQuality;
}

/** The merged shape the page renders (mergeOverviewResponses). */
export interface OverviewData {
  meta: OverviewMeta;
  manufacturing: OverviewManufacturing;
  maintenance: OverviewMaintenance;
  overtime: OverviewOvertime;
  sales?: OverviewSales;
  costs?: OverviewJobOrderCosts;
  subcontracting: OverviewSubcontracting;
  procurement: OverviewProcurement;
  quality: OverviewQuality;
  job_orders: OverviewJobOrders;
  job_orders_costs?: OverviewJobOrderCosts;
  previous_period: OverviewPreviousPeriod;
}

export interface OverviewFilter {
  preset?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  compare?: boolean;
}

/**
 * Query params exactly as legacy buildOverviewQuery: a preset wins; a custom
 * range needs both ends (swapped when reversed); nothing set means this month.
 * `compare=true` is sent only when comparing. Throws on a half-open range.
 */
export function buildOverviewQuery({
  preset,
  date_from,
  date_to,
  compare,
}: OverviewFilter = {}): Record<string, string> {
  const qs: Record<string, string> = {};
  if (preset) {
    qs.preset = preset;
    if (compare === true) qs.compare = 'true';
    return qs;
  }
  const hasFrom = Boolean(date_from);
  const hasTo = Boolean(date_to);
  if (hasFrom || hasTo) {
    if (!hasFrom || !hasTo) {
      throw new Error('Custom range için date_from ve date_to birlikte gönderilmelidir');
    }
    let from = String(date_from);
    let to = String(date_to);
    if (from > to) [from, to] = [to, from];
    qs.date_from = from;
    qs.date_to = to;
    if (compare === true) qs.compare = 'true';
    return qs;
  }
  qs.preset = 'current_month';
  if (compare === true) qs.compare = 'true';
  return qs;
}

export const OVERVIEW_STALE_TIME = 5 * 60_000;

export const overviewKeys = {
  all: ['reports', 'overview'] as const,
  slice: (slice: OverviewSlice, query: Record<string, string>) =>
    ['reports', 'overview', slice, query] as const,
};

/** GET /reports/overview/{slice}/?preset=…|date_from=…&date_to=…[&compare=true] */
export function overviewSliceQueryOptions(slice: OverviewSlice, query: Record<string, string>) {
  return queryOptions({
    queryKey: overviewKeys.slice(slice, query),
    queryFn: ({ signal }) =>
      apiFetch<OverviewSliceResponse | null>(`/reports/overview/${slice}/`, {
        params: query,
        signal,
      }),
    staleTime: OVERVIEW_STALE_TIME,
  });
}

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return Boolean(value) && typeof value === 'object';
}

function pickKeyedPayload(raw: unknown, key: string): Obj {
  if (!isObject(raw)) return {};
  const inner = raw[key];
  if (key in raw && inner !== null && inner !== undefined && typeof inner === 'object')
    return inner as Obj;
  return raw;
}

function mergeObjects(a: unknown, b: unknown): Obj {
  return { ...(isObject(a) ? a : {}), ...(isObject(b) ? b : {}) };
}

function prev(slice: OverviewSliceResponse | null | undefined): Obj {
  const value = slice?.previous_period;
  return isObject(value) ? value : {};
}

/**
 * Merges the slice responses into the shape the page renders, as legacy
 * mergeOverviewResponses. Missing slices count as empty.
 */
export function mergeOverviewResponses(
  operations?: OverviewSliceResponse | null,
  subcontracting?: OverviewSliceResponse | null,
  procurement?: OverviewSliceResponse | null,
  sales?: OverviewSliceResponse | null,
  jobOrders?: OverviewSliceResponse | null,
): OverviewData {
  const sub = pickKeyedPayload(subcontracting, 'subcontracting');
  const proc = pickKeyedPayload(procurement, 'procurement');

  const ppOps = prev(operations);
  const ppSales = prev(sales);
  const ppSub = prev(subcontracting);
  const ppProc = prev(procurement);
  const ppJobs = prev(jobOrders);

  const previous_period: OverviewPreviousPeriod = {
    manufacturing: mergeObjects(ppJobs.manufacturing, ppOps.manufacturing),
    maintenance: mergeObjects(ppJobs.maintenance, ppOps.maintenance),
    overtime: mergeObjects(ppJobs.overtime, ppOps.overtime),
    sales: ppSales.sales as OverviewSales | undefined,
    costs: ppSales.costs as OverviewJobOrderCosts | undefined,
    subcontracting: (ppSub.subcontracting ?? ppSub) as OverviewSubcontracting,
    procurement: (ppProc.procurement ?? ppProc) as OverviewProcurement,
    quality: (ppJobs.quality ?? ppOps.quality) as OverviewQuality | undefined,
  };

  const jobOrdersMetrics = jobOrders?.job_orders;
  const jobOrdersCosts = jobOrders?.costs;

  const meta = [
    operations?.meta,
    sales?.meta,
    jobOrders?.meta,
    subcontracting?.meta,
    procurement?.meta,
  ].reduce<Obj>((acc, m) => mergeObjects(acc, m ?? {}), {});

  return {
    meta,
    manufacturing: mergeObjects(jobOrders?.manufacturing, operations?.manufacturing),
    maintenance: mergeObjects(jobOrders?.maintenance, operations?.maintenance),
    overtime: mergeObjects(jobOrders?.overtime, operations?.overtime),
    sales: sales?.sales,
    costs: sales?.costs ?? jobOrdersCosts,
    subcontracting: sub,
    procurement: proc,
    quality: jobOrders?.quality ?? operations?.quality ?? {},
    job_orders: isObject(jobOrdersMetrics) ? jobOrdersMetrics : {},
    job_orders_costs: isObject(jobOrdersCosts) ? jobOrdersCosts : undefined,
    previous_period,
  };
}
