import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// Read side of apis/human_resources/attendance.js, as much as the HR hubs
// need. The PDKS pages themselves are still legacy.

/** Approvals come in through the day; a minute is fresh enough for a hub. */
export const ATTENDANCE_STALE_TIME = 60_000;

/**
 * How many attendance records wait for an HR decision on an off-site check-in
 * or check-out (fetchPendingAttendanceOverrides), from a one-row page.
 */
export function pendingOverridesCountQueryOptions() {
  const params = { page_size: 1 };
  return queryOptions({
    queryKey: ['attendance', 'pendingOverrides', params] as const,
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(await apiFetch<unknown>('/attendance/hr/pending-overrides/', { params, signal })),
    staleTime: ATTENDANCE_STALE_TIME,
    select: (page) => page.count,
  });
}
