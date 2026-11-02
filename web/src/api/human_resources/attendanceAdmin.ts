import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults } from '../types';

// Port of the HR side of apis/human_resources/attendance.js used by the PDKS
// pages: pending overrides, shift rules and the per-user summary. The hub's
// read-only count lives in ./attendance.ts and shares the pendingOverrides key.

// ---- pending overrides ----

export type AttendanceStatus =
  | 'pending_override'
  | 'pending_checkout_override'
  | 'override_rejected'
  | 'active'
  | 'complete'
  | 'rejected'
  | (string & {});

export interface AttendanceSession {
  id: number;
  status?: AttendanceStatus;
  check_in_time?: string | null;
  check_out_time?: string | null;
  override_reason?: string | null;
  [key: string]: unknown;
}

export interface PendingOverrideRecord {
  id: number;
  user_display?: string;
  status?: AttendanceStatus;
  sessions?: AttendanceSession[];
  [key: string]: unknown;
}

/** Prefix shared with the hub's count query, so a decision refreshes both. */
const PENDING_KEY = ['attendance', 'pendingOverrides'] as const;

/** fetchPendingAttendanceOverrides: the records as the endpoint returns them (first page). */
export function pendingOverridesQueryOptions() {
  return queryOptions({
    queryKey: [...PENDING_KEY, 'list'] as const,
    queryFn: async ({ signal }) =>
      extractResults<PendingOverrideRecord>(
        await apiFetch<unknown>('/attendance/hr/pending-overrides/', { signal }),
      ),
  });
}

export function usePendingOverrides() {
  return useQuery(pendingOverridesQueryOptions());
}

export type OverrideApprovePayload = { check_in_time?: string; check_out_time?: string };

export function useApproveOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, payload }: { sessionId: number; payload: OverrideApprovePayload }) =>
      apiFetch<unknown>(`/attendance/hr/sessions/${sessionId}/approve/`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_KEY }),
  });
}

export function useRejectOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, notes }: { sessionId: number; notes: string }) =>
      apiFetch<unknown>(`/attendance/hr/sessions/${sessionId}/reject/`, {
        method: 'POST',
        body: notes ? { notes } : {},
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PENDING_KEY }),
  });
}

// ---- shift rules ----

export interface ShiftRule {
  id: number;
  name?: string;
  expected_start?: string | null;
  expected_end?: string | null;
  overtime_threshold_minutes?: number | null;
  is_active?: boolean;
  is_default?: boolean;
  assigned_user_count?: number | null;
  [key: string]: unknown;
}

export interface ShiftRuleInput {
  name: string;
  expected_start: string;
  expected_end: string;
  overtime_threshold_minutes: number;
  is_active: boolean;
  is_default: boolean;
}

const SHIFT_RULES_KEY = ['attendance', 'shiftRules'] as const;
const SHIFT_RULES = '/attendance/hr/shift-rules/';

export function shiftRulesQueryOptions() {
  return queryOptions({
    queryKey: [...SHIFT_RULES_KEY, 'list'] as const,
    queryFn: async ({ signal }) =>
      extractResults<ShiftRule>(await apiFetch<unknown>(SHIFT_RULES, { signal })),
  });
}

export function useShiftRules() {
  return useQuery(shiftRulesQueryOptions());
}

export function useSaveShiftRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Partial<ShiftRuleInput> }) =>
      id
        ? apiFetch<ShiftRule>(`${SHIFT_RULES}${id}/`, { method: 'PATCH', body: data })
        : apiFetch<ShiftRule>(SHIFT_RULES, { method: 'POST', body: data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHIFT_RULES_KEY }),
  });
}

export function useDeleteShiftRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<unknown>(`${SHIFT_RULES}${id}/`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHIFT_RULES_KEY }),
  });
}

// ---- HR summary ----

export interface AttendanceSummaryRow {
  user_id?: number;
  user_display?: string;
  date_from?: string;
  date_to?: string;
  total_working_days?: number;
  days_present?: number;
  days_leave?: number;
  days_absent?: number;
  session_count?: number;
  total_present_minutes?: number;
  total_expected_minutes?: number;
  total_overtime_minutes?: number;
  total_late_minutes?: number;
  total_early_leave_minutes?: number;
  [key: string]: unknown;
}

export type AttendanceSummaryParams = {
  date_from?: string;
  date_to?: string;
  user_id?: string;
  username?: string;
  name?: string;
  group_id?: string;
  group_name?: string;
};

/** fetchAttendanceHrSummary; empty filters are left out of the query. */
export function attendanceSummaryQueryOptions(params: AttendanceSummaryParams) {
  const trimmed = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v?.trim()]));
  return queryOptions({
    queryKey: ['attendance', 'hrSummary', cleanParams(trimmed)] as const,
    queryFn: async ({ signal }) =>
      extractResults<AttendanceSummaryRow>(
        await apiFetch<unknown>('/attendance/hr/summary/', { params: trimmed, signal }),
      ),
  });
}
