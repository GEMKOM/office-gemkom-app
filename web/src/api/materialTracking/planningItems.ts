import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated, type Paginated } from '../types';

// Port of the parts of apis/planning/planningRequestItems.js the material
// tracking page uses: the item list (GET /planning/items/) and the
// manufacturing-critical flag.

/** One pull request a planning item line sits on (the Depo Çekme chips). */
export interface PlanningItemPull {
  id: number;
  number: string;
  status: string;
  status_label?: string;
  destination_name?: string;
  quantity?: string | number | null;
  item_unit?: string;
  [key: string]: unknown;
}

export interface PlanningItem {
  id: number;
  item_code?: string;
  item_name?: string;
  item_unit?: string;
  planning_request?: number;
  planning_request_number?: string;
  job_no?: string;
  quantity?: string | number | null;
  quantity_from_inventory?: string | number | null;
  quantity_to_purchase?: string | number | null;
  is_delivered?: boolean | null;
  delivered_quantity?: string | number | null;
  pulled_quantity?: string | number | null;
  quantity_available_to_pull?: string | number | null;
  pull_requests?: PlanningItemPull[];
  is_critical?: boolean;
  purchase_request_number?: string | null;
  [key: string]: unknown;
}

export type PlanningItemsParams = {
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
  is_critical?: string;
  from_inventory?: string;
  is_available?: string;
  pull_state?: string;
  include_price?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const planningItemKeys = {
  all: ['materialTracking', 'planningItems'] as const,
  lists: () => ['materialTracking', 'planningItems', 'list'] as const,
  list: (params: PlanningItemsParams = {}) =>
    ['materialTracking', 'planningItems', 'list', params] as const,
};

/** Legacy getPlanningItems: GET /planning/items/ with the filters as-is. */
export function fetchPlanningItems(params: PlanningItemsParams = {}, signal?: AbortSignal) {
  return apiFetch<unknown>('/planning/items/', { params, signal }).then((data) =>
    toPaginated<PlanningItem>(data),
  );
}

export function planningItemsQueryOptions(params: PlanningItemsParams = {}) {
  return queryOptions({
    queryKey: planningItemKeys.list(params),
    queryFn: ({ signal }) => fetchPlanningItems(params, signal),
  });
}

/** Legacy markPlanningRequestItemCritical. */
export function markPlanningItemCritical(id: number | string): Promise<PlanningItem> {
  return apiFetch<PlanningItem>(`/planning/items/${id}/mark_critical/`, { method: 'POST' });
}

/** Legacy unmarkPlanningRequestItemCritical. */
export function unmarkPlanningItemCritical(id: number | string): Promise<PlanningItem> {
  return apiFetch<PlanningItem>(`/planning/items/${id}/unmark_critical/`, { method: 'POST' });
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
 * Flips the critical flag. The cached rows change at once and go back if the
 * request fails, as the legacy checkbox did; the list is not reloaded.
 */
export function useSetPlanningItemCritical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, critical }: CriticalVars) =>
      critical ? markPlanningItemCritical(id) : unmarkPlanningItemCritical(id),
    onMutate: (vars) => setCachedCritical(queryClient, vars),
    onError: (_error, vars) =>
      setCachedCritical(queryClient, { id: vars.id, critical: !vars.critical }),
  });
}
