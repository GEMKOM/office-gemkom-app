import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { qk } from '../keys';
import { extractResults } from '../types';
import { REFERENCE_STALE_TIME, type ReferenceQueryOptions } from './shared';

/** Row from `/projects/job-orders/dropdown/`. */
export interface JobOrderOption {
  job_no: string;
  title: string;
  /** Only with `withCustomer`. */
  customer_name?: string | null;
  status?: string;
  [key: string]: unknown;
}

export type JobOrderOptionsParams = {
  /** Include completed / cancelled job orders. */
  includeAll?: boolean;
  /** Top-level job orders only (no children or phases). */
  rootOnly?: boolean;
  withCustomer?: boolean;
  weldingOnly?: boolean;
};

/** Port of apis/projects/jobOrders.js getJobOrderDropdown. */
export function jobOrderOptionsQueryOptions(params: JobOrderOptionsParams = {}) {
  // Legacy only sends the flags that are on; false and absent are the same request.
  const request = {
    all: params.includeAll ? 'true' : undefined,
    root_only: params.rootOnly ? 'true' : undefined,
    with_customer: params.withCustomer ? 'true' : undefined,
    welding_only: params.weldingOnly ? 'true' : undefined,
  };
  return queryOptions({
    queryKey: qk.jobOrders.options(request),
    queryFn: async ({ signal }) =>
      extractResults<JobOrderOption>(
        await apiFetch<unknown>('/projects/job-orders/dropdown/', { params: request, signal }),
      ),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useJobOrderOptions(
  params: JobOrderOptionsParams = {},
  options: ReferenceQueryOptions = {},
) {
  return useQuery({ ...jobOrderOptionsQueryOptions(params), ...options });
}
