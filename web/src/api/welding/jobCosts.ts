import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// Port of getWeldingJobCostTotals / getWeldingJobCostDetail from
// apis/welding/reports.js (the user-work-hours report lives in userWorkHours.ts).

/** Hours or costs split by overtime type. */
export interface WeldingTypeSplit {
  regular?: number | string | null;
  after_hours?: number | string | null;
  holiday?: number | string | null;
}

/** One row of GET /welding/reports/job-costs/: a job_no with its totals. */
export interface WeldingJobCostTotal {
  job_no: string;
  hours: WeldingTypeSplit;
  costs: WeldingTypeSplit;
  total_cost?: number | string | null;
  currency?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type WeldingJobCostTotalsParams = {
  /** Partial match. */
  job_no?: string;
  ordering?: string;
  /** Work date range, YYYY-MM-DD. */
  date_after?: string;
  date_before?: string;
};

/** One time entry of GET /welding/reports/job-entries/. */
export interface WeldingJobEntry {
  id: number;
  date?: string;
  employee_id?: number;
  employee_username?: string;
  employee_full_name?: string;
  hours?: number | string | null;
  cost?: number | string | null;
  overtime_type?: string;
  issue_key?: string;
  [key: string]: unknown;
}

export interface WeldingJobCostDetail {
  job_no?: string;
  summary?: {
    total_entries?: number;
    total_hours?: number | string;
    breakdown_by_type?: WeldingTypeSplit;
    [key: string]: unknown;
  };
  entries?: WeldingJobEntry[];
  [key: string]: unknown;
}

export type WeldingJobCostDetailParams = {
  job_no: string;
  date_after?: string;
  date_before?: string;
  include_descendants?: boolean;
};

export const weldingJobCostKeys = {
  all: ['welding-job-costs'] as const,
  totals: (params: WeldingJobCostTotalsParams = {}) =>
    ['welding-job-costs', 'totals', params] as const,
  detail: (params: WeldingJobCostDetailParams) => ['welding-job-costs', 'detail', params] as const,
};

/** Legacy getWeldingJobCostTotals: GET /welding/reports/job-costs/ (every job in one response). */
export function fetchWeldingJobCostTotals(
  params: WeldingJobCostTotalsParams = {},
  signal?: AbortSignal,
) {
  return apiFetch<unknown>('/welding/reports/job-costs/', { params, signal }).then((data) =>
    toPaginated<WeldingJobCostTotal>(data),
  );
}

export function weldingJobCostTotalsQueryOptions(params: WeldingJobCostTotalsParams = {}) {
  return queryOptions({
    queryKey: weldingJobCostKeys.totals(params),
    queryFn: ({ signal }) => fetchWeldingJobCostTotals(params, signal),
  });
}

/** Legacy getWeldingJobCostDetail: GET /welding/reports/job-entries/?job_no=… */
export function fetchWeldingJobCostDetail(
  params: WeldingJobCostDetailParams,
  signal?: AbortSignal,
) {
  const { include_descendants, ...rest } = params;
  return apiFetch<WeldingJobCostDetail>('/welding/reports/job-entries/', {
    // Legacy sends include_descendants only when it is true.
    params: { ...rest, include_descendants: include_descendants ? 'true' : undefined },
    signal,
  });
}

export function weldingJobCostDetailQueryOptions(params: WeldingJobCostDetailParams) {
  return queryOptions({
    queryKey: weldingJobCostKeys.detail(params),
    queryFn: ({ signal }) => fetchWeldingJobCostDetail(params, signal),
  });
}
