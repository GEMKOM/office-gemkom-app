import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { toPaginated } from '../types';

// Port of apis/welding/crud.js (the /welding/time-entries/ resource).

export type OvertimeType = 'regular' | 'after_hours' | 'holiday';

/** An employee as the backend may nest it in a time entry row. */
export interface TimeEntryEmployee {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  [key: string]: unknown;
}

/** A /welding/time-entries/ row; the employee comes as an id or nested. */
export interface WeldingTimeEntry {
  id: number;
  employee?: number | TimeEntryEmployee | null;
  employee_id?: number | null;
  employee_username?: string | null;
  employee_full_name?: string | null;
  job_no?: string | null;
  date?: string | null;
  hours?: number | string | null;
  overtime_type?: OvertimeType | string | null;
  description?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

/** PATCH body and one bulk-create entry, as legacy sent them. */
export interface WeldingTimeEntryInput {
  employee: number;
  job_no: string;
  date: string;
  hours: number;
  overtime_type: string;
  description: string;
}

export interface BulkCreateResponse {
  created_count?: number;
  entries?: WeldingTimeEntry[];
  [key: string]: unknown;
}

export type WeldingTimeEntriesParams = {
  employee?: number;
  employee_username?: string;
  job_no?: string;
  description?: string;
  date?: string;
  date_after?: string;
  date_before?: string;
  hours_min?: number;
  hours_max?: number;
  overtime_type?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const weldingTimeEntryKeys = {
  all: ['weldingTimeEntries'] as const,
  list: (params: WeldingTimeEntriesParams = {}) => ['weldingTimeEntries', 'list', params] as const,
};

/** Legacy fetchWeldingTimeEntries: GET /welding/time-entries/ with the filters as-is. */
export function fetchWeldingTimeEntries(
  params: WeldingTimeEntriesParams = {},
  signal?: AbortSignal,
) {
  return apiFetch<unknown>('/welding/time-entries/', { params, signal }).then((data) =>
    toPaginated<WeldingTimeEntry>(data),
  );
}

export function weldingTimeEntriesQueryOptions(params: WeldingTimeEntriesParams = {}) {
  return queryOptions({
    queryKey: weldingTimeEntryKeys.list(params),
    queryFn: ({ signal }) => fetchWeldingTimeEntries(params, signal),
  });
}

/** Legacy updateWeldingTimeEntry (PATCH). */
export function patchWeldingTimeEntry(
  id: number | string,
  data: Partial<WeldingTimeEntryInput>,
): Promise<WeldingTimeEntry> {
  return apiFetch<WeldingTimeEntry>(`/welding/time-entries/${id}/`, {
    method: 'PATCH',
    body: data,
  });
}

/** Legacy deleteWeldingTimeEntry. */
export function deleteWeldingTimeEntry(id: number | string): Promise<void> {
  return apiFetch<void>(`/welding/time-entries/${id}/`, { method: 'DELETE' });
}

/** Legacy bulkCreateWeldingTimeEntries: POST /welding/time-entries/bulk-create/. */
export function bulkCreateWeldingTimeEntries(data: {
  entries: WeldingTimeEntryInput[];
}): Promise<BulkCreateResponse> {
  return apiFetch<BulkCreateResponse>('/welding/time-entries/bulk-create/', {
    method: 'POST',
    body: data,
  });
}

/**
 * The message legacy crud.js put on its errors: `errors` (an array joined
 * with ', '), else `error`, else `detail`, else the fallback.
 */
export function weldingTimeEntryErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const body = error.data as Record<string, unknown>;
    const message = body.errors || body.error || body.detail;
    if (Array.isArray(message)) {
      const parts = message.map((m) => (typeof m === 'string' ? m : JSON.stringify(m)));
      if (parts.length > 0) return parts.join(', ');
    } else if (typeof message === 'string' && message) {
      return message;
    } else if (message && typeof message === 'object') {
      return JSON.stringify(message);
    }
    return fallback;
  }
  if (error instanceof Error && error.message && !isApiError(error)) return error.message;
  return fallback;
}

function useInvalidateWeldingTimeEntries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: weldingTimeEntryKeys.all });
}

export function usePatchWeldingTimeEntry() {
  const invalidate = useInvalidateWeldingTimeEntries();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: Partial<WeldingTimeEntryInput> }) =>
      patchWeldingTimeEntry(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteWeldingTimeEntry() {
  const invalidate = useInvalidateWeldingTimeEntries();
  return useMutation({
    mutationFn: (id: number | string) => deleteWeldingTimeEntry(id),
    onSuccess: invalidate,
  });
}

export function useBulkCreateWeldingTimeEntries() {
  const invalidate = useInvalidateWeldingTimeEntries();
  return useMutation({ mutationFn: bulkCreateWeldingTimeEntries, onSuccess: invalidate });
}
