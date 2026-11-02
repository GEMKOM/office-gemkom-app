import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults, toPaginated } from '../types';

// QC cost lines from apis/projects/cost.js: the job orders still waiting for
// a QC cost entry, the ones that have some, and the lines of one job order.

export interface CostJobOrder {
  job_no: string;
  title?: string;
  customer_name?: string;
  status?: string;
  target_completion_date?: string | null;
  qc_total_eur?: string | number | null;
}

export interface CostJobOrdersParams {
  status?: string;
  search?: string;
  customer?: string | number;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface QcCostLine {
  id?: number;
  description?: string;
  amount_eur?: string | number | null;
  date?: string | null;
  notes?: string | null;
  created_by_name?: string;
}

/** One line as submit/ sends it; empty date and notes are left out. */
export interface QcCostLineInput {
  description: string;
  amount_eur: string;
  date?: string;
  notes?: string;
}

export const qcCostKeys = {
  all: ['qcCostLines'] as const,
  pending: (params: CostJobOrdersParams) =>
    ['qcCostLines', 'pending', cleanParams({ ...params })] as const,
  hasQc: (params: CostJobOrdersParams) =>
    ['qcCostLines', 'hasQc', cleanParams({ ...params })] as const,
  lines: (jobNo: string) => ['qcCostLines', 'lines', jobNo] as const,
};

const COST_STALE_TIME = 30_000;

/** Job orders with no QC cost line yet, cancelled ones excluded (getQcPendingJobOrders). */
export function qcPendingJobOrdersQueryOptions(params: CostJobOrdersParams) {
  return queryOptions({
    queryKey: qcCostKeys.pending(params),
    queryFn: async ({ signal }) =>
      toPaginated<CostJobOrder>(
        await apiFetch<unknown>('/projects/job-orders/qc_pending/', {
          params: { ...params },
          signal,
        }),
      ),
    staleTime: COST_STALE_TIME,
  });
}

/** Job orders with at least one QC cost line (getJobOrdersHasQc). */
export function jobOrdersHasQcQueryOptions(params: CostJobOrdersParams) {
  return queryOptions({
    queryKey: qcCostKeys.hasQc(params),
    queryFn: async ({ signal }) =>
      toPaginated<CostJobOrder>(
        await apiFetch<unknown>('/projects/job-orders/has_qc/', { params: { ...params }, signal }),
      ),
    staleTime: COST_STALE_TIME,
  });
}

/** The QC cost lines of one job order (getQcCostLines); always fresh. */
export function qcCostLinesQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: qcCostKeys.lines(jobNo),
    queryFn: async ({ signal }) =>
      extractResults<QcCostLine>(
        await apiFetch<unknown>('/projects/qc-cost-lines/', {
          params: { job_order: jobNo },
          signal,
        }),
      ),
    staleTime: 0,
    gcTime: 0,
  });
}

/** Replaces every QC cost line of the job order (submitQcCostLines); [] clears them. */
export function useSubmitQcCostLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNo, lines }: { jobNo: string; lines: QcCostLineInput[] }) =>
      apiFetch<unknown>('/projects/qc-cost-lines/submit/', {
        method: 'POST',
        body: { job_order: jobNo, lines },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qcCostKeys.all }),
  });
}
