import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { pendingApprovalCountQueryOptions } from '../general/approvals';
import { vacationErrorMessage, vacationKeys } from '../general/vacation';
import { extractResults, toPaginated } from '../types';

// The calls of apis/vacationRequests.js that the HR pages use: the employees
// page's İzinler tab and the İzin Yönetimi page.

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

// ---- İzin Yönetimi page (human_resources/vacation) ----
// The HR calls of apis/vacationRequests.js: balances, the leave ledger, the
// approvals inbox and its decisions, and the approved requests list. Keys sit
// under the vacation requests prefix so a decision refreshes every list.

/** Legacy parseJsonOrThrow's message, as an Error the pages and DataTable show. */
async function withMessage<T>(fallback: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(vacationErrorMessage(error, fallback), { cause: error });
  }
}

export interface VacationBalance {
  id: number;
  user_id?: number | null;
  user?: number | { id?: number } | null;
  user_full_name?: string | null;
  year?: number | string | null;
  leave_type?: string;
  leave_type_label?: string;
  /** Decimal strings. */
  total_days?: string | number | null;
  used_days?: string | number | null;
  remaining_days?: string | number | null;
  [key: string]: unknown;
}

export type VacationBalancesParams = { user_id?: number; year?: number };

export interface LeaveLedgerEntry {
  date?: string | null;
  kind?: string;
  kind_label?: string;
  delta?: string | number | null;
  balance_after?: string | number | null;
  note?: string | null;
  created_by?: string | null;
  request?: { id?: number; start_date?: string; end_date?: string } | null;
}

export interface LeaveLedger {
  username?: string;
  current_balance?: {
    total_days?: string | number | null;
    used_days?: string | number | null;
    remaining_days?: string | number | null;
  } | null;
  entries?: LeaveLedgerEntry[];
}

export interface ApproverUser {
  id?: number;
  full_name?: string;
  username?: string;
}

export interface HrApprovalStage extends ApprovalStage {
  order?: number;
  approvers?: ApproverUser[];
  decisions?: {
    decision?: string;
    decided_at?: string | null;
    comment?: string | null;
    approver_detail?: { full_name?: string; username?: string } | null;
  }[];
}

/** A row of the approvals inbox or of the approved list. */
export interface HrVacationRequest extends VacationRequest {
  /** Inbox rows: what HR decides on. */
  kind?: 'workflow_approval' | 'cancellation_request' | (string & {});
  requester_username?: string;
  requester_full_name?: string;
  team?: string | null;
  team_label?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
  cancellation_reason?: string | null;
  is_company_holiday?: boolean;
  updated_at?: string;
  approval?: {
    is_complete?: boolean;
    is_rejected?: boolean;
    stage_instances?: HrApprovalStage[];
  } | null;
}

export type ApprovedVacationParams = {
  search?: string;
  leave_type?: string;
  start_date_from?: string;
  start_date_to?: string;
  page: number;
  page_size: number;
};

export const hrVacationKeys = {
  all: vacationKeys.all,
  balances: (params: VacationBalancesParams) => [...vacationKeys.all, 'balances', params] as const,
  ledger: (userId: number) => [...vacationKeys.all, 'ledger', String(userId)] as const,
  inbox: () => [...vacationKeys.all, 'approvalsInbox'] as const,
  approved: (params: ApprovedVacationParams) =>
    [...vacationKeys.all, 'hrApproved', params] as const,
};

/** fetchVacationBalances (a list or a page; legacy showed every row). */
export function vacationBalancesQueryOptions(params: VacationBalancesParams) {
  return queryOptions({
    queryKey: hrVacationKeys.balances(params),
    queryFn: ({ signal }) =>
      withMessage('İzin bakiyeleri yüklenemedi.', async () =>
        extractResults<VacationBalance>(
          await apiFetch<unknown>('/vacation-requests/balances/', { params, signal }),
        ),
      ),
    placeholderData: keepPreviousData,
  });
}

/** patchVacationBalance */
export function patchVacationBalance(
  id: number,
  data: { total_days: string },
): Promise<VacationBalance | null> {
  return withMessage('İzin bakiyesi güncellenemedi.', () =>
    apiFetch<VacationBalance | null>(`/vacation-requests/balances/${id}/`, {
      method: 'PATCH',
      body: data,
    }),
  );
}

/** fetchUserLeaveLedger */
export function leaveLedgerQueryOptions(userId: number) {
  return queryOptions({
    queryKey: hrVacationKeys.ledger(userId),
    queryFn: ({ signal }) =>
      withMessage('İzin hareketleri yüklenemedi.', async () => {
        const data = await apiFetch<unknown>(`/vacation-requests/users/${userId}/leave-ledger/`, {
          signal,
        });
        return (
          data && typeof data === 'object' && !Array.isArray(data) ? data : {}
        ) as LeaveLedger;
      }),
    staleTime: 0,
  });
}

/** fetchVacationApprovalsInbox, loaded without params as legacy did. */
export function vacationApprovalsInboxQueryOptions() {
  return queryOptions({
    queryKey: hrVacationKeys.inbox(),
    queryFn: ({ signal }) =>
      withMessage('Onay kutusu yüklenemedi.', async () =>
        toPaginated<HrVacationRequest>(
          await apiFetch<unknown>('/vacation-requests/requests/approvals-inbox/', { signal }),
        ),
      ),
  });
}

/** fetchVacationRequests with status=approved, newest start first. */
export function approvedVacationRequestsQueryOptions(params: ApprovedVacationParams) {
  return queryOptions({
    queryKey: hrVacationKeys.approved(params),
    queryFn: ({ signal }) =>
      withMessage('İzin talepleri yüklenemedi.', async () =>
        toPaginated<HrVacationRequest>(
          await apiFetch<unknown>('/vacation-requests/requests/', {
            params: { status: 'approved', ...params, ordering: '-start_date' },
            signal,
          }),
        ),
      ),
    placeholderData: keepPreviousData,
  });
}

export type HrVacationDecision = {
  id: number;
  /** cancellation_request uses the approve-/reject-cancellation endpoints. */
  kind: string;
  decision: 'approve' | 'reject';
  comment?: string;
};

const DECISION_FALLBACK = {
  approve: 'Onaylama işlemi başarısız.',
  reject: 'Reddetme işlemi başarısız.',
  'approve-cancellation': 'İptal onayı başarısız.',
  'reject-cancellation': 'İptal reddi başarısız.',
} as const;

/**
 * approveVacationRequest / rejectVacationRequest, or for a cancellation
 * request approveVacationCancellation / rejectVacationCancellation. Refreshes
 * the inbox, the approved list and the balances (legacy reloaded all three).
 */
export function useHrVacationDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind, decision, comment = '' }: HrVacationDecision) => {
      const action =
        kind === 'cancellation_request' ? (`${decision}-cancellation` as const) : decision;
      return withMessage(DECISION_FALLBACK[action], () =>
        apiFetch<unknown>(`/vacation-requests/requests/${id}/${action}/`, {
          method: 'POST',
          body: { comment },
        }),
      );
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: hrVacationKeys.all }),
        queryClient.invalidateQueries({
          queryKey: pendingApprovalCountQueryOptions('vacation').queryKey,
        }),
      ]),
  });
}
