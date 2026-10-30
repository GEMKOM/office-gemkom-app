import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// Read side of apis/procurement.js, as much as the procurement hubs need. The
// purchase request pages themselves are still legacy.

/** Requests move all day; a minute is fresh enough for a hub. */
export const PURCHASE_REQUESTS_STALE_TIME = 60_000;

/**
 * How many purchase requests await the current user's approval (what the
 * legacy "Bekleyen Talepler" page lists), from a one-row page of
 * getPendingApprovalRequests.
 */
export function pendingApprovalCountQueryOptions() {
  const params = { page_size: 1 };
  return queryOptions({
    queryKey: ['purchaseRequests', 'pendingApproval', params] as const,
    queryFn: async ({ signal }) =>
      toPaginated(
        await apiFetch<unknown>('/procurement/purchase-requests/pending_approval/', {
          params,
          signal,
        }),
      ),
    staleTime: PURCHASE_REQUESTS_STALE_TIME,
    select: (page) => page.count,
  });
}
