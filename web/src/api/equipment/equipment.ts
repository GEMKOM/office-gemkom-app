import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '@/api/client';
import { toPaginated } from '@/api/types';

// Port of the item endpoints in apis/equipment/equipment.js that the
// planning/inventory/equipment page used.

export interface EquipmentItem {
  id: number;
  code?: string | null;
  name?: string | null;
  asset_type?: string | null;
  category?: string | null;
  location?: string | null;
  quantity?: number | null;
  available_quantity?: number | null;
  checked_out_quantity?: number | null;
  is_active?: boolean;
  /** The backend may add fields; the detail modal lists them all. */
  [key: string]: unknown;
}

/**
 * Body of POST / PATCH /equipment/items/. The legacy form could merge any
 * extra fields from its JSON box, so other keys are allowed.
 */
export interface EquipmentItemInput {
  code?: string | null;
  name?: string;
  asset_type?: string | null;
  category?: string | null;
  location?: string | null;
  quantity?: number;
  is_active?: boolean;
  [key: string]: unknown;
}

/** GET /equipment/items/ filters as the legacy page sent them. */
export type EquipmentItemsParams = {
  name?: string;
  asset_type?: string;
  /** 'true' / 'false', sent as text like the legacy dropdown value. */
  is_active?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

const BASE = '/equipment/items/';
const detailPath = (id: string | number) => `${BASE}${encodeURIComponent(String(id))}/`;

export const equipmentKeys = {
  all: ['equipmentItems'] as const,
  list: (params: QueryParams = {}) => ['equipmentItems', 'list', cleanParams(params)] as const,
};

/** listEquipmentItems: GET /equipment/items/ (a bare array is read as one page). */
export function equipmentItemsQueryOptions(params: EquipmentItemsParams = {}) {
  return queryOptions({
    queryKey: equipmentKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<EquipmentItem>(await apiFetch<unknown>(BASE, { params, signal })),
  });
}

export function useEquipmentItems(params: EquipmentItemsParams = {}) {
  return useQuery(equipmentItemsQueryOptions(params));
}

/** createEquipmentItem: POST /equipment/items/. */
export function createEquipmentItem(data: EquipmentItemInput): Promise<EquipmentItem> {
  return apiFetch<EquipmentItem>(BASE, { method: 'POST', body: data });
}

/** patchEquipmentItem: PATCH /equipment/items/{id}/. */
export function patchEquipmentItem(
  id: string | number,
  data: EquipmentItemInput,
): Promise<EquipmentItem> {
  return apiFetch<EquipmentItem>(detailPath(id), { method: 'PATCH', body: data });
}

/** deleteEquipmentItem: DELETE /equipment/items/{id}/ (the backend soft-deletes, is_active=false). */
export function deleteEquipmentItem(id: string | number): Promise<unknown> {
  return apiFetch<unknown>(detailPath(id), { method: 'DELETE' });
}

function useInvalidateEquipment() {
  const queryClient = useQueryClient();
  // The list refetches in the background; the mutation does not wait for it.
  return () => {
    void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
  };
}

export function useCreateEquipmentItem() {
  const invalidate = useInvalidateEquipment();
  return useMutation({ mutationFn: createEquipmentItem, onSuccess: () => invalidate() });
}

export function usePatchEquipmentItem() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: EquipmentItemInput }) =>
      patchEquipmentItem(id, data),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteEquipmentItem() {
  const invalidate = useInvalidateEquipment();
  return useMutation({
    mutationFn: (id: string | number) => deleteEquipmentItem(id),
    onSuccess: () => invalidate(),
  });
}
