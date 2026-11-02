import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Procurement (material cost) lines from apis/projects/cost.js, for
// planning/procurement-lines: the job orders still waiting for lines, the ones
// that have some, the lines of one job order (saved or previewed), the
// replace-all submit and the cost_not_applicable flag.

export type Decimal = string | number;

export interface ProcurementJobOrder {
  job_no: string;
  title?: string | null;
  customer_name?: string | null;
  status?: string | null;
  target_completion_date?: string | null;
  /** On has_procurement rows. */
  cost_not_applicable?: boolean | null;
}

export interface ProcurementJobOrdersParams {
  status?: string;
  search?: string;
  /** has_procurement only: 'true' / 'false'. */
  cost_not_applicable?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

/** price_source values of saved and preview lines. */
export type PriceSource =
  'po_line' | 'recommended_offer' | 'any_offer' | 'historical_po' | 'none' | (string & {});

/** One saved line (GET /projects/procurement-lines/?job_order=). */
export interface ProcurementLine {
  id?: number;
  item?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  item_description?: string | null;
  quantity?: Decimal | null;
  unit_price?: Decimal | null;
  amount_eur?: Decimal | null;
  planning_request_item?: number | null;
  order?: number | null;
  price_source?: PriceSource | null;
  price_date?: string | null;
}

/** One preview line (pre-filled from planning and purchase history, not saved). */
export interface ProcurementLinePreview {
  item?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  item_description?: string | null;
  quantity?: Decimal | null;
  unit_price_eur?: Decimal | null;
  planning_request_item?: number | null;
  order?: number | null;
  price_source?: PriceSource | null;
  price_date?: string | null;
}

/** One line as submit/ takes it: item or item_description is required. */
export interface ProcurementLineInput {
  item?: number;
  item_description?: string;
  quantity: string;
  unit_price: string;
  planning_request_item?: number;
  order: number;
}

export const procurementLineKeys = {
  all: ['procurementLines'] as const,
  pending: (params: ProcurementJobOrdersParams) =>
    ['procurementLines', 'pending', cleanParams({ ...params })] as const,
  hasProcurement: (params: ProcurementJobOrdersParams) =>
    ['procurementLines', 'hasProcurement', cleanParams({ ...params })] as const,
};

const STALE_TIME = 30_000;

/** Job orders waiting for procurement lines (getProcurementPendingJobOrders). */
export function procurementPendingQueryOptions(params: ProcurementJobOrdersParams) {
  return queryOptions({
    queryKey: procurementLineKeys.pending(params),
    queryFn: async ({ signal }) =>
      toPaginated<ProcurementJobOrder>(
        await apiFetch<unknown>('/projects/job-orders/procurement_pending/', {
          params: { ...params },
          signal,
        }),
      ),
    staleTime: STALE_TIME,
  });
}

/** Job orders with at least one procurement line (getJobOrdersHasProcurement). */
export function jobOrdersHasProcurementQueryOptions(params: ProcurementJobOrdersParams) {
  return queryOptions({
    queryKey: procurementLineKeys.hasProcurement(params),
    queryFn: async ({ signal }) =>
      toPaginated<ProcurementJobOrder>(
        await apiFetch<unknown>('/projects/job-orders/has_procurement/', {
          params: { ...params },
          signal,
        }),
      ),
    staleTime: STALE_TIME,
  });
}

/** Saved lines of a job order (getProcurementLines). Fetched imperatively by the editor. */
export async function fetchProcurementLines(jobNo: string): Promise<ProcurementLine[]> {
  return extractResults<ProcurementLine>(
    await apiFetch<unknown>('/projects/procurement-lines/', { params: { job_order: jobNo } }),
  );
}

/** Preview lines of a job order (getProcurementLinesPreview). */
export async function fetchProcurementLinesPreview(
  jobNo: string,
): Promise<ProcurementLinePreview[]> {
  return extractResults<ProcurementLinePreview>(
    await apiFetch<unknown>('/projects/procurement-lines/preview/', {
      params: { job_order: jobNo },
    }),
  );
}

/** Replaces every procurement line of the job order (submitProcurementLines); [] clears them. */
export function useSubmitProcurementLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNo, lines }: { jobNo: string; lines: ProcurementLineInput[] }) =>
      apiFetch<unknown>('/projects/procurement-lines/submit/', {
        method: 'POST',
        body: { job_order: jobNo, lines },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: procurementLineKeys.all }),
  });
}

/** PATCH cost_summary with cost_not_applicable (patchJobCostSummary). */
export function useSetCostNotApplicable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNo, value }: { jobNo: string; value: boolean }) =>
      apiFetch<unknown>(`/projects/job-orders/${encodeURIComponent(jobNo)}/cost_summary/`, {
        method: 'PATCH',
        body: { cost_not_applicable: value },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: procurementLineKeys.all }),
  });
}
