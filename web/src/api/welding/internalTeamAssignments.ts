import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { extractResults } from '../types';

// Port of apis/welding/internalTeamAssignments.js.

export interface InternalTeamAssignment {
  id: number;
  team?: number | { id?: number; name?: string; foreman_name?: string; foreman_full_name?: string; foreman?: { full_name?: string; username?: string }; members?: unknown[] } | null;
  team_name?: string | null;
  team_display?: string | null;
  team_foreman_name?: string | null;
  foreman_name?: string | null;
  team_members_count?: number | null;
  members_count?: number | null;
  allocated_weight_kg?: number | string | null;
  current_progress?: number | string | null;
  progress?: number | string | null;
  manual_progress?: number | string | null;
  department_task_manual_progress?: number | string | null;
  status?: string | null;
  status_display?: string | null;
  department_task_status?: string | null;
  department_task_status_display?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface WeightSummary {
  total_weight_kg?: number | string | null;
  remaining_weight_kg?: number | string | null;
  [key: string]: unknown;
}

export const internalTeamKeys = {
  all: ['internalTeamAssignments'] as const,
  list: (params: QueryParams) => ['internalTeamAssignments', 'list', cleanParams(params)] as const,
  weightSummary: (taskId: number) => ['internalTeamAssignments', 'weightSummary', taskId] as const,
};

export function internalTeamAssignmentsQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: internalTeamKeys.list(params),
    queryFn: async ({ signal }) =>
      extractResults<InternalTeamAssignment>(
        await apiFetch<unknown>('/welding/internal-team-assignments/', { params, signal }),
      ),
    staleTime: 0,
  });
}

export function weightSummaryQueryOptions(weldingTaskId: number) {
  return queryOptions({
    queryKey: internalTeamKeys.weightSummary(weldingTaskId),
    queryFn: ({ signal }) =>
      apiFetch<WeightSummary>('/welding/internal-team-assignments/weight-summary/', {
        params: { welding_task_id: weldingTaskId },
        signal,
      }),
    staleTime: 0,
  });
}

export function createInternalTeamAssignmentWithSubtask(data: Record<string, unknown>) {
  return apiFetch<unknown>('/welding/internal-team-assignments/create-with-subtask/', { method: 'POST', body: data });
}

export function updateInternalTeamAssignmentWithEndpoint(id: number, data: Record<string, unknown>) {
  return apiFetch<unknown>(`/welding/internal-team-assignments/${id}/update-assignment/`, {
    method: 'PATCH',
    body: data,
  });
}

export function deleteInternalTeamAssignmentWithSubtask(id: number) {
  return apiFetch<void>(`/welding/internal-team-assignments/${id}/delete-with-subtask/`, { method: 'DELETE' });
}
