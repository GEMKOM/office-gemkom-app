import { authedFetch } from '@/auth/authService';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  apiFetch,
  buildUrl,
  cleanParams,
  errorMessage,
  type QueryParams,
} from '../client';
import { REFERENCE_STALE_TIME } from '../reference/shared';
import { toPaginated } from '../types';
import type { TimerModule } from './counts';

// The finished-timers reports of machining and CNC cutting
// (manufacturing/{machining,cnc-cutting}/reports/finished-timers/finishedTimers.js).
// Both read and edit `/<module>/timers/` directly.

/** A timer row from `/<module>/timers/`. Times are epoch milliseconds. */
export interface FinishedTimer {
  id: number;
  username?: string;
  issue_key?: string | null;
  machine_fk?: number | null;
  machine_name?: string | null;
  start_time?: number | null;
  finish_time?: number | null;
  comment?: string | null;
  manual_entry?: boolean;
  // machining
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
  quantity?: number | string | null;
  // cnc_cutting
  nesting_id?: string | null;
  thickness_mm?: number | string | null;
  [key: string]: unknown;
}

export type FinishedTimersParams = {
  page?: number;
  page_size?: number;
  ordering?: string;
  user?: string;
  machine_fk?: string;
  /** Epoch ms, start of the first day. */
  start_after?: number;
  /** Epoch ms, end of the last day (the legacy filter compares start_time). */
  start_before?: number;
  issue_key?: string;
  job_no?: string;
  nesting_id?: string;
};

/** The cache prefix the hub counts use too, so an edit refreshes them. */
const timersKey = (module: TimerModule) => `timers:${module}`;

/** Legacy buildTimerQuery always asks for finished timers. */
function finishedParams(params: FinishedTimersParams): QueryParams {
  return { ...params, is_active: false };
}

export function finishedTimersQueryOptions(module: TimerModule, params: FinishedTimersParams) {
  const request = finishedParams(params);
  return queryOptions({
    queryKey: [timersKey(module), 'finished', cleanParams(request)] as const,
    queryFn: async ({ signal }) =>
      toPaginated<FinishedTimer>(
        await apiFetch<unknown>(`/${module}/timers/`, { params: request, signal }),
      ),
  });
}

export function timerQueryOptions(module: TimerModule, id: string | number) {
  return queryOptions({
    queryKey: [timersKey(module), 'detail', String(id)] as const,
    queryFn: ({ signal }) => apiFetch<FinishedTimer>(`/${module}/timers/${id}/`, { signal }),
  });
}

export type TimerPatch = {
  comment: string;
  manual_entry: boolean;
  machine_fk: number | null | undefined;
  finish_time: number | null;
  job_no?: string;
  image_no?: string;
  position_no?: string;
  quantity?: number | null;
};

export function useUpdateTimer(module: TimerModule) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: TimerPatch }) =>
      apiFetch<FinishedTimer>(`/${module}/timers/${id}/`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [timersKey(module)] });
    },
  });
}

export function useDeleteTimer(module: TimerModule) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/${module}/timers/${id}/`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [timersKey(module), 'detail', String(id)] });
      void queryClient.invalidateQueries({ queryKey: [timersKey(module)] });
    },
  });
}

/**
 * `/<module>/timers/export/` with the list's filters, saved as an .xlsx file.
 * Legacy pointed a plain link at it, which sent no Authorization header.
 */
export async function downloadTimersExport(
  module: TimerModule,
  params: FinishedTimersParams,
  fileName: string,
): Promise<void> {
  const response = await authedFetch(buildUrl(`/${module}/timers/export/`, finishedParams(params)));
  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = undefined;
    }
    throw new ApiError(response.status, data, errorMessage(response.status, data));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** `/machines/dropdown/` row (apis/machines.js fetchMachinesDropdown). */
export interface MachineDropdownOption {
  id: number;
  name: string;
  [key: string]: unknown;
}

export function machinesDropdownQueryOptions(usedIn: string) {
  return queryOptions({
    queryKey: ['machines', 'dropdown', usedIn] as const,
    queryFn: async ({ signal }) =>
      toPaginated<MachineDropdownOption>(
        await apiFetch<unknown>('/machines/dropdown/', { params: { used_in: usedIn }, signal }),
      ).results,
    staleTime: REFERENCE_STALE_TIME,
  });
}
