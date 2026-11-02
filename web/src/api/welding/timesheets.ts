import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';

// Port of apis/welding/timesheets.js (Kaynak Günlük Puantaj, office side), as
// far as Puantaj Onayı (manufacturing/welding/timesheets) uses it.

export type DayState = 'none' | 'pending' | 'approved' | 'blank';

export interface TimesheetFlag {
  level: 'error' | 'warn' | 'info' | string;
  text: string;
}

/** A job line as the daily status lists it. */
export interface DailyRow {
  job_no: string;
  title?: string | null;
  cells?: boolean[];
  hours?: Record<string, number>;
}

/** One rostered welder on GET /welding/timesheets/daily-status/?date=. */
export interface DailyWelder {
  full_name: string;
  team_names?: string[];
  state: DayState;
  scan_id?: number | null;
  scan_status?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  total_hours?: number | null;
  blank_day?: boolean;
  rows?: DailyRow[];
  note?: string | null;
  flags?: TimesheetFlag[];
  has_errors?: boolean;
  [key: string]: unknown;
}

export interface DailyStatus {
  date?: string;
  counts?: Partial<Record<DayState, number>>;
  results?: DailyWelder[];
}

/** A row of a submission's parsed sheet. */
export interface ParsedRow {
  key?: string;
  kind?: string;
  job_no?: string;
  title?: string | null;
  cells?: boolean[];
}

/** GET /welding/timesheets/submissions/{id}/. */
export interface Submission {
  id: number;
  status?: string;
  employee_name?: string;
  date?: string;
  sheet_code?: string | null;
  parsed?: {
    date?: string;
    kind?: string;
    kind_label?: string;
    code?: string;
    rows?: ParsedRow[];
    blank_day?: boolean;
    note?: string;
    flags?: TimesheetFlag[];
  } | null;
  [key: string]: unknown;
}

export interface ApproveResult {
  created_count?: number;
  [key: string]: unknown;
}

export interface ApproveCleanResult {
  approved: unknown[];
  failed?: unknown[];
}

const BASE = '/welding/timesheets';

export const timesheetKeys = {
  all: ['welding', 'timesheets'] as const,
  daily: (date: string) => ['welding', 'timesheets', 'daily', date] as const,
  submission: (id: number) => ['welding', 'timesheets', 'submission', id] as const,
};

export function dailyStatusQueryOptions(date: string) {
  return queryOptions({
    queryKey: timesheetKeys.daily(date),
    queryFn: ({ signal }) => apiFetch<DailyStatus>(`${BASE}/daily-status/`, { params: { date }, signal }),
  });
}

export function submissionQueryOptions(id: number) {
  return queryOptions({
    queryKey: timesheetKeys.submission(id),
    queryFn: ({ signal }) => apiFetch<Submission>(`${BASE}/submissions/${id}/`, { signal }),
    staleTime: 0,
  });
}

export function updateSubmission(id: number, edits: unknown): Promise<Submission> {
  return apiFetch<Submission>(`${BASE}/submissions/${id}/`, { method: 'PATCH', body: edits });
}

export function approveSubmission(id: number): Promise<ApproveResult> {
  return apiFetch<ApproveResult>(`${BASE}/submissions/${id}/approve/`, { method: 'POST', body: {} });
}

export function sendBackSubmission(id: number, reason = ''): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/submissions/${id}/send-back/`, { method: 'POST', body: { reason } });
}

export function approveCleanSubmissions(payload: { date?: string; submission_ids?: number[] }): Promise<ApproveCleanResult> {
  return apiFetch<ApproveCleanResult>(`${BASE}/submissions/approve-clean/`, { method: 'POST', body: payload });
}

/** Wraps a timesheet call and reloads the day lists after it. */
export function useTimesheetMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...timesheetKeys.all, 'daily'] }),
  });
}
