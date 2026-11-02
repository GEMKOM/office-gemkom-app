import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Shipping cost lines from apis/projects/cost.js, for logistics/cost-lines.

export interface ShippingJobOrder {
  job_no: string;
  title?: string | null;
  customer_name?: string | null;
  status?: string | null;
  target_completion_date?: string | null;
  /** Only on has_shipping rows. */
  shipping_total_eur?: string | number | null;
}

export interface ShippingJobOrdersParams {
  status?: string;
  search?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface ShippingCostLine {
  id?: number;
  description?: string | null;
  amount_eur?: string | number | null;
  date?: string | null;
  notes?: string | null;
}

export interface ShippingCostLineInput {
  description: string;
  amount_eur: string;
  date?: string;
  notes?: string;
}

export const SHIPPING_STALE_TIME = 30_000;

const shippingKeys = {
  all: ['shippingCosts'] as const,
  pending: (params: ShippingJobOrdersParams) =>
    ['shippingCosts', 'pending', cleanParams({ ...params })] as const,
  hasShipping: (params: ShippingJobOrdersParams) =>
    ['shippingCosts', 'hasShipping', cleanParams({ ...params })] as const,
  lines: (jobNo: string) => ['shippingCosts', 'lines', jobNo] as const,
};

function jobOrderListOptions(
  path: string,
  queryKey: readonly unknown[],
  params: ShippingJobOrdersParams,
) {
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) =>
      toPaginated<ShippingJobOrder>(
        await apiFetch<unknown>(path, { params: { ...params }, signal }),
      ),
    staleTime: SHIPPING_STALE_TIME,
  });
}

/** Job orders with no shipping cost line yet (getShippingPendingJobOrders). */
export function shippingPendingQueryOptions(params: ShippingJobOrdersParams) {
  return jobOrderListOptions(
    '/projects/job-orders/shipping_pending/',
    shippingKeys.pending(params),
    params,
  );
}

/** Job orders with at least one shipping cost line (getJobOrdersHasShipping). */
export function jobOrdersHasShippingQueryOptions(params: ShippingJobOrdersParams) {
  return jobOrderListOptions(
    '/projects/job-orders/has_shipping/',
    shippingKeys.hasShipping(params),
    params,
  );
}

/** A job order's shipping cost lines (getShippingCostLines). */
export function shippingCostLinesQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: shippingKeys.lines(jobNo),
    queryFn: async ({ signal }) =>
      extractResults<ShippingCostLine>(
        await apiFetch<unknown>('/projects/shipping-cost-lines/', {
          params: { job_order: jobNo },
          signal,
        }),
      ),
    // The modal edits these; always start from the server.
    staleTime: 0,
    gcTime: 0,
  });
}

/** Replaces every shipping cost line of a job order (submitShippingCostLines). */
export function useSubmitShippingCostLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNo, lines }: { jobNo: string; lines: ShippingCostLineInput[] }) =>
      apiFetch<unknown>('/projects/shipping-cost-lines/submit/', {
        method: 'POST',
        body: { job_order: jobNo, lines },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shippingKeys.all }),
  });
}
