import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// The HR record calls of apis/human_resources/attendance.js that the employee
// edit modal (PDKS Özeti tab) uses.

export interface LeaveInterval {
  id: number;
  start_time?: string | null;
  end_time?: string | null;
  leave_type?: string;
  leave_type_display?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface AttendanceRecord {
  id: number;
  check_in_time?: string | null;
  check_out_time?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  method?: string;
  method_display?: string;
  leave_type?: string;
  leave_type_display?: string;
  is_paid_leave?: boolean | null;
  late_minutes?: number | string | null;
  early_leave_minutes?: number | string | null;
  overtime_minutes?: number | string | null;
  overtime_min?: number | string | null;
  overtime?: number | string | null;
  notes?: string;
  leave_intervals?: LeaveInterval[];
  [key: string]: unknown;
}

export interface AttendanceDay {
  date?: string;
  weekday?: string;
  day_type?: string;
  holiday_name?: string | null;
  flag?: string | null;
  leave_type?: string;
  leave_type_display?: string;
  record?: AttendanceRecord | null;
}

export interface MonthlySummary {
  shift_rule?: {
    expected_start?: string | null;
    expected_end?: string | null;
    overtime_threshold_minutes?: number | string | null;
  } | null;
  summary?: {
    total_working_days?: number;
    total_present?: number;
    total_absent?: number;
    total_overtime_minutes?: number;
    total_late_minutes?: number;
  } | null;
  days?: AttendanceDay[];
}

export const monthlySummaryKey = (userId: number) =>
  ['attendance', 'monthlySummary', String(userId)] as const;

/** Port of fetchAttendanceMonthlySummary. */
export function monthlySummaryQueryOptions(userId: number, year: number, month: number) {
  return queryOptions({
    queryKey: [...monthlySummaryKey(userId), year, month] as const,
    queryFn: ({ signal }) =>
      apiFetch<MonthlySummary | null>('/attendance/monthly-summary/', {
        params: { user_id: userId, year, month },
        signal,
      }),
    staleTime: 0,
  });
}

export function createAttendanceHrRecord(
  data: Record<string, unknown>,
): Promise<AttendanceRecord | null> {
  return apiFetch<AttendanceRecord | null>('/attendance/hr/records/', {
    method: 'POST',
    body: data,
  });
}

export function patchAttendanceHrRecord(
  id: number,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiFetch<unknown>(`/attendance/hr/records/${id}/`, { method: 'PATCH', body: data });
}

export const recordIntervalsKey = (recordId: number) =>
  ['attendance', 'intervals', String(recordId)] as const;

export function recordIntervalsQueryOptions(recordId: number) {
  return queryOptions({
    queryKey: recordIntervalsKey(recordId),
    queryFn: async ({ signal }) =>
      extractResults<LeaveInterval>(
        await apiFetch<unknown>(`/attendance/hr/records/${recordId}/intervals/`, { signal }),
      ),
    staleTime: 0,
  });
}

export function createRecordInterval(
  recordId: number,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiFetch<unknown>(`/attendance/hr/records/${recordId}/intervals/`, {
    method: 'POST',
    body: data,
  });
}

export function patchInterval(id: number, data: Record<string, unknown>): Promise<unknown> {
  return apiFetch<unknown>(`/attendance/hr/intervals/${id}/`, { method: 'PATCH', body: data });
}

export function deleteInterval(id: number): Promise<void> {
  return apiFetch<void>(`/attendance/hr/intervals/${id}/`, { method: 'DELETE' });
}
