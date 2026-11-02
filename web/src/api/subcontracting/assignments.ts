import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { extractResults } from '../types';

// Port of apis/subcontracting/assignments.js and the price tier list of
// apis/subcontracting/priceTiers.js, as the department task pages use them.

export interface SubcontractingAssignment {
  id: number;
  subcontractor?: number | null;
  subcontractor_name?: string | null;
  price_tier?: number | null;
  price_tier_name?: string | null;
  price_per_kg?: number | string | null;
  cost_currency?: string | null;
  allocated_weight_kg?: number | string | null;
  current_progress?: number | string | null;
  last_billed_progress?: number | string | null;
  unbilled_progress?: number | string | null;
  unbilled_weight_kg?: number | string | null;
  unbilled_cost?: number | string | null;
  subtask_title?: string | null;
  subtask_weight?: number | string | null;
  subtask?:
    { id?: number; title?: string; weight?: number | string; parent?: number } | number | null;
  [key: string]: unknown;
}

export interface PriceTier {
  id: number;
  name: string;
  price_per_kg?: number | string;
  currency?: string;
  remaining_weight_kg?: number | string | null;
  [key: string]: unknown;
}

export const assignmentKeys = {
  all: ['subcontractingAssignments'] as const,
  list: (params: QueryParams) =>
    ['subcontractingAssignments', 'list', cleanParams(params)] as const,
  priceTiers: (params: QueryParams) =>
    ['subcontractingPriceTiers', 'list', cleanParams(params)] as const,
};

/** Legacy fetchAssignments: the filters as-is; a bare array or a page. */
export function assignmentsQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: assignmentKeys.list(params),
    queryFn: async ({ signal }) =>
      extractResults<SubcontractingAssignment>(
        await apiFetch<unknown>('/subcontracting/assignments/', { params, signal }),
      ),
    staleTime: 0,
  });
}

export function fetchAssignment(id: number) {
  return apiFetch<SubcontractingAssignment>(`/subcontracting/assignments/${id}/`);
}

/** Legacy fetchPriceTiers({ job_order }). */
export function priceTiersQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: assignmentKeys.priceTiers(params),
    queryFn: async ({ signal }) =>
      extractResults<PriceTier>(
        await apiFetch<unknown>('/subcontracting/price-tiers/', { params, signal }),
      ),
    staleTime: 0,
  });
}

export function createAssignmentWithSubtask(data: Record<string, unknown>) {
  return apiFetch<unknown>('/subcontracting/assignments/create-with-subtask/', {
    method: 'POST',
    body: data,
  });
}

export function updateAssignmentWithEndpoint(id: number, data: Record<string, unknown>) {
  return apiFetch<unknown>(`/subcontracting/assignments/${id}/update-assignment/`, {
    method: 'PATCH',
    body: data,
  });
}

export function deleteAssignment(id: number) {
  return apiFetch<void>(`/subcontracting/assignments/${id}/`, { method: 'DELETE' });
}
