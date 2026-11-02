import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { REFERENCE_STALE_TIME } from '../reference/shared';
import { extractResults, toPaginated } from '../types';

// Port of apis/linear_cutting/tasks.js (the bar tasks of a cutting plan).

/** One piece on a bar, as the optimizer laid it out. */
export interface LinearCut {
  label?: string;
  job_no?: string;
  nominal_mm?: number | null;
  effective_mm?: number | null;
  offset_mm?: number | null;
  end_mm?: number | null;
  angle_left_deg?: number | null;
  angle_right_deg?: number | null;
  flipped?: boolean;
  requires_bending?: boolean;
  shared_left?: boolean;
  shared_right?: boolean;
  [key: string]: unknown;
}

/** One saw pass (the operator's cut order). */
export interface LinearPass {
  seq: number;
  kind?: string;
  angle_deg?: number | null;
  stop_near_mm?: number | null;
  stop_far_mm?: number | null;
  releases?: string | null;
  [key: string]: unknown;
}

export interface LinearCuttingTask {
  key: string;
  name?: string;
  session?: string;
  session_title?: string;
  item_name?: string;
  item_code?: string;
  material?: string;
  bar_index?: number | null;
  stock_length_mm?: number | null;
  waste_mm?: number | null;
  kerf_mm?: number | string | null;
  is_remnant_bar?: boolean;
  machine_fk?: number | null;
  machine_name?: string | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  completion_date?: string | null;
  description?: string;
  layout_json?: LinearCut[] | null;
  passes_json?: LinearPass[] | null;
  [key: string]: unknown;
}

export type LinearCuttingTasksParams = {
  page?: number;
  page_size?: number;
  session?: string;
  completed?: string;
  ordering?: string;
};

export interface LinearCuttingTaskPatch {
  machine_fk: number | null;
  estimated_hours: number | null;
  description: string;
}

export const lcTaskKeys = {
  all: ['linearCuttingTasks'] as const,
  list: (params: QueryParams) => ['linearCuttingTasks', 'list', cleanParams(params)] as const,
  detail: (key: string) => ['linearCuttingTasks', 'detail', key] as const,
};

const taskPath = (key: string) => `/linear_cutting/tasks/${encodeURIComponent(key)}/`;

export function linearCuttingTasksQueryOptions(params: LinearCuttingTasksParams) {
  return queryOptions({
    queryKey: lcTaskKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<LinearCuttingTask>(
        await apiFetch<unknown>('/linear_cutting/tasks/', { params, signal }),
      ),
  });
}

export function linearCuttingTaskQueryOptions(key: string) {
  return queryOptions({
    queryKey: lcTaskKeys.detail(key),
    queryFn: ({ signal }) => apiFetch<LinearCuttingTask>(taskPath(key), { signal }),
  });
}

/** Reads a task `linearCuttingTaskQueryOptions` already loaded (and keeps it fresh). */
export function useLinearCuttingTask(key: string | null) {
  return useQuery({ ...linearCuttingTaskQueryOptions(key ?? ''), enabled: Boolean(key) });
}

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: lcTaskKeys.all });
}

export function usePatchLinearCuttingTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ key, data }: { key: string; data: LinearCuttingTaskPatch }) =>
      apiFetch<LinearCuttingTask>(taskPath(key), { method: 'PATCH', body: data }),
    onSuccess: () => invalidate(),
  });
}

/** mark-completed / unmark-completed. */
export function useSetLinearCuttingTaskCompleted() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ key, completed }: { key: string; completed: boolean }) =>
      apiFetch<unknown>(`/linear_cutting/tasks/${completed ? 'mark' : 'unmark'}-completed/`, {
        method: 'POST',
        body: { key },
      }),
    onSuccess: () => invalidate(),
  });
}

export interface MachineDropdownItem {
  id: number;
  name: string;
  [key: string]: unknown;
}

/** apis/machines.js fetchMachinesDropdown('linear_cutting'). */
export function useLinearCuttingMachines() {
  const params = { used_in: 'linear_cutting' };
  return useQuery({
    queryKey: ['machines', 'dropdown', params] as const,
    queryFn: async ({ signal }) =>
      extractResults<MachineDropdownItem>(
        await apiFetch<unknown>('/machines/dropdown/', { params, signal }),
      ),
    staleTime: REFERENCE_STALE_TIME,
  });
}
