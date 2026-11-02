import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// Shop-floor timers and the task details the dashboards open from them.
// Ports of apis/timers.js, apis/linear_cutting/timers.js, apis/cnc_cutting/crud.js
// getCncTask and apis/machining/operations.js getOperation.

export type TimerModule = 'machining' | 'cnc_cutting' | 'linear_cutting';

/** A running timer row from `/<module>/timers/`. */
export interface Timer {
  id: number;
  username?: string | null;
  machine_name?: string | null;
  machine_fk?: number | null;
  issue_key?: string | null;
  issue_name?: string | null;
  /** Epoch ms (legacy also accepted an ISO string). */
  start_time?: number | string | null;
  finish_time?: number | string | null;
  estimated_hours?: number | string | null;
  task_total_hours?: number | string | null;
  /** 'productive' or a downtime kind (machining). */
  timer_type?: string | null;
  downtime_reason_name?: string | null;
  nesting_id?: string | null;
  thickness_mm?: number | string | null;
  [key: string]: unknown;
}

export const timerKeys = {
  all: (module: TimerModule) => ['timers', module] as const,
  active: (module: TimerModule) => ['timers', module, 'active'] as const,
};

/** fetchTimers(true, ..., module): the module's running timers. */
export function activeTimersQueryOptions(module: Exclude<TimerModule, 'linear_cutting'>) {
  return queryOptions({
    queryKey: timerKeys.active(module),
    queryFn: async ({ signal }) =>
      extractResults<Timer>(
        await apiFetch<unknown>(`/${module}/timers/`, { params: { is_active: true }, signal }),
      ),
  });
}

/**
 * listLinearCuttingTimers, kept to the running ones. Legacy listed every timer
 * and dropped finished ones on the client; is_active narrows the request so a
 * first page full of finished timers can't hide the running ones.
 */
export function linearActiveTimersQueryOptions() {
  return queryOptions({
    queryKey: timerKeys.active('linear_cutting'),
    queryFn: async ({ signal }) =>
      extractResults<Timer>(
        await apiFetch<unknown>('/linear_cutting/timers/', { params: { is_active: true }, signal }),
      ).filter((timer) => !timer.finish_time),
  });
}

/** listLinearCuttingTasks({ page_size: 1 }).count: the dashboard's "Toplam Görev". */
export function linearTaskCountQueryOptions() {
  return queryOptions({
    queryKey: ['linearCuttingTasks', 'count'],
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(
        await apiFetch<unknown>('/linear_cutting/tasks/', { params: { page_size: 1 }, signal }),
      ).count,
  });
}

/** stopTimer / stopLinearCuttingTimer. finish_time is epoch ms. */
export function stopTimer(module: TimerModule, timerId: number, finishTime: number) {
  const body: Record<string, unknown> = { timer_id: timerId, finish_time: finishTime };
  // The linear cutting form always sends an (empty) comment.
  if (module === 'linear_cutting') body.comment = '';
  return apiFetch<unknown>(`/${module}/timers/stop/`, { method: 'POST', body });
}

/** `/tasks/operations/<key>/?view=detail` (machining operation). */
export interface MachiningOperation {
  key: string;
  name?: string | null;
  order?: number | string | null;
  machine_name?: string | null;
  description?: string | null;
  part_key?: string | null;
  part_name?: string | null;
  part_job_no?: string | null;
  part_task_key?: string | null;
  part_image_no?: string | null;
  part_position_no?: string | null;
  part_quantity?: number | string | null;
  part_completion_date?: string | number | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  has_active_timer?: boolean;
  completion_date?: string | number | null;
  due_date?: string | null;
  due_source?: 'part' | 'job_order' | string | null;
  projected_late?: boolean;
  planned_start_ms?: number | null;
  planned_end_ms?: number | null;
  plan_locked?: boolean;
  in_plan?: boolean;
  plan_order?: number | string | null;
  operation_tools?: { tool_name?: string; tool_code?: string; quantity?: number }[];
  created_by_username?: string | null;
  created_at?: string | null;
  completed_by_username?: string | null;
  [key: string]: unknown;
}

export function operationQueryOptions(key: string) {
  return queryOptions({
    queryKey: ['machiningOperations', 'detail', key],
    queryFn: ({ signal }) =>
      apiFetch<MachiningOperation>(`/tasks/operations/${encodeURIComponent(key)}/`, {
        params: { view: 'detail' },
        signal,
      }),
  });
}

export interface CncTaskFile {
  id?: number;
  file_url: string;
  file_name?: string | null;
  [key: string]: unknown;
}

export interface CncTaskPart {
  id?: number;
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
  weight_kg?: number | string | null;
  [key: string]: unknown;
}

/** `/cnc_cutting/tasks/<key>/`. */
export interface CncTask {
  key: string;
  name?: string | null;
  nesting_id?: string | null;
  material?: string | null;
  thickness_mm?: number | string | null;
  dimensions?: string | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  machine_name?: string | null;
  files?: CncTaskFile[];
  parts?: CncTaskPart[];
  [key: string]: unknown;
}

export function cncTaskQueryOptions(key: string) {
  return queryOptions({
    queryKey: ['cncTasks', 'detail', key],
    queryFn: ({ signal }) =>
      apiFetch<CncTask>(`/cnc_cutting/tasks/${encodeURIComponent(key)}/`, { signal }),
  });
}
