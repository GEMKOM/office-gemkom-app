import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import type { TimerModule } from './counts';

// Port of apis/machining/userReport.js and apis/cnc-cutting/userReport.js:
// the same two report endpoints under each module.

/** Both optional; the backend defaults to today. */
export type UserReportDates = { start_date?: string; end_date?: string };

export interface UserReportUser {
  id?: number;
  user_id?: number;
  username: string;
  first_name?: string;
  last_name?: string;
  total_work_hours: number;
  total_idle_hours: number;
  total_hold_hours?: number;
  total_time_in_office_hours?: number;
  total_tasks_completed?: number;
  total_tasks_worked_on?: number;
  // cnc_cutting
  total_parts_completed?: number;
  total_parts_worked_on?: number;
  [key: string]: unknown;
}

export interface UserReport {
  users?: UserReportUser[];
  [key: string]: unknown;
}

/** A timer or idle period in the task detail. Times are epoch ms or ISO strings. */
export interface UserTaskRow {
  timer_id?: number;
  start_time?: number | string | null;
  finish_time?: number | string | null;
  task_key?: string | null;
  task_name?: string | null;
  job_no?: string | null;
  duration_minutes?: number | null;
  estimated_hours?: number | null;
  total_hours_spent?: number | null;
  machine_name?: string | null;
  manual_entry?: boolean;
  comment?: string | null;
  // cnc_cutting
  nesting_id?: string | null;
  material?: string | null;
  thickness_mm?: number | string | null;
  parts_count?: number | null;
  [key: string]: unknown;
}

export interface UserTaskDetailDay {
  date?: string;
  day?: string;
  tasks?: UserTaskRow[];
  idle_periods?: UserTaskRow[];
  hold_tasks?: UserTaskRow[];
}

export type TaskTotals = Record<
  string,
  {
    estimated_hours?: number | null;
    total_hours_spent?: number | null;
    parts_count?: number | null;
  }
>;

export interface UserTaskDetail {
  days?: UserTaskDetailDay[];
  results?: UserTaskDetailDay[];
  task_totals?: TaskTotals;
  taskTotals?: TaskTotals;
}

export function userReportQueryOptions(module: TimerModule, dates: UserReportDates) {
  return queryOptions({
    queryKey: [`reports:${module}`, 'user-report', cleanParams(dates)] as const,
    queryFn: ({ signal }) =>
      apiFetch<UserReport>(`/${module}/reports/user-report/`, { params: dates, signal }),
  });
}

export function userTaskDetailQueryOptions(
  module: TimerModule,
  userId: number,
  dates: UserReportDates,
) {
  const params = { user_id: userId, ...dates };
  return queryOptions({
    queryKey: [`reports:${module}`, 'user-task-detail', cleanParams(params)] as const,
    queryFn: ({ signal }) =>
      apiFetch<UserTaskDetail>(`/${module}/reports/user-task-detail/`, { params, signal }),
  });
}
