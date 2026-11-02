import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// The calls of apis/vacationRequests.js that the HR employees page uses.

export interface LeaveSetup {
  hire_date?: string | null;
  /** Decimal strings. */
  total_days?: string | number | null;
  used_days?: string | number | null;
  remaining_days?: string | number | null;
  [key: string]: unknown;
}

export interface ApprovalStage {
  name?: string;
  is_complete?: boolean;
  is_rejected?: boolean;
  required_approvals?: number | string;
  approved_count?: number | string;
}

export interface VacationRequest {
  id: number;
  requester?: number;
  leave_type?: string;
  leave_type_label?: string;
  start_date?: string;
  end_date?: string;
  duration_days?: string | number | null;
  status?: string;
  status_label?: string;
  created_at?: string;
  approval?: { stage_instances?: ApprovalStage[] } | null;
  [key: string]: unknown;
}

export const leaveSetupKey = (userId: number) =>
  ['vacation', 'leaveSetup', String(userId)] as const;

/** Port of fetchUserLeaveSetup. */
export function leaveSetupQueryOptions(userId: number) {
  return queryOptions({
    queryKey: leaveSetupKey(userId),
    queryFn: ({ signal }) =>
      apiFetch<LeaveSetup | null>(`/vacation-requests/users/${userId}/leave-setup/`, { signal }),
    staleTime: 0,
  });
}

/** Port of patchUserLeaveSetup. */
export function patchLeaveSetup(
  userId: number,
  data: { hire_date: string; total_days: string },
): Promise<LeaveSetup> {
  return apiFetch<LeaveSetup>(`/vacation-requests/users/${userId}/leave-setup/`, {
    method: 'PATCH',
    body: data,
  });
}

/**
 * The user's own requests, newest first (fetchVacationRequests with
 * requester, ordering=-created_at, page_size=200); rows of other requesters
 * are dropped as legacy did.
 */
export function userVacationRequestsQueryOptions(userId: number) {
  const params = { requester: userId, ordering: '-created_at', page_size: 200 };
  return queryOptions({
    queryKey: ['vacation', 'requests', 'byUser', String(userId)] as const,
    queryFn: async ({ signal }) =>
      extractResults<VacationRequest>(
        await apiFetch<unknown>('/vacation-requests/requests/', { params, signal }),
      ).filter((item) => Number(item?.requester) === Number(userId)),
    staleTime: 0,
  });
}
