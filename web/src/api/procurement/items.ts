import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { hasPerm, isSuperuser } from '@/auth/authService';
import { apiFetch, isApiError } from '../client';
import { extractResults, toPaginated } from '../types';

// Stock cards (procurement items): the item part of apis/procurement.js, as
// the planning/inventory/cards page uses it, plus the code families and the
// stock-code search the request forms pick cards with.

/** The backend Item.UNIT_CHOICES. */
export const UNIT_CHOICES = [
  { value: 'adet', label: 'Adet' },
  { value: 'kg', label: 'KG' },
  { value: 'metre', label: 'Metre' },
  { value: 'litre', label: 'Litre' },
  { value: 'paket', label: 'Paket' },
  { value: 'kutu', label: 'Kutu' },
  { value: 'set', label: 'Takım' },
  { value: 'm2', label: 'Metrekare' },
  { value: 'varil', label: 'Varil' },
] as const;

/** Opening, editing and deleting cards (backend manage_stock_cards; superusers always). */
export function canManageStockCards(): boolean {
  return isSuperuser() || hasPerm('manage_stock_cards');
}

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
  /** Code family (ItemCategory id) and its details. */
  category?: number | null;
  category_code?: string | null;
  category_name?: string | null;
  category_group?: string | null;
  material_class?: MaterialClass | string | null;
  /** Inactive cards stay on old lines; the search lists them after the active ones. */
  is_active?: boolean;
  min_stock?: number | string | null;
  /** The card's code in Mikro when it was re-coded on import. */
  mikro_code?: string | null;
  /** Stock ledger (item list only): stock_quantity is the Hammadde (free) balance. */
  job_area_quantity?: number | string | null;
  finished_quantity?: number | string | null;
}

export type MaterialClass =
  'normal' | 'plate' | 'boy' | 'service' | 'expense' | 'product' | 'review';

/** A code family: 0018 civata, 9999 K1 kaynak sarfı, 730 gider… */
export interface ItemCategory {
  id: number;
  code: string;
  name: string;
  group: string;
  default_unit: string;
  material_class: MaterialClass | string;
  material_class_label?: string;
  segment_notes?: string;
  is_active: boolean;
}

/** What the card form sends. */
export interface ItemInput {
  code: string;
  name: string;
  unit: string;
  item_type: string;
  category?: number | null;
  is_active?: boolean;
  min_stock?: string | null;
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
  search?: string;
  is_active?: 'true' | 'false';
  category?: string;
  material_class?: string;
  /** Exact codes, comma-separated. */
  code__in?: string;
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
  categories: ['procurementItems', 'categories'] as const,
  search: ['procurementItems', 'search'] as const,
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

export function createItem(data: ItemInput): Promise<Item> {
  return apiFetch<Item>(BASE, { method: 'POST', body: data });
}

/** All code families (a few hundred at most; the endpoint is not paginated). */
export function getItemCategories(signal?: AbortSignal): Promise<ItemCategory[]> {
  return apiFetch<unknown>('/procurement/item-categories/', { signal }).then((data) =>
    extractResults<ItemCategory>(data),
  );
}

export function itemCategoriesQueryOptions() {
  return queryOptions({
    queryKey: itemKeys.categories,
    queryFn: ({ signal }) => getItemCategories(signal),
    staleTime: 60 * 60 * 1000,
  });
}

// Cards the search has shown, by code: a picked option carries only its code
// and label, the row also needs the card's name and unit.
const seenCards = new Map<string, Item>();

/** A card the stock-code search returned earlier in this session. */
export function cardFromSearch(code: string): Item | undefined {
  return seenCards.get(code);
}

export function rememberCard(item: Item) {
  seenCards.set(item.code, item);
}

/** Search option label: code, name and unit, and "Pasif" for an inactive card. */
export function cardLabel(item: Pick<Item, 'code' | 'name' | 'unit' | 'is_active'>): string {
  const unit = item.unit ? ` • ${item.unit}` : '';
  return `${item.code} — ${item.name}${unit}${item.is_active === false ? ' (Pasif)' : ''}`;
}

/**
 * Stock-code search for request lines: by code or name, active cards first,
 * then inactive ones (legacy plate / boy / service cards and Mikro codes
 * nobody holds stock of are inactive but still valid codes).
 */
export async function searchStockCards(term: string, signal?: AbortSignal) {
  const page = (is_active: 'true' | 'false', page_size: number) =>
    apiFetch<unknown>(BASE, {
      params: { search: term, is_active, page_size, ordering: 'code' },
      signal,
    }).then((data) => extractResults<Item>(data));
  const [active, inactive] = await Promise.all([page('true', 20), page('false', 10)]);
  return [...active, ...inactive].map((item) => {
    rememberCard(item);
    return { value: item.code, label: cardLabel(item) };
  });
}

/** The cards with exactly these codes, by code (missing codes are absent). */
export async function lookupCardsByCode(
  codes: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, Item>> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  const found = new Map<string, Item>();
  // Keep each URL well under length limits.
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const rows = extractResults<Item>(
      await apiFetch<unknown>(BASE, {
        params: { code__in: chunk.join(','), page_size: chunk.length },
        signal,
      }),
    );
    for (const item of rows) {
      found.set(item.code, item);
      rememberCard(item);
    }
  }
  return found;
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

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ItemInput) => createItem(data),
    onSuccess: (item) => {
      rememberCard(item);
      void queryClient.invalidateQueries({ queryKey: itemKeys.all });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteItem(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: itemKeys.all }),
  });
}
