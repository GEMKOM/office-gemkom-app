import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults } from '../types';

// getProjectsReport from apis/procurement/reports.js, for the finance
// projects report (finance/reports/projects).

export interface ProjectReportSupplier {
  name: string;
  total_eur?: string | number | null;
}

export interface ProjectReportRow {
  job_no: string;
  distinct_items?: number | null;
  ordered_qty_by_unit?: Record<string, string | number> | null;
  total_pos?: number | null;
  active_pos?: number | null;
  committed_net_eur?: string | number | null;
  unpaid_eur?: string | number | null;
  pending_pr_estimate_eur?: string | number | null;
  forecast_eur?: string | number | null;
  top_suppliers_by_spend?: ProjectReportSupplier[] | null;
  last_activity_at?: string | null;
}

export interface ProjectsReportParams {
  job_no?: string;
  job_prefix?: string;
  created_gte?: string;
  created_lte?: string;
  include_empty?: string;
  ordering?: string;
}

export const PROJECTS_REPORT_STALE_TIME = 30_000;

/** GET /procurement/reports/projects (no trailing slash, as legacy). Unpaginated. */
export function projectsReportQueryOptions(params: ProjectsReportParams) {
  return queryOptions({
    queryKey: ['procurementReports', 'projects', cleanParams({ ...params })] as const,
    queryFn: async ({ signal }) =>
      extractResults<ProjectReportRow>(
        await apiFetch<unknown>('/procurement/reports/projects', { params: { ...params }, signal }),
      ),
    staleTime: PROJECTS_REPORT_STALE_TIME,
  });
}
