import { queryOptions } from '@tanstack/react-query';
import { apiFetch, type QueryParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Port of the job-order cost endpoints in apis/projects/cost.js (the cost
// table, its catalog scope, cost children, procurement lines, the estimated
// cost breakdown) and of fetchSubcontractorCostBreakdown from
// apis/subcontracting/subcontractors.js, which reads a job-order endpoint.

/** The API sends decimals as strings ("1234.50"); null when unknown. */
export type ApiDecimal = number | string | null | undefined;

export interface CatalogNodeRef {
  id: number;
  title: string;
  path?: string;
}

export interface DerivedPriceBasis {
  from_job_no?: string;
  from_amount_eur?: ApiDecimal;
  weight_kg?: ApiDecimal;
  total_weight_kg?: ApiDecimal;
}

export type SellingPriceSource = 'allocated_from_parent' | 'rolled_up_from_children' | string;

/** One row of GET /projects/job-orders/cost_table/ (and of cost_children). */
export interface CostTableRow {
  job_no: string;
  title?: string | null;
  customer_name?: string | null;
  customer_short_name?: string | null;
  status?: string | null;
  is_manufactured?: boolean | null;
  catalog_nodes?: CatalogNodeRef[] | null;
  catalog_nodes_from_children?: boolean;
  has_children?: boolean;
  total_weight_kg?: ApiDecimal;
  labor_cost?: ApiDecimal;
  employee_overhead_cost?: ApiDecimal;
  material_cost?: ApiDecimal;
  subcontractor_cost?: ApiDecimal;
  paint_cost?: ApiDecimal;
  paint_material_cost?: ApiDecimal;
  qc_cost?: ApiDecimal;
  shipping_cost?: ApiDecimal;
  machine_rental_cost?: ApiDecimal;
  general_expenses_cost?: ApiDecimal;
  general_expenses_rate?: ApiDecimal;
  actual_total_cost?: ApiDecimal;
  estimated_total_cost?: ApiDecimal;
  price_per_kg?: ApiDecimal;
  selling_price?: ApiDecimal;
  selling_price_currency?: string | null;
  selling_price_is_derived?: boolean;
  selling_price_display?: ApiDecimal;
  selling_price_display_source?: SellingPriceSource | null;
  selling_price_derived_basis?: DerivedPriceBasis | null;
  selling_price_per_kg?: ApiDecimal;
  margin_eur?: ApiDecimal;
  margin_pct?: ApiDecimal;
  completion_pct?: ApiDecimal;
  target_completion_date?: string | null;
  [key: string]: unknown;
}

/** Filters of the cost table; the catalog scope takes the same ones. */
export interface CostTableFilters {
  status__in?: string;
  search?: string;
  customer?: number;
  template_node?: string;
  manufactured?: 'true' | 'false';
  facility?: 'rolling_mill' | 'meltshop';
  target_completion_date__gte?: string;
  target_completion_date__lte?: string;
  created_at__date__gte?: string;
  created_at__date__lte?: string;
  cost_summary__last_updated__date__gte?: string;
  cost_summary__last_updated__date__lte?: string;
}

export interface CostTableParams extends CostTableFilters {
  ordering?: string;
  page?: number;
  page_size?: number;
}

/** A catalog item of GET cost_table_catalog_nodes/ (ancestors included). */
export interface CostCatalogNode {
  id: number;
  parent_id: number | null;
  title: string;
  title_override?: string | null;
  resolved_title?: string | null;
  code?: string | null;
  template_id: number;
  template_name?: string | null;
  own_job_count?: number | null;
  job_count?: number | null;
}

export interface ProcurementLine {
  id?: number;
  item_code?: string | null;
  item_name?: string | null;
  item_description?: string | null;
  item_unit?: string | null;
  quantity?: ApiDecimal;
  unit_price?: ApiDecimal;
  amount_eur?: ApiDecimal;
  [key: string]: unknown;
}

export interface EstimatedComponent {
  key?: string;
  label?: string;
  amount_eur?: ApiDecimal;
  actual_amount_eur?: ApiDecimal;
  description?: string | null;
}

export interface EstimatedMaterialLine {
  job_order?: string | null;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  quantity?: ApiDecimal;
  unit_price_eur?: ApiDecimal;
  amount_eur?: ApiDecimal;
  price_source?: string | null;
  price_date?: string | null;
}

export interface EstimatedCostBreakdown {
  job_order?: string;
  total_cost?: ApiDecimal;
  actual_total_cost?: ApiDecimal;
  completion_pct?: ApiDecimal;
  subtree_weight_kg?: ApiDecimal;
  total_weight_kg?: ApiDecimal;
  selling_price_eur?: ApiDecimal;
  components?: EstimatedComponent[];
  assumptions?: string[];
  children?: {
    job_order?: string;
    actual_total_cost?: ApiDecimal;
    estimated_total_cost?: ApiDecimal;
  }[];
  material_breakdown?: {
    items?: EstimatedMaterialLine[];
    items_count?: number;
    lines_total?: ApiDecimal;
    material_cost_floored_to_actual?: boolean;
    floor_adjustment_eur?: ApiDecimal;
    estimated_material_cost?: ApiDecimal;
  };
  last_updated?: string | null;
}

export interface SubcontractorCostLine {
  statement_year?: number | null;
  statement_month?: number | null;
  subcontractor_name?: string | null;
  delta_progress?: ApiDecimal;
  cost_amount?: ApiDecimal;
  cost_currency?: string | null;
  cost_amount_eur?: ApiDecimal;
}

export interface SubcontractorCostAdjustment {
  adjustment_type?: string | null;
  reason?: string | null;
  amount?: ApiDecimal;
  cost_currency?: string | null;
  cost_amount_eur?: ApiDecimal;
}

export interface SubcontractorCostBreakdown {
  lines?: SubcontractorCostLine[];
  adjustments?: SubcontractorCostAdjustment[];
  total_eur?: ApiDecimal;
}

/** Cost figures move slowly; a minute keeps tab switches from refetching. */
export const COST_STALE_TIME = 60_000;

export const costKeys = {
  all: ['job-order-cost'] as const,
  table: (params: CostTableParams) => ['job-order-cost', 'table', params] as const,
  catalogNodes: (filters: CostTableFilters) =>
    ['job-order-cost', 'catalog-nodes', filters] as const,
  children: (jobNo: string) => ['job-order-cost', 'children', jobNo] as const,
  row: (jobNo: string) => ['job-order-cost', 'row', jobNo] as const,
  procurementLines: (jobNo: string) => ['job-order-cost', 'procurement-lines', jobNo] as const,
  estimated: (jobNo: string) => ['job-order-cost', 'estimated', jobNo] as const,
  subcontractor: (jobNo: string) => ['job-order-cost', 'subcontractor', jobNo] as const,
};

const DATE_PARAMS = [
  'target_completion_date__gte',
  'target_completion_date__lte',
  'created_at__date__gte',
  'created_at__date__lte',
  'cost_summary__last_updated__date__gte',
  'cost_summary__last_updated__date__lte',
] as const;

/** Legacy costTableQueryParams: only set, valid values go out, in its order. */
export function costTableQuery(options: CostTableParams): QueryParams {
  const params: QueryParams = {};
  for (const key of DATE_PARAMS) {
    if (options[key]) params[key] = options[key];
  }
  if (options.status__in) params.status__in = options.status__in;
  if (
    options.customer !== undefined &&
    options.customer !== null &&
    !Number.isNaN(options.customer)
  )
    params.customer = String(options.customer);
  if (options.search) params.search = options.search;
  if (options.ordering) params.ordering = options.ordering;
  if (options.facility === 'rolling_mill' || options.facility === 'meltshop')
    params.facility = options.facility;
  if (options.template_node) params.template_node = options.template_node;
  if (options.manufactured === 'true' || options.manufactured === 'false')
    params.manufactured = options.manufactured;
  if (options.page !== undefined) params.page = String(options.page);
  if (options.page_size !== undefined) params.page_size = String(options.page_size);
  return params;
}

/** Legacy getCostTable: GET /projects/job-orders/cost_table/. */
export function fetchCostTable(params: CostTableParams, signal?: AbortSignal) {
  return apiFetch<unknown>('/projects/job-orders/cost_table/', {
    params: costTableQuery(params),
    signal,
  }).then((data) => toPaginated<CostTableRow>(data));
}

export function costTableQueryOptions(params: CostTableParams) {
  return queryOptions({
    queryKey: costKeys.table(params),
    queryFn: ({ signal }) => fetchCostTable(params, signal),
    staleTime: COST_STALE_TIME,
  });
}

/**
 * Legacy getCostTableCatalogNodes: the catalog items of every job order the
 * table holds for these filters (paging, ordering and template_node ignored).
 */
export function fetchCostTableCatalogNodes(filters: CostTableFilters, signal?: AbortSignal) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { template_node, ...rest } = filters;
  return apiFetch<{ nodes?: CostCatalogNode[] } | null>(
    '/projects/job-orders/cost_table_catalog_nodes/',
    { params: costTableQuery(rest), signal },
  ).then((data) => (Array.isArray(data?.nodes) ? data.nodes : []));
}

export function costTableCatalogNodesQueryOptions(filters: CostTableFilters) {
  return queryOptions({
    queryKey: costKeys.catalogNodes(filters),
    queryFn: ({ signal }) => fetchCostTableCatalogNodes(filters, signal),
    // The legacy picker re-fetched its scope on every open.
    staleTime: 0,
  });
}

/** Legacy getCostChildren: GET /projects/job-orders/{job_no}/cost_children/. */
export function fetchCostChildren(jobNo: string, signal?: AbortSignal) {
  return apiFetch<unknown>(`/projects/job-orders/${encodeURIComponent(jobNo)}/cost_children/`, {
    signal,
  }).then((data) =>
    Array.isArray(data) ? (data as CostTableRow[]) : extractResults<CostTableRow>(data),
  );
}

export function costChildrenQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: costKeys.children(jobNo),
    queryFn: ({ signal }) => fetchCostChildren(jobNo, signal),
    staleTime: COST_STALE_TIME,
  });
}

/**
 * Legacy fetchCostTableRowForJob: the cost table row with exactly this job_no
 * (search=job_no, page_size=100), used to line labor + vergi up with the table.
 */
export function costTableRowQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: costKeys.row(jobNo),
    queryFn: async ({ signal }) => {
      const page = await fetchCostTable({ search: jobNo, page_size: 100 }, signal);
      return page.results.find((row) => row.job_no === jobNo) ?? null;
    },
    staleTime: COST_STALE_TIME,
  });
}

/** Legacy getProcurementLines: GET /projects/procurement-lines/?job_order=… */
export function procurementLinesQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: costKeys.procurementLines(jobNo),
    queryFn: ({ signal }) =>
      apiFetch<unknown>('/projects/procurement-lines/', {
        params: { job_order: jobNo },
        signal,
      }).then((data) =>
        Array.isArray(data) ? (data as ProcurementLine[]) : extractResults<ProcurementLine>(data),
      ),
    staleTime: COST_STALE_TIME,
  });
}

/** Legacy getEstimatedCostBreakdown: GET /projects/job-orders/{job_no}/estimated_cost_breakdown/. */
export function estimatedCostBreakdownQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: costKeys.estimated(jobNo),
    queryFn: ({ signal }) =>
      apiFetch<EstimatedCostBreakdown>(
        `/projects/job-orders/${encodeURIComponent(jobNo)}/estimated_cost_breakdown/`,
        { signal },
      ).then((data) => data ?? {}),
    staleTime: COST_STALE_TIME,
  });
}

/** Legacy fetchSubcontractorCostBreakdown: GET /projects/job-orders/{job_no}/subcontractor_cost_breakdown/. */
export function subcontractorCostBreakdownQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: costKeys.subcontractor(jobNo),
    queryFn: ({ signal }) =>
      apiFetch<SubcontractorCostBreakdown>(
        `/projects/job-orders/${encodeURIComponent(jobNo)}/subcontractor_cost_breakdown/`,
        { signal },
      ).then((data) => data ?? {}),
    staleTime: COST_STALE_TIME,
  });
}
