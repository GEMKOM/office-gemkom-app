import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

/**
 * Requests waiting at a stage where the signed-in user is an approver: the
 * "Bekleyen Talepler" / "Bekleyen Onaylar" lists. Both endpoints page the
 * same way, so a one-row page carries the count.
 */
const PENDING_APPROVAL = {
  overtime: '/overtime/requests/pending_approval/',
  vacation: '/vacation-requests/requests/pending_approval/',
} as const;

export type PendingApprovalKind = keyof typeof PENDING_APPROVAL;

/** A minute is fresh enough for a hub; the lists themselves load their own. */
export const PENDING_APPROVAL_STALE_TIME = 60_000;

/** Port of getPendingOvertimeApprovalRequests / fetchPendingVacationApprovalRequests, counted. */
export async function countPendingApprovals(kind: PendingApprovalKind, signal?: AbortSignal): Promise<number> {
  const data = await apiFetch<unknown>(PENDING_APPROVAL[kind], { params: { page_size: 1 }, signal });
  return toPaginated(data).count;
}

export function pendingApprovalCountQueryOptions(kind: PendingApprovalKind) {
  return queryOptions({
    queryKey: ['pendingApprovals', kind, 'count'] as const,
    queryFn: ({ signal }) => countPendingApprovals(kind, signal),
    staleTime: PENDING_APPROVAL_STALE_TIME,
  });
}
