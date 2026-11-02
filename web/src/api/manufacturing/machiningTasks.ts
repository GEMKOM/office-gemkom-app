import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { toPaginated } from '../types';

// Port of the apis/tasks.js calls the machining "Görev Oluştur" page makes:
// GET /machining/tasks/ and POST /machining/tasks/bulk-create/.

export interface MachiningTask {
  key: string;
  name?: string | null;
  description?: string | null;
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
  quantity?: number | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  finish_time?: string | null;
  planned_end_ms?: number | null;
  completion_date?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface MachiningTaskInput {
  name: string;
  job_no: string;
  image_no: string | null;
  position_no: string | null;
  quantity: number | null;
  finish_time: string;
  description: string | null;
}

export const machiningTaskKeys = {
  all: ['machiningTasks'] as const,
  list: (params: QueryParams) => ['machiningTasks', 'list', cleanParams(params)] as const,
};

/** Legacy fetchTasks(query): the filters as query params. */
export function machiningTasksQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: machiningTaskKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<MachiningTask>(await apiFetch<unknown>('/machining/tasks/', { params, signal })),
    staleTime: 30_000,
  });
}

/** Legacy bulkCreateTasks: an array of tasks; the backend answers with the created tasks. */
export function bulkCreateMachiningTasks(tasks: MachiningTaskInput[]) {
  return apiFetch<unknown>('/machining/tasks/bulk-create/', { method: 'POST', body: tasks });
}
