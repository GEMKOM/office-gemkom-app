import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// Capacity planning: the CNC / linear cutting planners (apis/machining/
// capacityPlanning.js getCapacityPlanning, updateCapacityPlanning), the
// machining operation queue (apis/machining/operations.js) and machine
// calendars (apis/machines.js getMachineCalendar).

export type CuttingModule = 'cnc_cutting' | 'linear_cutting';

/** A row of `/<module>/planning/list/` as the cutting planners read it. */
export interface CuttingPlanTask {
  key: string;
  name?: string | null;
  in_plan?: boolean;
  plan_order?: number | null;
  plan_locked?: boolean;
  planned_start_ms?: number | null;
  planned_end_ms?: number | null;
  machine_fk?: number | null;
  estimated_hours?: number | string | null;
  remaining_hours?: number | string | null;
  /** Due date (ISO or "YYYY-MM-DD"). */
  finish_time?: string | null;
  // CNC
  nesting_id?: string | null;
  thickness_mm?: number | string | null;
  quantity?: number | string | null;
  material?: string | null;
  dimensions?: string | null;
  // Linear cutting
  item_name?: string | null;
  session?: string | null;
  [key: string]: unknown;
}

/** Filters the cutting planners send to the list endpoint (unset ones are left out). */
export type CuttingPlanFilters = Record<string, string>;

export const capacityKeys = {
  all: ['capacityPlanning'] as const,
  cutting: (module: CuttingModule, machineId: string, filters: CuttingPlanFilters) =>
    ['capacityPlanning', module, machineId, filters] as const,
  machining: (machineId: string) => ['capacityPlanning', 'machining', machineId] as const,
  calendar: (machineId: string) => ['machineCalendar', machineId] as const,
};

/** The list endpoint answers a bare array, `{ tasks: [...] }` (linear) or a DRF page. */
function planRows<T>(data: unknown): T[] {
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Array.isArray((data as { tasks?: unknown }).tasks)
  ) {
    return (data as { tasks: T[] }).tasks;
  }
  return extractResults<T>(data);
}

/** getCapacityPlanning(machine_id, module, filters): GET /<module>/planning/list/?…&machine_fk= */
export function cuttingPlanQueryOptions(
  module: CuttingModule,
  machineId: string,
  filters: CuttingPlanFilters,
) {
  return queryOptions({
    queryKey: capacityKeys.cutting(module, machineId, filters),
    queryFn: async ({ signal }) =>
      planRows<CuttingPlanTask>(
        await apiFetch<unknown>(`/${module}/planning/list/`, {
          params: { ...filters, machine_fk: machineId },
          signal,
        }),
      ),
    enabled: Boolean(machineId),
  });
}

/** One item of the bulk-save payload, built exactly as legacy savePlan does. */
export interface CuttingPlanSaveItem {
  key: string;
  in_plan: boolean;
  machine_fk?: number;
  name?: string;
  planned_start_ms?: number;
  planned_end_ms?: number;
  plan_order?: number;
  plan_locked?: boolean;
}

/** updateCapacityPlanning(data, module): POST /<module>/planning/bulk-save/ { items } */
export function saveCuttingPlan(module: CuttingModule, items: CuttingPlanSaveItem[]) {
  return apiFetch<unknown>(`/${module}/planning/bulk-save/`, { method: 'POST', body: { items } });
}

// ---- machining operations queue ----

/** A row of `/tasks/operations/` as the machining planner reads it. */
export interface MachiningPlanOperation {
  key: string;
  name?: string | null;
  part_name?: string | null;
  part_job_no?: string | null;
  due_date?: string | null;
  due_source?: 'part' | 'job_order' | string | null;
  slack_hours?: number | string | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  planned_start_ms?: number | null;
  planned_end_ms?: number | null;
  projected_late?: boolean;
  is_running?: boolean;
  plan_flags?: string[] | null;
  plan_locked?: boolean;
  in_plan?: boolean;
  plan_order?: number | null;
  [key: string]: unknown;
}

/** getOperations({ machine_fk, completion_date__isnull: 'true', page_size: 1000 }) */
export function machiningPlanQueryOptions(machineId: string) {
  return queryOptions({
    queryKey: capacityKeys.machining(machineId),
    queryFn: async ({ signal }) =>
      extractResults<MachiningPlanOperation>(
        await apiFetch<unknown>('/tasks/operations/', {
          params: { machine_fk: machineId, completion_date__isnull: 'true', page_size: 1000 },
          signal,
        }),
      ),
    enabled: Boolean(machineId),
  });
}

export interface MachiningPlanSaveItem {
  key: string;
  in_plan: true;
  plan_order?: number;
  plan_locked?: true;
}

/** bulkSaveOperationsPlanning(array): PUT /tasks/operations/planning/bulk-save/ (bare array). */
export function saveMachiningPlan(items: MachiningPlanSaveItem[]) {
  return apiFetch<unknown>('/tasks/operations/planning/bulk-save/', { method: 'PUT', body: items });
}

/** updateOperation(key, { estimated_hours }): PATCH /tasks/operations/<key>/ */
export function patchOperationEstimate(key: string, estimatedHours: number | null) {
  return apiFetch<unknown>(`/tasks/operations/${encodeURIComponent(key)}/`, {
    method: 'PATCH',
    body: { estimated_hours: estimatedHours },
  });
}

/** lockOperation / unlockOperation: POST /tasks/operations/<key>/lock|unlock/ */
export function setOperationLock(key: string, locked: boolean) {
  return apiFetch<unknown>(
    `/tasks/operations/${encodeURIComponent(key)}/${locked ? 'lock' : 'unlock'}/`,
    {
      method: 'POST',
    },
  );
}

export interface RescheduleResult {
  scheduled?: number;
  late_parts?: unknown[];
  flags?: { estimate_missing?: unknown; due_missing?: unknown };
  [key: string]: unknown;
}

/** rescheduleMachiningPlan(): POST /tasks/operations/planning/reschedule/ */
export function rescheduleMachiningPlan() {
  return apiFetch<RescheduleResult>('/tasks/operations/planning/reschedule/', { method: 'POST' });
}

// ---- machine calendar ----

export interface MachineCalendarResponse {
  week_template?: Record<string, { start: string; end: string; end_next_day?: boolean }[]> | null;
  work_exceptions?: { date: string; windows: { start: string; end: string }[] }[] | null;
  [key: string]: unknown;
}

/** getMachineCalendar(id): GET /machines/calendar?machine_fk= (no trailing slash, as legacy). */
export function machineCalendarQueryOptions(machineId: string) {
  return queryOptions({
    queryKey: capacityKeys.calendar(machineId),
    queryFn: ({ signal }) =>
      apiFetch<MachineCalendarResponse>('/machines/calendar', {
        params: { machine_fk: machineId },
        signal,
      }),
    enabled: Boolean(machineId) && machineId !== 'all',
    staleTime: 10 * 60_000,
  });
}
