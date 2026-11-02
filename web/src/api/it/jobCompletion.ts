import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';

// Port of getJobCompletionTree / forceCompleteJobOrders (apis/projects/jobOrders.js)
// for it/job-completion.

/** A row of GET /projects/job-orders/completion-tree/ (flat; `parent` is a job_no). */
export interface CompletionNode {
  job_no: string;
  parent?: string | null;
  title?: string | null;
  customer_name?: string | null;
  status?: string | null;
  status_display?: string | null;
  completion_percentage?: number | string | null;
  task_count?: number | null;
  open_task_count?: number | null;
  [key: string]: unknown;
}

/** POST /projects/job-orders/force-complete/: what was completed, skipped and overridden. */
export interface ForceCompleteSummary {
  completed_job_orders?: string[];
  tasks_completed?: number;
  tasks_by_department?: Record<string, number>;
  already_completed?: string[];
  skipped?: { job_no: string; [key: string]: unknown }[];
  missing?: string[];
  overridden?: {
    qc_missing_approval?: number;
    erp_entry_unconfirmed?: number;
    open_ncr_job_orders?: string[];
  };
}

export const jobCompletionKeys = {
  tree: ['jobOrders', 'completionTree'] as const,
};

export function jobCompletionTreeQueryOptions() {
  return queryOptions({
    queryKey: jobCompletionKeys.tree,
    queryFn: async ({ signal }) => {
      const rows = await apiFetch<unknown>('/projects/job-orders/completion-tree/', { signal });
      return Array.isArray(rows) ? (rows as CompletionNode[]) : [];
    },
  });
}

/** The page sends every ticked job itself, so include_descendants is false. */
export function useForceCompleteJobOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobNos: string[]) =>
      apiFetch<ForceCompleteSummary | null>('/projects/job-orders/force-complete/', {
        method: 'POST',
        body: { job_nos: jobNos, include_descendants: false },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobCompletionKeys.tree }),
  });
}
