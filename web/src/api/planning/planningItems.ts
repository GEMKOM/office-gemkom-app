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

// GET /planning/items/ and its actions, for Planlama Kalemleri, Kritik
// Malzemeler and Malzeme Takibi: the list, consumed / critical / delivered.

export type Decimal = string | number;

/** One pull request a planning item line sits on (Malzeme Takibi's Depo Çekme chips). */
export interface PlanningItemPull {
  id: number;
  number: string;
  status: string;
  status_label?: string;
  destination_name?: string;
  quantity?: Decimal | null;
  item_unit?: string;
  [key: string]: unknown;
}

/** Where a line stands in purchasing (only with include_procurement=true). */
export interface PlanningItemProcurement {
  /** Latest active purchase request, and how many the line is on. */
  pr_number: string | null;
  pr_status: string | null;
  pr_status_label: string | null;
  pr_count: number;
  /** Latest non-cancelled order line: its PO, supplier and terms. */
  po_id: number | null;
  po_supplier_name: string | null;
  /** YYYY-MM-DD: the order's ordered_at, else its created_at. */
  po_ordered_at: string | null;
  po_delivery_days: number | null;
  /** YYYY-MM-DD: order date + delivery days. */
  po_expected_delivery: string | null;
  po_unit_price: Decimal | null;
  po_currency: string | null;
  po_count: number;
  /** The order lines' allocations to this line's job. */
  ordered_quantity: Decimal;
}

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
  pulled_quantity?: Decimal | null;
  quantity_available_to_pull?: Decimal | null;
  pull_requests?: PlanningItemPull[];
  /** The planning request's İhtiyaç tarihi (YYYY-MM-DD). */
  needed_date?: string | null;
  /** The planning request's priority: normal / urgent / critical. */
  request_priority?: string | null;
  request_priority_label?: string | null;
  /** Only with include_procurement=true. */
  procurement?: PlanningItemProcurement | null;
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
  pull_state?: string;
  include_price?: boolean;
  include_procurement?: boolean;
  has_po?: string;
  request_priority?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const planningItemKeys = {
  all: ['planningItems'] as const,
  lists: () => ['planningItems', 'list'] as const,
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

/** POST /planning/items/{id}/mark_critical/ (imalat bu kalem olmadan devam edemez). */
export function markPlanningRequestItemCritical(itemId: string | number): Promise<PlanningItem> {
  return legacyFetch<PlanningItem>(
    `${BASE}${itemId}/mark_critical/`,
    { method: 'POST', headers: JSON_HEADERS },
    'Kalem kritik olarak işaretlenirken hata oluştu',
  );
}

/** POST /planning/items/{id}/unmark_critical/ */
export function unmarkPlanningRequestItemCritical(itemId: string | number): Promise<PlanningItem> {
  return legacyFetch<PlanningItem>(
    `${BASE}${itemId}/unmark_critical/`,
    { method: 'POST', headers: JSON_HEADERS },
    'Kritik işareti kaldırılırken hata oluştu',
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

type CriticalVars = { id: number; critical: boolean };

function setCachedCritical(
  queryClient: ReturnType<typeof useQueryClient>,
  { id, critical }: CriticalVars,
) {
  queryClient.setQueriesData<Paginated<PlanningItem>>(
    { queryKey: planningItemKeys.lists() },
    (old) =>
      old
        ? {
            ...old,
            results: old.results.map((row) =>
              row.id === id ? { ...row, is_critical: critical } : row,
            ),
          }
        : old,
  );
}

/**
 * Flips the critical flag (Malzeme Takibi's checkbox). The cached rows change
 * at once and go back if the request fails; the list is not reloaded.
 */
export function useSetPlanningItemCritical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, critical }: CriticalVars) =>
      critical ? markPlanningRequestItemCritical(id) : unmarkPlanningRequestItemCritical(id),
    onMutate: (vars) => setCachedCritical(queryClient, vars),
    onError: (_error, vars) =>
      setCachedCritical(queryClient, { id: vars.id, critical: !vars.critical }),
  });
}
