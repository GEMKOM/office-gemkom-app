import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { toPaginated } from '../types';

// Stock cards (procurement items): the item part of apis/procurement.js, as
// the planning/inventory/cards page uses it.

/** Port of apis/constants.js UNIT_CHOICES (matches the backend). */
export const UNIT_CHOICES = [
  { value: 'adet', label: 'Adet' },
  { value: 'kg', label: 'KG' },
  { value: 'metre', label: 'Metre' },
  { value: 'litre', label: 'Litre' },
  { value: 'paket', label: 'Paket' },
  { value: 'kutu', label: 'Kutu' },
] as const;

export const ITEM_TYPE_CHOICES = [
  { value: 'stock', label: 'Stok' },
  { value: 'expenditure', label: 'Masraf' },
  { value: 'subcontracting', label: 'Alt Yüklenici' },
] as const;

export type LatestUnitPriceSource = 'po_line' | 'recommended_offer' | 'any_offer' | 'historical_po';

export interface Item {
  id: number;
  code: string;
  name: string;
  unit?: string | null;
  unit_label?: string | null;
  item_type?: string | null;
  item_type_label?: string | null;
  stock_quantity?: number | string | null;
  latest_unit_price_eur?: number | string | null;
  latest_unit_price_source?: LatestUnitPriceSource | string | null;
}

/** What the legacy edit modal sends: every field as the form held it (strings). */
export interface ItemInput {
  code: string;
  name: string;
  unit: string;
  item_type: string;
  stock_quantity: string;
}

/** getItems params as legacy loadItems built them. */
export interface ItemsParams {
  page?: number;
  page_size?: number;
  code?: string;
  code__exact?: string;
  code__startswith?: string;
  name?: string;
  name__startswith?: string;
  item_type?: string;
  ordering?: string;
}

/** A row of /procurement/items/{id}/purchase-requests/ and /planning-requests/. */
export interface ItemRequest {
  id?: number;
  request_number?: string | null;
  title?: string | null;
  status?: string | null;
  status_label?: string | null;
  priority?: string | null;
  requestor?: string | null;
  created_at?: string | null;
  needed_date?: string | null;
  total_amount_eur?: number | string | null;
  item_details?: { quantity?: number | string | null; job_no?: string | null } | null;
}

export type ItemRequestsKind = 'purchase' | 'planning';

const BASE = '/procurement/items/';
const detailPath = (id: string | number) => `${BASE}${id}/`;

export const itemKeys = {
  all: ['procurementItems'] as const,
  list: (params: ItemsParams) => ['procurementItems', 'list', params] as const,
  requests: (id: string | number, kind: ItemRequestsKind) =>
    ['procurementItems', `${kind}Requests` as const, String(id)] as const,
};

/**
 * The message the legacy api functions threw: the body's `error`, else their
 * fixed fallback. Errors that never reached the server keep their own message.
 */
export function itemErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const data = error.data as { error?: unknown } | undefined;
    return data && typeof data === 'object' && typeof data.error === 'string' && data.error
      ? data.error
      : fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Port of getItems: GET /procurement/items/ with the filters, empty ones left out. */
export function getItems(params: ItemsParams = {}, signal?: AbortSignal) {
  return apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
    toPaginated<Item>(data),
  );
}

export function itemsQueryOptions(params: ItemsParams) {
  return queryOptions({
    queryKey: itemKeys.list(params),
    queryFn: ({ signal }) => getItems(params, signal),
  });
}

/** Port of updateItem: a full PUT. */
export function updateItem(id: string | number, data: ItemInput): Promise<Item> {
  return apiFetch<Item>(detailPath(id), { method: 'PUT', body: data });
}

export function deleteItem(id: string | number): Promise<void> {
  return apiFetch<void>(detailPath(id), { method: 'DELETE' });
}

export async function getItemPurchaseRequests(
  id: string | number,
  signal?: AbortSignal,
): Promise<ItemRequest[]> {
  const data = await apiFetch<ItemRequest[] | null>(`${detailPath(id)}purchase-requests/`, {
    signal,
  });
  return Array.isArray(data) ? data : [];
}

export async function getItemPlanningRequests(
  id: string | number,
  signal?: AbortSignal,
): Promise<ItemRequest[]> {
  const data = await apiFetch<ItemRequest[] | null>(`${detailPath(id)}planning-requests/`, {
    signal,
  });
  return Array.isArray(data) ? data : [];
}

/** The modal's requests of one kind: purchase or planning. */
export function itemRequestsQueryOptions(id: string | number, kind: ItemRequestsKind) {
  return queryOptions({
    queryKey: itemKeys.requests(id, kind),
    queryFn: ({ signal }) =>
      kind === 'purchase'
        ? getItemPurchaseRequests(id, signal)
        : getItemPlanningRequests(id, signal),
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: ItemInput }) => updateItem(id, data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: itemKeys.all }),
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteItem(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: itemKeys.all }),
  });
}
