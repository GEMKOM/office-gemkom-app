import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';
import { planningItemKeys } from '../planning/planningItems';

// Port of apis/warehouse/pullRequests.js (warehouse material pull requests).
// mark_transferred is left out: only the saha warehouse screen calls it.

export type PullRequestStatus = 'pending' | 'transferred' | 'cancelled';
export type PullRequestDestinationType = 'subcontractor' | 'team';

export interface MaterialPullRequestItem {
  id?: number;
  planning_item?: number;
  item_code?: string;
  item_name?: string;
  job_no?: string;
  quantity?: string | number | null;
  item_unit?: string;
  /** Quantity of the planning item line itself (for the partial-delivery badge). */
  planning_quantity?: string | number | null;
  is_delivered?: boolean | null;
  delivered_quantity?: string | number | null;
  pulled_quantity?: string | number | null;
  quantity_available_to_pull?: string | number | null;
  [key: string]: unknown;
}

export interface MaterialPullRequest {
  id: number;
  number: string;
  status: PullRequestStatus | string;
  status_label?: string;
  destination_type?: PullRequestDestinationType | string;
  destination_name?: string;
  item_count?: number;
  job_nos?: string[];
  note?: string;
  requested_by?: number | null;
  requested_by_name?: string;
  requested_by_username?: string;
  requested_at?: string | null;
  confirmed_by?: number | null;
  confirmed_by_name?: string;
  confirmed_by_username?: string;
  confirmed_at?: string | null;
  cancelled_by?: number | null;
  cancelled_by_name?: string;
  cancelled_at?: string | null;
  /** Only on the detail endpoint. */
  items?: MaterialPullRequestItem[];
  [key: string]: unknown;
}

export type MaterialPullRequestsParams = {
  status?: string;
  destination_type?: string;
  subcontractor?: number;
  team?: number;
  requested_by?: number;
  job_no?: string;
  search?: string;
  requested_after?: string;
  requested_before?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export interface MaterialPullRequestInput {
  subcontractor?: number;
  team?: number;
  note: string;
  items: { planning_item: number; quantity: number }[];
}

export const pullRequestKeys = {
  all: ['materialTracking', 'pullRequests'] as const,
  list: (params: MaterialPullRequestsParams = {}) =>
    ['materialTracking', 'pullRequests', 'list', params] as const,
  detail: (id: number | string) =>
    ['materialTracking', 'pullRequests', 'detail', String(id)] as const,
};

/** Legacy getMaterialPullRequests. */
export function fetchMaterialPullRequests(
  params: MaterialPullRequestsParams = {},
  signal?: AbortSignal,
) {
  return apiFetch<unknown>('/warehouse/pull-requests/', { params, signal }).then((data) =>
    toPaginated<MaterialPullRequest>(data),
  );
}

export function materialPullRequestsQueryOptions(params: MaterialPullRequestsParams = {}) {
  return queryOptions({
    queryKey: pullRequestKeys.list(params),
    queryFn: ({ signal }) => fetchMaterialPullRequests(params, signal),
  });
}

/** Legacy getMaterialPullRequest (includes items). */
export function fetchMaterialPullRequest(id: number | string, signal?: AbortSignal) {
  return apiFetch<MaterialPullRequest>(`/warehouse/pull-requests/${id}/`, { signal });
}

export function materialPullRequestQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: pullRequestKeys.detail(id),
    queryFn: ({ signal }) => fetchMaterialPullRequest(id, signal),
  });
}

/** Legacy createMaterialPullRequest: exactly one of subcontractor / team. */
export function createMaterialPullRequest(
  data: MaterialPullRequestInput,
): Promise<MaterialPullRequest> {
  return apiFetch<MaterialPullRequest>('/warehouse/pull-requests/', { method: 'POST', body: data });
}

/** Legacy cancelMaterialPullRequest (requester or staff, pending only). */
export function cancelMaterialPullRequest(id: number | string): Promise<MaterialPullRequest> {
  return apiFetch<MaterialPullRequest>(`/warehouse/pull-requests/${id}/cancel/`, {
    method: 'POST',
  });
}

// A pull request changes the planning item ledger (pulled / available) too.
function useInvalidatePullRequests() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: pullRequestKeys.all }),
      queryClient.invalidateQueries({ queryKey: planningItemKeys.all }),
    ]);
}

export function useCreateMaterialPullRequest() {
  const invalidate = useInvalidatePullRequests();
  return useMutation({ mutationFn: createMaterialPullRequest, onSuccess: invalidate });
}

export function useCancelMaterialPullRequest() {
  const invalidate = useInvalidatePullRequests();
  return useMutation({
    mutationFn: (id: number | string) => cancelMaterialPullRequest(id),
    onSuccess: invalidate,
  });
}
