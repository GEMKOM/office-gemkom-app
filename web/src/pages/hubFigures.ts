import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { pendingApprovalCountQueryOptions, type PendingApprovalKind } from '@/api/general/approvals';
import { isgSummaryQueryOptions } from '@/api/isg/issues';
import { formatNumber } from '@/lib/format';
import type { MenuCard } from '@/ui';

/** A card or band figure: undefined while loading, '-' when it failed. */
export function countValue(query: Pick<UseQueryResult<number | undefined>, 'data' | 'isError'>) {
  if (query.isError) return '-';
  return query.data === undefined ? undefined : formatNumber(query.data);
}

/** A pill on a parent hub's card, only when something is waiting. */
export function waitingBadge(count: number | undefined, label: string, color: NonNullable<MenuCard['badge']>['color']) {
  return count ? { label: `${formatNumber(count)} ${label}`, color } : undefined;
}

/**
 * Requests waiting for this user's approval. Nothing is fetched for a list
 * the user cannot open (the card that shows it is hidden anyway).
 */
export function usePendingApprovalCount(kind: PendingApprovalKind, route: string) {
  return useQuery({ ...pendingApprovalCountQueryOptions(kind), enabled: hasRouteAccess(route) });
}

/** The İSG counters; the İSG pages are open to everyone. */
export function useIsgSummary() {
  return useQuery(isgSummaryQueryOptions());
}
