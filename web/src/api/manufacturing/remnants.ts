import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { toPaginated } from '../types';

// Port of apis/cnc_cutting/remnants.js: CNC remnant (fire) plates.

export interface RemnantPlate {
  id: number;
  thickness_mm?: string | number | null;
  thickness_mm_2?: string | number | null;
  dimensions?: string | null;
  quantity?: number | string | null;
  material?: string | null;
  heat_number?: string | null;
  assigned_to?: unknown;
  task?: string | null;
  [key: string]: unknown;
}

export interface RemnantPlateInput {
  thickness_mm: string;
  thickness_mm_2?: string | null;
  dimensions: string;
  quantity: number;
  material: string;
  heat_number?: string | null;
}

export type RemnantPlatesParams = {
  page?: number;
  page_size?: number;
  ordering?: string;
  thickness_mm?: string;
  dimensions?: string;
  material?: string;
  /** Legacy sends `unassigned=false` for assigned plates and nothing for the default. */
  unassigned?: boolean;
};

export const remnantKeys = {
  all: ['remnantPlates'] as const,
  list: (params: QueryParams) => ['remnantPlates', 'list', cleanParams(params)] as const,
  detail: (id: string | number) => ['remnantPlates', 'detail', String(id)] as const,
};

const BASE = '/cnc_cutting/remnants/';

export function remnantPlatesQueryOptions(params: RemnantPlatesParams) {
  return queryOptions({
    queryKey: remnantKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<RemnantPlate>(await apiFetch<unknown>(BASE, { params, signal })),
  });
}

/** getRemnantPlateById: the edit form starts from the saved record, fetched on open. */
export function fetchRemnantPlate(id: number) {
  return apiFetch<RemnantPlate>(`${BASE}${id}/`);
}

function useRemnantMutation<V>(mutationFn: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: remnantKeys.all }),
  });
}

export function useCreateRemnantPlate() {
  return useRemnantMutation((data: RemnantPlateInput) =>
    apiFetch<RemnantPlate>(BASE, { method: 'POST', body: data }),
  );
}

export function useBulkCreateRemnantPlates() {
  return useRemnantMutation((data: RemnantPlateInput[]) =>
    apiFetch<RemnantPlate[]>(`${BASE}bulk-create/`, { method: 'POST', body: data }),
  );
}

export function useUpdateRemnantPlate() {
  return useRemnantMutation(({ id, data }: { id: number; data: RemnantPlateInput }) =>
    apiFetch<RemnantPlate>(`${BASE}${id}/`, { method: 'PUT', body: data }),
  );
}

export function useDeleteRemnantPlate() {
  return useRemnantMutation((id: number) => apiFetch<void>(`${BASE}${id}/`, { method: 'DELETE' }));
}
