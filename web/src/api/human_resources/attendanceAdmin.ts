import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults } from '../types';
import { patchAttendanceHrRecord } from './userAttendance';

// Port of the HR side of apis/human_resources/attendance.js used by the PDKS
// pages: pending overrides, shift rules and the per-user summary. The hub's
// read-only count lives in ./attendance.ts and shares the pendingOverrides key.
// Also the records list and its session edits (PDKS Kayıtları).

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

// ---- HR records (PDKS Kayıtları) ----

export interface AttendanceHrSession extends AttendanceSession {
  method?: string;
  method_display?: string;
  client_ip?: string | null;
  status_display?: string;
  duration_minutes?: number | null;
}

export interface AttendanceHrRecord {
  id: number;
  user_display?: string;
  reviewed_by_display?: string | null;
  date?: string | null;
  status?: AttendanceStatus;
  status_display?: string;
  leave_type?: string | null;
  notes?: string | null;
  first_check_in?: string | null;
  last_check_out?: string | null;
  overtime_minutes?: number | null;
  total_present_minutes?: number | null;
  sessions?: AttendanceHrSession[];
  [key: string]: unknown;
}

export type AttendanceRecordsParams = {
  date?: string;
  date_from?: string;
  date_to?: string;
  user_id?: string;
  username?: string;
  name?: string;
  group_id?: string;
  status?: string;
};

export interface AttendanceSessionInput {
  /** datetime-local text, sent as typed (legacy). */
  check_in_time: string;
  check_out_time: string | null;
  method: string;
  status: string;
  override_reason: string;
}

const RECORDS_KEY = ['attendance', 'hrRecords'] as const;

/** fetchAttendanceHrRecords; empty (or blank) filters are left out of the query. */
export function attendanceRecordsQueryOptions(params: AttendanceRecordsParams) {
  const trimmed = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v?.trim()]));
  return queryOptions({
    queryKey: [...RECORDS_KEY, cleanParams(trimmed)] as const,
    queryFn: async ({ signal }) =>
      extractResults<AttendanceHrRecord>(
        await apiFetch<unknown>('/attendance/hr/records/', { params: trimmed, signal }),
      ),
  });
}

/** patchAttendanceHrRecord */
export function usePatchAttendanceRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      patchAttendanceHrRecord(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECORDS_KEY }),
  });
}

export type SaveSessionArgs =
  | { sessionId: number; data: AttendanceSessionInput }
  | { recordId: number; data: AttendanceSessionInput };

/** patchAttendanceHrSession (sessionId) or createAttendanceHrSession (recordId). */
export function useSaveAttendanceSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: SaveSessionArgs) =>
      'sessionId' in args
        ? apiFetch<unknown>(`/attendance/hr/sessions/${args.sessionId}/`, {
            method: 'PATCH',
            body: args.data,
          })
        : apiFetch<unknown>(`/attendance/hr/records/${args.recordId}/sessions/`, {
            method: 'POST',
            body: args.data,
          }),
    // A session status can put a record into (or out of) the pending overrides.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: RECORDS_KEY }),
        queryClient.invalidateQueries({ queryKey: PENDING_KEY }),
      ]),
  });
}

/** deleteAttendanceHrSession */
export function useDeleteAttendanceSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) =>
      apiFetch<unknown>(`/attendance/hr/sessions/${sessionId}/`, { method: 'DELETE' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: RECORDS_KEY }),
        queryClient.invalidateQueries({ queryKey: PENDING_KEY }),
      ]),
  });
}
