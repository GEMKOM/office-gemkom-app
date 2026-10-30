import { queryOptions, type QueryKey } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { toPaginated } from '../types';

// Counts for the manufacturing hubs, from one-row pages of lists the legacy
// dashboards already read. The pages behind them are still legacy.

/** Timers and faults move by the minute. */
export const SHOP_FLOOR_STALE_TIME = 30_000;

/** How many rows match, from a one-row page. */
function countQueryOptions(resource: string, path: string, params: QueryParams) {
  return queryOptions({
    queryKey: [resource, 'count', cleanParams(params)] as QueryKey,
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(await apiFetch<unknown>(path, { params: { ...params, page_size: 1 }, signal })).count,
    staleTime: SHOP_FLOOR_STALE_TIME,
  });
}

export type CountQueryOptions = ReturnType<typeof countQueryOptions>;

export type TimerModule = 'machining' | 'cnc_cutting';

/**
 * Running timers in a module, as fetchTimers(true, ..., module) in
 * apis/timers.js lists them. The backend shows non-office users their own only.
 */
export function activeTimerCountQueryOptions(module: TimerModule) {
  return countQueryOptions(`timers:${module}`, `/${module}/timers/`, { is_active: true });
}

/**
 * Unresolved machine faults (fetchMachineFaults in apis/maintenance.js; the
 * fault list opens on `unresolved=true`). `is_breaking` narrows to stopped machines.
 */
export function openFaultCountQueryOptions(filter: { is_breaking?: boolean } = {}) {
  return countQueryOptions('machineFaults', '/machines/faults/', { unresolved: true, ...filter });
}
