import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiFetch, type QueryParams } from '../client';
import { toPaginated } from '../types';

// Machining parts (Talaşlı İmalat "Parça" / "Görev"): port of apis/machining/parts.js
// and the operation calls of apis/machining/operations.js that the parts pages use.

/** One job-order allocation of a part (`job_allocations` rows). */
export interface PartJobAllocation {
  job_no: string;
  quantity: number | null;
  /** 0..1, server-computed. */
  share?: number | null;
}

export interface PartFile {
  id: number;
  file_name?: string | null;
  file_url?: string | null;
  uploaded_at?: string | null;
  uploaded_by_username?: string | null;
  [key: string]: unknown;
}

export interface PlanSummary {
  due_date?: string | null;
  due_source?: 'part' | 'job_order' | string | null;
  projected_finish_ms?: number | null;
  projected_late?: boolean;
  flags?: string[] | Record<string, boolean> | null;
  [key: string]: unknown;
}

/** A row of `/tasks/parts/`. */
export interface MachiningPart {
  key: string;
  task_key?: string | null;
  name: string;
  description?: string | null;
  /** Display label: "254-01" or "254-01 +2" when split across job orders. */
  job_no?: string | null;
  job_no_primary?: string | null;
  job_allocations?: PartJobAllocation[] | null;
  is_multi_job?: boolean;
  image_no?: string | null;
  position_no?: string | null;
  /** Total across every job order. */
  quantity?: number | null;
  material?: string | null;
  dimensions?: string | null;
  weight_kg?: number | string | null;
  finish_time?: string | null;
  operation_count?: number | null;
  incomplete_operation_count?: number | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  planned_end_ms?: number | null;
  completion_date?: string | null;
  created_at?: string | null;
  files?: PartFile[] | null;
  is_locked?: boolean;
  department_request_id?: number | null;
  department_request_number?: string | null;
  plan_summary?: PlanSummary | null;
  operations?: PartOperation[];
  [key: string]: unknown;
}

/** A row of `/tasks/operations/`. */
export interface PartOperation {
  key: string;
  name?: string | null;
  description?: string | null;
  order?: number | null;
  machine_fk?: number | null;
  machine_name?: string | null;
  estimated_hours?: number | string | null;
  total_hours_spent?: number | string | null;
  interchangeable?: boolean;
  completion_date?: string | number | null;
  planned_start_ms?: number | null;
  planned_end_ms?: number | null;
  plan_locked?: boolean;
  [key: string]: unknown;
}

export interface PartsStats {
  parts_with_unassigned_operations?: number;
  parts_with_unplanned_operations?: number;
  parts_without_operations?: number;
  total_parts?: number;
  total_operations?: number;
}

export interface PartCost {
  part_key?: string;
  currency?: string | null;
  total_quantity?: number | null;
  unit_cost?: number | string | null;
  total_cost?: number | string | null;
  hours?: { total?: number | string | null } | null;
  job_allocations?: (PartJobAllocation & {
    hours?: { total?: number | string | null } | null;
    total_cost?: number | string | null;
  })[];
}

export type PartsParams = {
  key?: string;
  name?: string;
  job_no?: string;
  image_no?: string;
  position_no?: string;
  created_by?: string;
  completion_date__isnull?: 'true' | 'false';
  has_operations?: 'false';
  has_unassigned_operations?: 'true';
  has_unplanned_operations?: 'true';
  finish_time?: string;
  finish_time__gte?: string;
  finish_time__lte?: string;
  has_timer?: 'true';
  exceeded_estimated_hours?: 'true';
  page?: number;
  page_size?: number;
  ordering?: string;
};

/** Fields the inline editor and the create modal send. */
export type PartInput = {
  name?: string;
  description?: string | null;
  job_no?: string | null;
  quantity?: number | null;
  job_allocations?: { job_no: string; quantity: number }[];
  image_no?: string | null;
  position_no?: string | null;
  material?: string | null;
  dimensions?: string | null;
  weight_kg?: number | null;
  finish_time?: string | null;
  operations?: OperationInput[];
};

export interface OperationInput {
  key?: string;
  name: string;
  description: string | null;
  order: number;
  machine_fk: number;
  estimated_hours: number | null;
  interchangeable: boolean;
}

export interface BulkCreateResponse {
  created?: number;
  parts?: MachiningPart[];
  [key: string]: unknown;
}

export interface ManualTimeInput {
  task_key: string;
  user: number;
  machine_fk: number;
  start_time: number;
  finish_time: number;
  comment?: string;
}

export const partsKeys = {
  all: ['machiningParts'] as const,
  list: (params: PartsParams) => ['machiningParts', 'list', params] as const,
  detail: (key: string) => ['machiningParts', 'detail', key] as const,
  stats: ['machiningParts', 'stats'] as const,
  operations: (partKey: string) => ['machiningParts', 'operations', partKey] as const,
  cost: (partKey: string) => ['machiningParts', 'cost', partKey] as const,
};

const BASE = '/tasks/parts/';

// ---- queries ------------------------------------------------------------------

/** Legacy getParts. */
export function partsQueryOptions(params: PartsParams) {
  return queryOptions({
    queryKey: partsKeys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<MachiningPart>(
        await apiFetch<unknown>(BASE, { params: params as QueryParams, signal }),
      ),
  });
}

/** Legacy getPart (the detail carries plan_summary). */
export function fetchPart(key: string, signal?: AbortSignal): Promise<MachiningPart> {
  return apiFetch<MachiningPart>(`${BASE}${encodeURIComponent(key)}/`, { signal });
}

/** Legacy getPartsStats. */
export function partsStatsQueryOptions() {
  return queryOptions({
    queryKey: partsKeys.stats,
    queryFn: ({ signal }) => apiFetch<PartsStats>(`${BASE}stats/`, { signal }),
  });
}

/** Legacy getOperations({ part_key }). */
export function fetchPartOperations(partKey: string, signal?: AbortSignal) {
  return apiFetch<unknown>('/tasks/operations/', { params: { part_key: partKey }, signal }).then(
    (data) => toPaginated<PartOperation>(data).results,
  );
}

/**
 * Operations of a part plus its detail for plan_summary; a failed detail fetch
 * is not fatal (legacy showPartDetails).
 */
export function partDetailsQueryOptions(partKey: string) {
  return queryOptions({
    queryKey: partsKeys.operations(partKey),
    queryFn: async ({ signal }) => {
      const [operations, detail] = await Promise.all([
        fetchPartOperations(partKey, signal),
        fetchPart(partKey, signal).catch(() => null),
      ]);
      return { operations, detail };
    },
    staleTime: 0,
  });
}

/** Legacy getPartCost; a 403 means the user may not see costs. */
export function partCostQueryOptions(partKey: string) {
  return queryOptions({
    queryKey: partsKeys.cost(partKey),
    queryFn: ({ signal }) =>
      apiFetch<PartCost>(`${BASE}${encodeURIComponent(partKey)}/cost/`, { signal }),
    retry: false,
  });
}

// ---- mutations ------------------------------------------------------------------

/** Legacy updatePart (PATCH). */
export function updatePart(key: string, data: PartInput): Promise<MachiningPart> {
  return apiFetch<MachiningPart>(`${BASE}${encodeURIComponent(key)}/`, {
    method: 'PATCH',
    body: data,
  });
}

export function deletePart(key: string): Promise<void> {
  return apiFetch<void>(`${BASE}${encodeURIComponent(key)}/`, { method: 'DELETE' });
}

/** Legacy createPart (part with nested operations). */
export function createPart(data: PartInput): Promise<MachiningPart> {
  return apiFetch<MachiningPart>(BASE, { method: 'POST', body: data });
}

type BulkFailure = { index?: number; errors?: Record<string, unknown> };

/**
 * Legacy bulkCreateParts: aborts after 90 s so the page can recover, and turns
 * a `failures` body into "Item n: field: message" lines.
 */
export async function bulkCreateParts(parts: PartInput[]): Promise<BulkCreateResponse> {
  if (parts.length === 0) throw new Error('partsData must be a non-empty array');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    return await apiFetch<BulkCreateResponse>(`${BASE}bulk-create/`, {
      method: 'POST',
      body: parts,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ApiError && error.data && typeof error.data === 'object') {
      const failures = (error.data as { failures?: unknown }).failures;
      if (Array.isArray(failures)) {
        const lines = (failures as BulkFailure[]).map((failure, idx) => {
          const index = failure.index !== undefined ? failure.index : idx;
          const messages = Object.entries(failure.errors ?? {})
            .map(
              ([field, value]) =>
                `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
            )
            .join('; ');
          return `Item ${index + 1}: ${messages || 'Unknown error'}`;
        });
        throw new Error(`Bulk creation failed:\n${lines.join('\n')}`, { cause: error });
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Legacy updatePartOperations. */
export function updatePartOperations(
  partKey: string,
  data: { operations: OperationInput[]; delete_operations: string[] },
): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}${encodeURIComponent(partKey)}/update_operations/`, {
    method: 'POST',
    body: data,
  });
}

/** Legacy uploadPartFiles: multipart, one `files` entry per file. */
export function uploadPartFiles(partKey: string, files: readonly File[]): Promise<unknown> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  return apiFetch<unknown>(`${BASE}${encodeURIComponent(partKey)}/add-file/`, {
    method: 'POST',
    body: form,
  });
}

export function deletePartFile(fileId: number | string): Promise<void> {
  return apiFetch<void>(`/tasks/files/${fileId}/`, { method: 'DELETE' });
}

export interface ConvertRequestInput {
  title: string;
  priority: string;
  needed_date: string | null;
  description: string;
}

export function convertPartsToDepartmentRequest(
  partKeys: string[],
  data: ConvertRequestInput,
): Promise<{ id: number; request_number?: string }> {
  return apiFetch(`${BASE}convert-to-department-request/`, {
    method: 'POST',
    body: { part_keys: partKeys, ...data },
  });
}

export function markOperationCompleted(operationKey: string): Promise<unknown> {
  return apiFetch(`/tasks/operations/${encodeURIComponent(operationKey)}/mark_completed/`, {
    method: 'POST',
  });
}

export function unmarkOperationCompleted(operationKey: string): Promise<unknown> {
  return apiFetch(`/tasks/operations/${encodeURIComponent(operationKey)}/unmark_completed/`, {
    method: 'POST',
  });
}

/** Legacy createManualTimeEntry. */
export function createManualTimeEntry(data: ManualTimeInput): Promise<{ id?: number }> {
  return apiFetch(`/machining/manual-time/`, { method: 'POST', body: data });
}
