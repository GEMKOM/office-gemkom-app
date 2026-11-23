import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';
import { planningItemKeys } from '../planning/planningItems';
import { pieceKeys } from '../warehouse/pieces';

// Port of apis/warehouse/pullRequests.js (warehouse material pull requests).
// mark_transferred is left out: only the saha warehouse screen calls it.

export type PullRequestStatus = 'pending' | 'transferred' | 'cancelled';
export type PullRequestDestinationType = 'subcontractor' | 'team';

/** A bar line's bars picked from the job's İş Emri piece stock. */
export interface MaterialPullPiece {
  id?: number;
  piece: number;
  quantity: number;
  width_mm?: string | null;
  length_mm?: string;
  heat_number?: string;
}

export interface MaterialPullRequestItem {
  id?: number;
  /** The planning line (older path); null on a line straight from the job's İş Emri stock. */
  planning_item?: number | null;
  /** The stock card handed over. */
  item?: number | null;
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
  /** A bar line: the bars picked from the job's İş Emri stock (what went out once handed over). */
  pieces?: MaterialPullPiece[];
  /** Brought back from production on İmalattan İade slips (counts back into Depoda Kalan). */
  returned_quantity?: string | number | null;
  /** Plate / bar lines: the size as one text ("1500×6000 mm × 2 adet · 1.413 kg"); '' otherwise. */
  size_summary?: string | null;
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
  /** One job exactly (job_no matches any job containing the text). */
  job?: string;
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
  /**
   * A line by quantity, or a bar line by the bars picked from the job's İş Emri piece stock
   * (its quantity then follows on the backend).
   */
  items: (
    | { planning_item: number; quantity: number }
    | { planning_item: number; pieces: { piece: number; quantity: number }[] }
    // Straight from the job's İş Emri stock: a card by quantity, a bar card by its lots.
    | { item: number; job_no: string; quantity: number }
    | { item: number; job_no: string; pieces: { piece: number; quantity: number }[] }
  )[];
}

/** A stock card in a job's İş Emri stock (GET /warehouse/pull-requests/job-stock/). */
export interface JobStockCard {
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  material_class: string | null;
  on_hand: string;
  /** Claimed by pending İmalata Çıkış Talepleri. */
  held: string;
  /** Still requestable: on hand less held (never below 0). */
  available: string;
}

export const pullRequestKeys = {
  all: ['materialTracking', 'pullRequests'] as const,
  list: (params: MaterialPullRequestsParams = {}) =>
    ['materialTracking', 'pullRequests', 'list', params] as const,
  detail: (id: number | string) =>
    ['materialTracking', 'pullRequests', 'detail', String(id)] as const,
  jobStock: (jobNo: string) => ['materialTracking', 'pullRequests', 'job-stock', jobNo] as const,
};

/** A job's İş Emri stock cards with what pending requests hold (bars and plates: pieces). */
export function jobStockQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: pullRequestKeys.jobStock(jobNo),
    queryFn: ({ signal }) =>
      apiFetch<JobStockCard[]>('/warehouse/pull-requests/job-stock/', {
        params: { job_no: jobNo },
        signal,
      }),
  });
}

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

/**
 * The warehouse hands the material out (İmalata Çıkış Talebi → Teslim Edildi): the stock
 * leaves İş Emri to production. Warehouse grant only (the backend checks).
 */
export function markPullRequestTransferred(id: number | string): Promise<MaterialPullRequest> {
  return apiFetch<MaterialPullRequest>(`/warehouse/pull-requests/${id}/mark_transferred/`, {
    method: 'POST',
  });
}

/** Legacy cancelMaterialPullRequest (requester or staff, pending only). */
export function cancelMaterialPullRequest(id: number | string): Promise<MaterialPullRequest> {
  return apiFetch<MaterialPullRequest>(`/warehouse/pull-requests/${id}/cancel/`, {
    method: 'POST',
  });
}

// A pull request changes the planning item ledger (pulled / available) and the
// bars it holds (pieces) too.
function useInvalidatePullRequests() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: pullRequestKeys.all }),
      queryClient.invalidateQueries({ queryKey: planningItemKeys.all }),
      queryClient.invalidateQueries({ queryKey: pieceKeys.all }),
    ]);
}

export function useCreateMaterialPullRequest() {
  const invalidate = useInvalidatePullRequests();
  return useMutation({ mutationFn: createMaterialPullRequest, onSuccess: invalidate });
}

export function useMarkPullRequestTransferred() {
  const invalidate = useInvalidatePullRequests();
  return useMutation({
    mutationFn: (id: number | string) => markPullRequestTransferred(id),
    onSuccess: invalidate,
  });
}

export function useCancelMaterialPullRequest() {
  const invalidate = useInvalidatePullRequests();
  return useMutation({
    mutationFn: (id: number | string) => cancelMaterialPullRequest(id),
    onSuccess: invalidate,
  });
}
