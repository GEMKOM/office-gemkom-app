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
