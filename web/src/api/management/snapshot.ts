import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

/**
 * GET /reports/snapshot/: a handful of company-wide counts, computed on each
 * request with plain count() queries (reports/views.py snapshot). Open to
 * every signed-in user; the management hub reads it.
 */
export interface CompanySnapshot {
  job_orders?: {
    /** Top-level jobs in status active. */
    active?: number;
    /** Active top-level jobs whose target date has passed. */
    overdue?: number;
    on_hold_for_revision?: number;
  };
  /** Requests in status submitted, whoever approves them. */
  approvals_pending?: {
    overtime_requests?: number;
    purchase_requests?: number;
    subcontractor_statements?: number;
  };
  alerts?: {
    tasks_blocked?: number;
    /** Critical NCRs not closed. */
    ncrs_critical_open?: number;
    /** Unpaid payment instalments past their due date. */
    payments_overdue?: number;
  };
}

export function companySnapshotQueryOptions() {
  return queryOptions({
    queryKey: ['reports', 'snapshot'] as const,
    queryFn: ({ signal }) => apiFetch<CompanySnapshot>('/reports/snapshot/', { signal }),
    staleTime: 60_000,
  });
}
