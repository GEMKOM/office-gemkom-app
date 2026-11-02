import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  apiFetch,
  cleanParams,
  isApiError,
  type ApiFetchOptions,
  type QueryParams,
} from '../client';
import { toPaginated, type Paginated } from '../types';

// Port of the parts of apis/planning/planningRequestItems.js that the
// Planlama Kalemleri and Kritik Malzemeler pages use: the GET /planning/items/
// list and the mark/unmark consumed actions.

export type Decimal = string | number;

/** One planning request item line as GET /planning/items/ returns it. */
export interface PlanningItem {
  id: number;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  item_type?: string | null;
  planning_request?: number | null;
  planning_request_number?: string | null;
  job_no?: string | null;
  quantity?: Decimal | null;
  quantity_from_inventory?: Decimal | null;
  quantity_to_purchase?: Decimal | null;
  /** Only with include_price=true. */
  latest_unit_price_eur?: Decimal | null;
  latest_unit_price_source?: string | null;
  is_delivered?: boolean | null;
  delivered_quantity?: Decimal | null;
  is_consumed?: boolean | null;
  consumed_by_username?: string | null;
  cnc_cuts_count?: number | null;
  purchase_request_number?: string | null;
  is_critical?: boolean | null;
  critical_marked_by_username?: string | null;
  critical_marked_at?: string | null;
}

/** Query params of GET /planning/items/; unset ones ('' / undefined) are left out. */
export type PlanningItemsParams = QueryParams & {
  search?: string;
  item_code?: string;
  item_name?: string;
  item_type?: string;
  planning_request?: string;
  planning_request_number?: string;
  planning_request_status?: string;
  job_no?: string;
  is_delivered?: string;
  partially_delivered?: string;
  is_plate?: string;
  is_consumed?: string;
  is_critical?: string;
  from_inventory?: string;
  is_available?: string;
  has_price?: string;
  include_price?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const planningItemKeys = {
  all: ['planningItems'] as const,
  list: (params: PlanningItemsParams = {}) =>
    ['planningItems', 'list', cleanParams(params)] as const,
};

const BASE = '/planning/items/';

/**
 * The legacy functions threw `detail || error || <fixed Turkish message>`;
 * keep those messages instead of apiFetch's generic field / HTTP fallbacks.
 */
async function legacyFetch<T>(
  path: string,
  options: ApiFetchOptions,
  fallback: string,
): Promise<T> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (!isApiError(error)) throw error;
    const data = (error.data && typeof error.data === 'object' ? error.data : {}) as Record<
      string,
      unknown
    >;
    const pick = (value: unknown) => (typeof value === 'string' && value ? value : '');
    throw new ApiError(error.status, error.data, pick(data.detail) || pick(data.error) || fallback);
  }
}

/** getPlanningItems (alias of getPlanningRequestItems): GET /planning/items/. */
export async function getPlanningItems(
  params: PlanningItemsParams = {},
  signal?: AbortSignal,
): Promise<Paginated<PlanningItem>> {
  const data = await legacyFetch<unknown>(
    BASE,
    { params, signal },
    'Planlama talebi kalemleri yüklenirken hata oluştu',
  );
  return toPaginated<PlanningItem>(data);
}

export function planningItemsQueryOptions(params: PlanningItemsParams = {}) {
  return queryOptions({
    queryKey: planningItemKeys.list(params),
    queryFn: ({ signal }) => getPlanningItems(params, signal),
  });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** POST /planning/items/{id}/mark_consumed/ */
export function markPlanningItemConsumed(itemId: string | number): Promise<PlanningItem> {
  return legacyFetch<PlanningItem>(
    `${BASE}${itemId}/mark_consumed/`,
    { method: 'POST', headers: JSON_HEADERS },
    'Kalem kullanıldı olarak işaretlenirken hata oluştu',
  );
}

/** POST /planning/items/{id}/unmark_consumed/ */
export function unmarkPlanningItemConsumed(itemId: string | number): Promise<PlanningItem> {
  return legacyFetch<PlanningItem>(
    `${BASE}${itemId}/unmark_consumed/`,
    { method: 'POST', headers: JSON_HEADERS },
    'Kullanıldı işareti kaldırılırken hata oluştu',
  );
}

/** Marks (consumed: true) or unmarks an item, then reloads every planning item list. */
export function useSetPlanningItemConsumed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, consumed }: { id: string | number; consumed: boolean }) =>
      consumed ? markPlanningItemConsumed(id) : unmarkPlanningItemConsumed(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planningItemKeys.all });
    },
  });
}

export interface DeliveryReceiptResult {
  is_delivered?: boolean;
  delivered_quantity?: Decimal | null;
  quantity?: Decimal | null;
  [key: string]: unknown;
}

/**
 * Port of markPlanningRequestItemDelivered: each call appends a receipt
 * (quantity as a string; everything outstanding when omitted).
 */
export function markPlanningRequestItemDelivered(
  itemId: number,
  receipt: { quantity?: number; note?: string } = {},
) {
  const body: Record<string, string> = {};
  if (receipt.quantity !== undefined && receipt.quantity !== null)
    body.quantity = String(receipt.quantity);
  if (receipt.note) body.note = receipt.note;
  return apiFetch<DeliveryReceiptResult>(`/planning/items/${itemId}/mark_delivered/`, {
    method: 'POST',
    body,
  });
}
