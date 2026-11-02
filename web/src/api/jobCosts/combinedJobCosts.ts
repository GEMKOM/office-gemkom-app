import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// Port of getCombinedJobCosts from apis/planning/reports.js.

/** Machining hours by work type, as the combined report nests them. */
export interface CombinedMachiningPart {
  hours: { weekday_work?: number | null; after_hours?: number | null; sunday?: number | null };
  [key: string]: unknown;
}

/** Welding hours by overtime type, as the combined report nests them. */
export interface CombinedWeldingPart {
  hours: { regular?: number | null; after_hours?: number | null; holiday?: number | null };
  [key: string]: unknown;
}

/** One row of GET /reports/combined-job-costs; a department is null when it has no entries. */
export interface CombinedJobCost {
  job_no: string;
  machining?: CombinedMachiningPart | null;
  welding?: CombinedWeldingPart | null;
  combined_total_hours?: number | null;
  currency?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type CombinedJobCostsParams = {
  /** Partial match. */
  job_no?: string;
  /** job_no, combined_total_cost, combined_total_hours (and their '-' forms). */
  ordering?: string;
  include_descendants?: boolean;
};

export const combinedJobCostKeys = {
  all: ['combined-job-costs'] as const,
  list: (params: CombinedJobCostsParams = {}) => ['combined-job-costs', 'list', params] as const,
};

/** Legacy getCombinedJobCosts: GET /reports/combined-job-costs (no trailing slash, as legacy). */
export function fetchCombinedJobCosts(params: CombinedJobCostsParams = {}, signal?: AbortSignal) {
  const { include_descendants, ...rest } = params;
  return apiFetch<unknown>('/reports/combined-job-costs', {
    params: { ...rest, include_descendants: include_descendants ? 'true' : undefined },
    signal,
  }).then((data) => toPaginated<CombinedJobCost>(data));
}

export function combinedJobCostsQueryOptions(params: CombinedJobCostsParams = {}) {
  return queryOptions({
    queryKey: combinedJobCostKeys.list(params),
    queryFn: ({ signal }) => fetchCombinedJobCosts(params, signal),
  });
}
