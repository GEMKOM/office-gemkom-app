import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

// Port of getMachiningJobEntries from apis/machining/reports.js.

/** One time entry of GET /machining/reports/job-entries/. */
export interface MachiningJobEntry {
  id: number;
  /** Epoch milliseconds. */
  start_time?: number | null;
  employee_id?: number;
  employee_username?: string;
  employee_full_name?: string;
  operation_key?: string;
  operation_name?: string;
  hours?: number | string | null;
  work_type?: string;
  [key: string]: unknown;
}

export interface MachiningJobEntries {
  job_no?: string;
  summary?: {
    total_entries?: number;
    total_hours?: number | string;
    breakdown_by_type?: {
      weekday_work?: number | string | null;
      after_hours?: number | string | null;
      sunday?: number | string | null;
    };
    [key: string]: unknown;
  };
  entries?: MachiningJobEntry[];
  [key: string]: unknown;
}

export type MachiningJobEntriesParams = {
  job_no: string;
  include_descendants?: boolean;
};

export const machiningJobEntryKeys = {
  all: ['machining-job-entries'] as const,
  detail: (params: MachiningJobEntriesParams) => ['machining-job-entries', params] as const,
};

/** Legacy getMachiningJobEntries: GET /machining/reports/job-entries/?job_no=… */
export function fetchMachiningJobEntries(params: MachiningJobEntriesParams, signal?: AbortSignal) {
  const { include_descendants, ...rest } = params;
  return apiFetch<MachiningJobEntries>('/machining/reports/job-entries/', {
    params: { ...rest, include_descendants: include_descendants ? 'true' : undefined },
    signal,
  });
}

export function machiningJobEntriesQueryOptions(params: MachiningJobEntriesParams) {
  return queryOptions({
    queryKey: machiningJobEntryKeys.detail(params),
    queryFn: ({ signal }) => fetchMachiningJobEntries(params, signal),
  });
}
