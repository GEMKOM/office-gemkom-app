import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';

// Port of apis/sales/reports.js: the revenue (cash inflow) report and the
// month's inflow detail, used by the cash-flow page.

export type ReportNumber = number | string | null;

export interface RevenueReportParams extends QueryParams {
  created_gte?: string;
  created_lte?: string;
}

export interface RevenueMonth {
  /** "YYYY-MM" */
  month: string;
  total_inflow_eur?: ReportNumber;
  revenue_eur?: ReportNumber;
  offer_count?: number | null;
  [key: string]: unknown;
}

export interface RevenueReport {
  kpis?: {
    total_inflow_eur?: ReportNumber;
    total_revenue_eur?: ReportNumber;
    mom_percent?: ReportNumber;
    [key: string]: unknown;
  } | null;
  series?: RevenueMonth[] | null;
  undated?: {
    total_inflow_eur?: ReportNumber;
    revenue_eur?: ReportNumber;
    offer_count?: number | null;
  } | null;
}

/** One expected installment of an offer, due in the month. */
export interface InflowDetailRow {
  customer_name?: string | null;
  offer_no?: string | null;
  offer_title?: string | null;
  job_no?: string | null;
  job_status?: string | null;
  job_completion_percentage?: ReportNumber;
  installment_label?: string | null;
  installment_percentage?: ReportNumber;
  installment_due_date?: string | null;
  installment_amount_original?: ReportNumber;
  installment_amount_eur?: ReportNumber;
  original_currency?: string | null;
  order_no?: string | null;
}

/** Aggregates the users refresh by hand; a minute is fresh enough. */
export const SALES_REPORTS_STALE_TIME = 60_000;

export const salesReportKeys = {
  all: ['salesReports'] as const,
  report: (name: string, params: QueryParams) =>
    ['salesReports', name, cleanParams(params)] as const,
};

/** getRevenueReport: GET /sales/reports/revenue/ */
export function revenueReportQueryOptions(params: RevenueReportParams) {
  return queryOptions({
    queryKey: salesReportKeys.report('revenue', params),
    queryFn: ({ signal }) => apiFetch<RevenueReport>('/sales/reports/revenue/', { params, signal }),
    staleTime: SALES_REPORTS_STALE_TIME,
  });
}

/** getInflowDetail: GET /sales/reports/inflow-detail/?month=YYYY-MM */
export function inflowDetailQueryOptions(month: string) {
  return queryOptions({
    queryKey: salesReportKeys.report('inflow-detail', { month }),
    queryFn: ({ signal }) =>
      apiFetch<InflowDetailRow[] | unknown>('/sales/reports/inflow-detail/', {
        params: { month },
        signal,
      }),
    staleTime: SALES_REPORTS_STALE_TIME,
    enabled: Boolean(month),
  });
}
