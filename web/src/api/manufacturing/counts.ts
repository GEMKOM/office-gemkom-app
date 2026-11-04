import { queryOptions, type QueryKey } from '@tanstack/react-query';
import { apiFetch, type QueryParams } from '../client';
import { listCountQueryOptions } from '../counts';

// Counts for the manufacturing hubs, from one-row pages of the lists.

/** Timers and faults move by the minute. */
export const SHOP_FLOOR_STALE_TIME = 30_000;

/** How many rows match, from a one-row page; keyed [resource, 'count', params]. */
function countQueryOptions(resource: string, path: string, params: QueryParams) {
  return listCountQueryOptions([resource], path, params, SHOP_FLOOR_STALE_TIME);
}

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

// ---- counts the manufacturing hubs added later; keys under each list's root ----

/** Machining parts not completed; `lateBefore` keeps those due on or before that day. */
export function incompletePartCountQueryOptions(lateBefore?: string) {
  return listCountQueryOptions(
    ['machiningParts'],
    '/tasks/parts/',
    { completion_date__isnull: true, finish_time__lte: lateBefore },
    SHOP_FLOOR_STALE_TIME,
  );
}

/** CNC cuts (nestings) not completed, as the cuts page lists status=pending. */
export function pendingCncCutCountQueryOptions() {
  return listCountQueryOptions(
    ['cncTasks'],
    '/cnc_cutting/tasks/',
    { completion_date__isnull: true },
    SHOP_FLOOR_STALE_TIME,
  );
}

/** Linear cutting tasks not completed. */
export function pendingLinearTaskCountQueryOptions() {
  return listCountQueryOptions(
    ['linearCuttingTasks'],
    '/linear_cutting/tasks/',
    { completed: false },
    SHOP_FLOOR_STALE_TIME,
  );
}

/** Welding time entries booked for a day. */
export function weldingEntryCountQueryOptions(date: string) {
  return listCountQueryOptions(['weldingTimeEntries'], '/welding/time-entries/', { date });
}

/** Material pull requests the warehouse has not transferred yet. */
export function pendingPullRequestCountQueryOptions() {
  return listCountQueryOptions(['materialTracking', 'pullRequests'], '/warehouse/pull-requests/', {
    status: 'pending',
  });
}

/** Subcontractor statements waiting for approval. */
export function statementsInApprovalCountQueryOptions() {
  return listCountQueryOptions(
    ['subcontractingStatements', 'list'],
    '/subcontracting/statements/',
    {
      status: 'submitted',
    },
  );
}

/** Welders whose timesheet for a day waits for approval (daily-status counts.pending). */
export function pendingTimesheetCountQueryOptions(date: string) {
  return queryOptions({
    queryKey: ['welding', 'timesheets', 'daily', date, 'pending'] as QueryKey,
    queryFn: async ({ signal }) => {
      const status = await apiFetch<{ counts?: Record<string, number> }>(
        '/welding/timesheets/daily-status/',
        {
          params: { date },
          signal,
        },
      );
      return status?.counts?.pending ?? 0;
    },
    staleTime: SHOP_FLOOR_STALE_TIME,
  });
}
