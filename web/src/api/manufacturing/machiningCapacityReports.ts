import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// The machining capacity reports (apis/machining/capacityPlanning.js
// getMachineTimeline, getProductionPlanOverview, getMachineProductionPlan and
// apis/tasks.js fetchTaskById).

export interface TimelineSegment {
  start_ms: number;
  end_ms: number;
  /** 'work' | 'hold' | 'idle' */
  category?: string | null;
  task_key?: string | null;
  task_name?: string | null;
  is_hold?: boolean;
  timer_id?: number | null;
  machine_name?: string | null;
  machine_id?: number | string | null;
}

export interface TimelineTotals {
  productive_seconds?: number;
  hold_seconds?: number;
  idle_seconds?: number;
}

export interface TimelineMachine {
  machine_id: number | string;
  machine_name?: string | null;
  segments?: TimelineSegment[];
  totals?: TimelineTotals;
}

/** `/machining/analytics/machine-timeline/`; older servers sent `segments` or a task array. */
export type MachineTimelineResponse =
  | { machines: TimelineMachine[]; overall_totals?: TimelineTotals | null }
  | { segments: TimelineSegment[]; totals?: TimelineTotals; overall_totals?: TimelineTotals | null }
  | { key: string; name?: string; total_hours_spent?: number }[];

/** getMachineTimeline(machine_fk ('all' for every machine), start_after, start_before). */
export function machineTimelineQueryOptions(
  machineId: string,
  startAfter: number,
  startBefore: number,
) {
  return queryOptions({
    queryKey: ['machiningReports', 'timeline', machineId, startAfter, startBefore] as const,
    queryFn: ({ signal }) =>
      apiFetch<MachineTimelineResponse>('/machining/analytics/machine-timeline/', {
        params: { machine_fk: machineId, start_after: startAfter, start_before: startBefore },
        signal,
      }),
    enabled: Boolean(machineId),
  });
}

export interface ProductionPlanMachine {
  machine_id: number;
  machine_name?: string | null;
  machine_type_label?: string | null;
  totals?: {
    total_estimated_hours?: number | null;
    latest_planned_end_ms?: number | null;
    task_count?: number | null;
  };
}

export interface ProductionPlanOverview {
  machines: ProductionPlanMachine[];
  overall_totals?: {
    total_estimated_hours?: number | null;
    latest_planned_end_ms?: number | null;
    task_count?: number | null;
  } | null;
}

/** getProductionPlanOverview(): GET /machining/planning/overview/ */
export function productionPlanOverviewQueryOptions() {
  return queryOptions({
    queryKey: ['machiningReports', 'overview'] as const,
    queryFn: ({ signal }) =>
      apiFetch<ProductionPlanOverview>('/machining/planning/overview/', { signal }),
  });
}

/** A task of `/machining/reports/production-plan/` (and `/machining/tasks/<key>/`). */
export interface ProductionPlanTask {
  key: string;
  name?: string | null;
  title?: string | null;
  planned_start_ms?: number | null;
  planned_end_ms?: number | null;
  actual_start_ms?: number | null;
  completion_date?: number | string | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | null;
  is_hold?: boolean;
  category?: string | null;
  plan_order?: number | null;
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
  quantity?: number | string | null;
  machine_name?: string | null;
  completed_by_username?: string | null;
  finish_time?: string | null;
  [key: string]: unknown;
}

/** getMachineProductionPlan(machine_id): GET /machining/reports/production-plan/?machine_fk= */
export function machineProductionPlanQueryOptions(machineId: number | string) {
  return queryOptions({
    queryKey: ['machiningReports', 'productionPlan', String(machineId)] as const,
    queryFn: ({ signal }) =>
      apiFetch<ProductionPlanTask[]>('/machining/reports/production-plan/', {
        params: { machine_fk: machineId },
        signal,
      }),
  });
}

/** fetchTaskById(key): GET /machining/tasks/<key>/ */
export function machiningTaskQueryOptions(key: string) {
  return queryOptions({
    queryKey: ['machiningReports', 'task', key] as const,
    queryFn: ({ signal }) =>
      apiFetch<ProductionPlanTask>(`/machining/tasks/${encodeURIComponent(key)}/`, { signal }),
  });
}
