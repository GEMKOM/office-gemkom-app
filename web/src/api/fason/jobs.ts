import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';

/**
 * Fason jobs (backend fason app): a workshop department request with
 * workshop-route F cards (büküm, işleme, galvaniz…). Purchasing goes the usual
 * way (department approval → planning → purchase request → PO); once the
 * request is approved the material goes manufacturing → warehouse (one step:
 * taken in, ready to send) → supplier (sent by the warehouse or procurement)
 * → back in Mal Kabul → pulled. The requester follows it on Fason Talepleri,
 * the warehouse on Fason Sevkiyatı, procurement on Fason Takibi.
 */

export type FasonPurchaseStep =
  | 'request'
  | 'approved'
  | 'planning'
  | 'purchase_request'
  | 'pr_approved'
  | 'ordered'
  | 'cancelled';

export type FasonMaterialStep =
  'waiting' | 'handed_over' | 'received' | 'sent' | 'returned' | 'pulled';

export type FasonTab =
  'open' | 'warehouse' | 'to_receive' | 'to_send' | 'at_supplier' | 'done' | 'all';

export interface FasonJob {
  id: number;
  department_request: {
    id: number;
    number: string;
    title: string;
    status: string;
    status_label: string;
    priority: string;
    department: string;
    requestor: string | null;
    created_at: string | null;
    needed_date: string | null;
  };
  operations: string[];
  job_nos: string[];
  purchase_step: FasonPurchaseStep;
  purchase_label: string;
  material_step: FasonMaterialStep;
  material_label: string;
  suppliers: string[];
  material_note: string;
  discussion_topic_id: number | null;
  /** Waiting for department approval: no material step yet. */
  awaiting_approval: boolean;
  can_hand_over: boolean;
  /** The warehouse's one step (taken in = ready to send). */
  can_receive: boolean;
  /** The warehouse or procurement marks it sent. */
  can_send: boolean;
  created_at: string | null;
}

export interface FasonStepMark {
  at: string | null;
  by: string | null;
}

export interface FasonJobDetail extends FasonJob {
  rows: {
    item_code: string;
    item_name: string;
    quantity: number | string | null;
    unit: string;
    job_no: string;
    description: string;
  }[];
  lines: {
    id: number;
    planning_request: string;
    item_code: string;
    item_name: string;
    description: string;
    job_no: string;
    quantity: string;
    delivered_quantity: string | null;
    pulled_quantity: string;
    purchase_step: FasonPurchaseStep;
    purchase_label: string;
    orders: { id: number; supplier: string }[];
  }[];
  unsent_orders: { id: number; supplier: string; lines: number }[];
  shipments: {
    id: number;
    supplier: string;
    purchase_order: number | null;
    irsaliye_no: string;
    note: string;
    sent_at: string | null;
    sent_by: string | null;
  }[];
  steps: { handed_over: FasonStepMark; received: FasonStepMark };
}

export const fasonKeys = {
  all: ['fason'] as const,
  list: (params: { tab: FasonTab; search?: string }) => ['fason', 'list', params] as const,
  detail: (id: number) => ['fason', 'detail', id] as const,
};

export function fasonJobsQueryOptions(params: { tab: FasonTab; search?: string }) {
  return queryOptions({
    queryKey: fasonKeys.list(params),
    queryFn: ({ signal }) =>
      apiFetch<{ count: number; results: FasonJob[] }>('/fason/jobs/', {
        params: cleanParams(params),
        signal,
      }),
  });
}

export function fasonJobQueryOptions(id: number) {
  return queryOptions({
    queryKey: fasonKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<FasonJobDetail>(`/fason/jobs/${id}/`, { signal }),
    enabled: id > 0,
  });
}

export type FasonAction =
  | { action: 'hand_over'; note?: string }
  | { action: 'receive' }
  | { action: 'send'; purchase_order: number; irsaliye_no?: string; note?: string };

/** One material step of a job; the job comes back with its new state. */
export function useFasonAction(jobId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ...body }: FasonAction) =>
      apiFetch<FasonJobDetail>(`/fason/jobs/${jobId}/${action}/`, { method: 'POST', body }),
    onSuccess: (job) => {
      queryClient.setQueryData(fasonKeys.detail(jobId), job);
      void queryClient.invalidateQueries({ queryKey: ['fason', 'list'] });
    },
  });
}
