import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults } from '../types';

// Port of apis/machining/costAnalysis.js.

export interface CostBreakdown {
  weekday_work?: number;
  after_hours?: number;
  sunday?: number;
}

export interface JobCostRow {
  job_no: string;
  hours: CostBreakdown;
  costs: CostBreakdown;
  total_cost?: number;
  currency?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface JobCostIssue {
  key: string;
  status?: string;
}

export interface JobCostUserRow {
  user: string;
  user_id?: number;
  issue_count?: number;
  issues?: JobCostIssue[];
  hours: CostBreakdown;
  costs: CostBreakdown;
  total_cost?: number;
  currency?: string;
  [key: string]: unknown;
}

/** fetchJobCostReport: every job, or the ones matching `job_no`. Legacy sends no paging. */
export function jobCostReportQueryOptions(params: { job_no?: string }) {
  return queryOptions({
    queryKey: ['jobCosts', 'list', cleanParams(params)] as const,
    queryFn: async ({ signal }) =>
      extractResults<JobCostRow>(
        await apiFetch<unknown>('/machining/reports/job-costs/', { params, signal }),
      ),
  });
}

/** fetchJobCostDetailsReportByJobNo: per-user hours and costs of one job. */
export function jobCostDetailsQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: ['jobCosts', 'detail', jobNo] as const,
    // Legacy path has no trailing slash.
    queryFn: async ({ signal }) =>
      extractResults<JobCostUserRow>(
        await apiFetch<unknown>(`/machining/reports/job-costs/${encodeURIComponent(jobNo)}`, {
          signal,
        }),
      ),
  });
}
