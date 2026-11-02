import { authedFetch } from '@legacy/authService.js';
import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiFetch, buildUrl, cleanParams, errorMessage } from '../client';
import { REFERENCE_STALE_TIME } from '../reference/shared';
import { extractResults } from '../types';

// Machining reports that read the task reports and the timer summary:
// apis/machining/reports.js (fetchDailyEfficiencyReport, fetchPerformanceReport)
// and manufacturing/machining/reports/sum-report/sumReport.js (timer-report).

const REPORTS_KEY = 'reports:machining';

// ---- daily efficiency -------------------------------------------------------

export interface DailyEfficiencyTask {
  task_key?: string | null;
  task_name?: string | null;
  job_no?: string | null;
  machine_name?: string | null;
  daily_duration_hours?: number | null;
  estimated_hours?: number | null;
  total_hours_spent?: number | null;
  efficiency?: number | null;
  /** Only with include_worked. */
  completed_on_date?: boolean | null;
  [key: string]: unknown;
}

export interface DailyEfficiencyUser {
  user_id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  total_daily_hours?: number | null;
  tasks?: DailyEfficiencyTask[];
  [key: string]: unknown;
}

interface DailyEfficiencyResponse {
  users?: DailyEfficiencyUser[];
  [key: string]: unknown;
}

export interface DailyEfficiencyReport extends DailyEfficiencyResponse {
  /** Added here: whether include_worked was asked (legacy reportIncludeWorked). */
  _includeWorked: boolean;
}

export type DailyEfficiencyParams = {
  /** YYYY-MM-DD. */
  date: string;
  /** Every task worked that day, not only the ones completed. */
  include_worked?: boolean;
};

/** Port of fetchDailyEfficiencyReport: include_worked is sent only when true. */
export function dailyEfficiencyQueryOptions({ date, include_worked }: DailyEfficiencyParams) {
  const params = { date, include_worked: include_worked ? 'true' : undefined };
  return queryOptions({
    queryKey: [REPORTS_KEY, 'daily-efficiency', cleanParams(params)] as const,
    queryFn: async ({ signal }): Promise<DailyEfficiencyReport> => ({
      ...(await apiFetch<DailyEfficiencyResponse>('/machining/reports/daily-efficiency/', {
        params,
        signal,
      })),
      _includeWorked: Boolean(include_worked),
    }),
  });
}

// ---- performance ------------------------------------------------------------

export interface PerformanceTask {
  task_key?: string | null;
  task_name?: string | null;
  job_no?: string | null;
  machine_name?: string | null;
  hours_in_period?: number | null;
  estimated_hours?: number | null;
  total_hours_spent?: number | null;
  efficiency?: number | null;
  completed_in_period?: boolean | null;
  on_time?: boolean | null;
  deadline?: string | null;
  [key: string]: unknown;
}

export interface PerformanceUser {
  user_id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  total_hours?: number | null;
  avg_daily_hours?: number | null;
  tasks_worked?: number | null;
  tasks_completed?: number | null;
  avg_efficiency?: number | null;
  on_time_rate?: number | null;
  tasks?: PerformanceTask[];
  [key: string]: unknown;
}

export interface PerformanceSummary {
  total_users?: number | null;
  total_hours?: number | null;
  tasks_completed?: number | null;
  total_tasks_worked?: number | null;
  avg_efficiency?: number | null;
  on_time_rate?: number | null;
}

export interface PerformanceReport {
  users?: PerformanceUser[];
  summary?: PerformanceSummary;
  [key: string]: unknown;
}

export type PerformanceParams = {
  /** YYYY-MM-DD, both required. */
  start_date: string;
  end_date: string;
};

/** Port of fetchPerformanceReport (the page never passed user_ids). */
export function performanceReportQueryOptions(params: PerformanceParams) {
  return queryOptions({
    queryKey: [REPORTS_KEY, 'performance', cleanParams(params)] as const,
    queryFn: ({ signal }) =>
      apiFetch<PerformanceReport>('/machining/reports/performance/', { params, signal }),
  });
}

// ---- timer summary (sum report) ---------------------------------------------

export type TimerReportGroupBy = 'user' | 'machine' | 'job_no' | 'issue_key';

/** A `/machining/timer-report/` row. */
export interface TimerReportRow {
  /** Username, machine id, job no or TI key. */
  group_val?: string | number | null;
  /** job_no and issue_key groupings answer with `group`. */
  group?: string | number | null;
  total_hours?: number | null;
  timer_count?: number | null;
  avg_duration?: number | null;
  [key: string]: unknown;
}

export type TimerReportParams = {
  group_by: TimerReportGroupBy;
  /** Epoch ms. */
  start_after?: number;
  /** Epoch ms. */
  start_before?: number;
  /** Sent only as 'true'. */
  manual_only?: 'true';
};

export function timerReportQueryOptions(params: TimerReportParams) {
  return queryOptions({
    queryKey: [REPORTS_KEY, 'timer-report', cleanParams(params)] as const,
    queryFn: async ({ signal }) =>
      extractResults<TimerReportRow>(
        await apiFetch<unknown>('/machining/timer-report/', { params, signal }),
      ),
  });
}

/**
 * `/machining/timer-report/export/` with the report's filters, saved as
 * `fileName`. Legacy pointed a plain link at it, which carries no token.
 */
export async function downloadTimerReportExport(
  params: TimerReportParams,
  fileName: string,
): Promise<void> {
  const response = await authedFetch(buildUrl('/machining/timer-report/export/', params));
  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    throw new ApiError(response.status, data, errorMessage(response.status, data));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A `/users/` row, as the sum report labels user groups. */
export interface TeamUser {
  id: number;
  username: string;
  display_name?: string;
  [key: string]: unknown;
}

/**
 * apis/users.js fetchUsers(group, { is_active: 'all' }): the group's users,
 * former staff included. Like legacy, a failed request gives [] (the report
 * then labels rows by username).
 */
export function teamUsersQueryOptions(group: string) {
  const params = { group, is_active: 'all' };
  return queryOptions({
    queryKey: ['users', 'team', cleanParams(params)] as const,
    queryFn: async ({ signal }) => {
      try {
        return extractResults<TeamUser>(await apiFetch<unknown>('/users/', { params, signal }));
      } catch (error) {
        if (signal.aborted) throw error;
        return [];
      }
    },
    staleTime: REFERENCE_STALE_TIME,
  });
}
