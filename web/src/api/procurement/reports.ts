import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { extractResults } from '../types';

// Port of the list reports in apis/procurement/reports.js (Ürün, Tedarikçi,
// Personel). Each endpoint returns the whole report in one response (an array,
// or a { results } envelope); the pages sort on the server and page locally.

export type ReportNumber = number | string | null;

export interface ItemsReportRow {
  code?: string;
  name?: string;
  unit?: string;
  buy_count?: number;
  total_quantity?: ReportNumber;
  total_spent_eur?: ReportNumber;
  min_unit_price_eur?: ReportNumber;
  suppliers?: string[] | null;
  last_bought_at?: string | null;
  [key: string]: unknown;
}

export interface SuppliersReportRow {
  id?: number;
  code?: string;
  name?: string;
  default_currency?: string;
  has_dbs?: boolean | null;
  dbs_limit?: ReportNumber;
  total_pos?: number;
  total_post?: number;
  cancelled_pos?: number;
  total_spent_eur?: ReportNumber;
  total_tax_eur?: ReportNumber;
  unpaid_amount_eur?: ReportNumber;
  distinct_items?: number;
  avg_delivery_days_weighted?: ReportNumber;
  last_purchase_at?: string | null;
  [key: string]: unknown;
}

export interface StaffReportRow {
  user_id?: number;
  username?: string;
  full_name?: string;
  pr_count?: number;
  po_count?: number;
  total_spent_eur?: ReportNumber;
  distinct_items_in_prs?: number;
  requested_qty_by_unit?: Record<string, ReportNumber> | null;
  ordered_qty_by_unit?: Record<string, ReportNumber> | null;
  last_activity_at?: string | null;
  [key: string]: unknown;
}

export interface ItemsReportParams extends QueryParams {
  code__icontains?: string;
  name__icontains?: string;
  ordering?: string;
}

export interface SuppliersReportParams extends QueryParams {
  name__icontains?: string;
  code__icontains?: string;
  has_dbs?: string;
  created_gte?: string;
  created_lte?: string;
  status?: string;
  min_total_spent_eur?: string;
  ordering?: string;
}

export interface StaffReportParams extends QueryParams {
  teams?: string;
  username__icontains?: string;
  name__icontains?: string;
  email__icontains?: string;
  is_active?: string;
  created_gte?: string;
  created_lte?: string;
  ordering?: string;
}

/** Reports are aggregates the users refresh by hand; a minute is fresh enough. */
export const REPORTS_STALE_TIME = 60_000;

export const reportKeys = {
  all: ['procurementReports'] as const,
  report: (name: string, params: QueryParams) =>
    ['procurementReports', name, cleanParams(params)] as const,
};

function reportQuery<T>(name: string, path: string, params: QueryParams) {
  return queryOptions({
    queryKey: reportKeys.report(name, params),
    queryFn: async ({ signal }) =>
      extractResults<T>(await apiFetch<unknown>(path, { params, signal })),
    staleTime: REPORTS_STALE_TIME,
  });
}

/** getItemsReport: GET /procurement/reports/items */
export function itemsReportQueryOptions(params: ItemsReportParams) {
  return reportQuery<ItemsReportRow>('items', '/procurement/reports/items', params);
}

/** getSuppliersReport: GET /procurement/reports/suppliers */
export function suppliersReportQueryOptions(params: SuppliersReportParams) {
  return reportQuery<SuppliersReportRow>('suppliers', '/procurement/reports/suppliers', params);
}

/** getStaffReport: GET /procurement/reports/staff */
export function staffReportQueryOptions(params: StaffReportParams) {
  return reportQuery<StaffReportRow>('staff', '/procurement/reports/staff', params);
}

// ---------------------------------------------------------------------------
// Payment forecast (Nakit Akış Tablosu, Yönetici Özeti) and the month's
// outflow detail. Ports of getPaymentForecastReport / getOutflowDetail.

export interface PaymentForecastParams extends QueryParams {
  created_gte?: string;
  created_lte?: string;
}

/**
 * Outflow figures. The cash-flow page reads the current names first
 * (total_outflow_eur, procurement_*), the executive overview reads the
 * procurement ones (total_spent_eur, paid_eur, ...): both are kept as sent.
 */
export interface PaymentForecastKpis {
  total_outflow_eur?: ReportNumber;
  total_spent_eur?: ReportNumber;
  total_procurement_paid_eur?: ReportNumber;
  total_paid_eur?: ReportNumber;
  total_procurement_awaiting_eur?: ReportNumber;
  total_awaiting_eur?: ReportNumber;
  po_count?: number | null;
  active_suppliers?: number | null;
  mom_percent?: ReportNumber;
  yoy_percent?: ReportNumber;
  [key: string]: unknown;
}

export interface PaymentForecastMonth {
  /** "YYYY-MM" */
  month: string;
  total_outflow_eur?: ReportNumber;
  total_spent_eur?: ReportNumber;
  procurement_paid_eur?: ReportNumber;
  paid_eur?: ReportNumber;
  procurement_awaiting_eur?: ReportNumber;
  awaiting_eur?: ReportNumber;
  po_count?: number | null;
  active_suppliers?: number | null;
  [key: string]: unknown;
}

export interface DbsSupplierRow {
  supplier_name?: string;
  dbs_bank?: string | null;
  dbs_currency?: string | null;
  dbs_used?: ReportNumber;
  dbs_used_eur?: ReportNumber;
  dbs_limit_eur?: ReportNumber;
  dbs_available_eur?: ReportNumber;
  /** "YYYY-MM-DD" */
  dbs_expiry_date?: string | null;
  [key: string]: unknown;
}

export interface PaymentForecastReport {
  kpis?: PaymentForecastKpis | null;
  series?: PaymentForecastMonth[] | null;
  dbs_summary?: { total_dbs_used_eur?: ReportNumber; suppliers?: DbsSupplierRow[] | null } | null;
  undated_schedules?: {
    total_outflow_eur?: ReportNumber;
    total_eur?: ReportNumber;
    po_count?: number | null;
  } | null;
}

export interface OutflowProcurementRow {
  supplier_name?: string | null;
  supplier_code?: string | null;
  pr_title?: string | null;
  label?: string | null;
  due_date?: string | null;
  amount_eur?: ReportNumber;
  is_paid?: boolean;
}

export interface OutflowExpenseRow {
  category?: string | null;
  description?: string | null;
  recurrence?: string | null;
  amount_eur?: ReportNumber;
}

export interface OutflowLoanRow {
  loan_name?: string | null;
  sequence?: number | null;
  due_date?: string | null;
  amount_eur?: ReportNumber;
  is_paid?: boolean;
}

export interface OutflowTaxRow {
  tax_type?: string | null;
  period_label?: string | null;
  due_date?: string | null;
  amount_eur?: ReportNumber;
  is_paid?: boolean;
}

export interface OutflowAdhocRow {
  job_no?: string | null;
  description?: string | null;
  category?: string | null;
  cost_date?: string | null;
  amount_eur?: ReportNumber;
}

export interface OutflowDetail {
  totals?: {
    grand_total_eur?: ReportNumber;
    procurement_eur?: ReportNumber;
    wages_eur?: ReportNumber;
    expenses_eur?: ReportNumber;
    loans_eur?: ReportNumber;
    taxes_eur?: ReportNumber;
    adhoc_eur?: ReportNumber;
  } | null;
  procurement?: OutflowProcurementRow[] | null;
  wages?: {
    base_payroll_eur?: ReportNumber;
    overtime_premium_eur?: ReportNumber;
    total_eur?: ReportNumber;
    employee_count?: number | null;
  } | null;
  expenses?: OutflowExpenseRow[] | null;
  loans?: OutflowLoanRow[] | null;
  taxes?: OutflowTaxRow[] | null;
  adhoc_costs?: OutflowAdhocRow[] | null;
}

/** getPaymentForecastReport: GET /procurement/reports/payment-forecast?created_gte&created_lte */
export function paymentForecastQueryOptions(params: PaymentForecastParams) {
  return queryOptions({
    queryKey: reportKeys.report('payment-forecast', params),
    queryFn: ({ signal }) =>
      apiFetch<PaymentForecastReport>('/procurement/reports/payment-forecast', {
        params: { created_gte: params.created_gte, created_lte: params.created_lte },
        signal,
      }),
    staleTime: REPORTS_STALE_TIME,
  });
}

/** getOutflowDetail: GET /procurement/reports/outflow-detail/?month=YYYY-MM */
export function outflowDetailQueryOptions(month: string) {
  return queryOptions({
    queryKey: reportKeys.report('outflow-detail', { month }),
    queryFn: ({ signal }) =>
      apiFetch<OutflowDetail | null>('/procurement/reports/outflow-detail/', {
        params: { month },
        signal,
      }),
    staleTime: REPORTS_STALE_TIME,
    enabled: Boolean(month),
  });
}
