import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { qk } from '../keys';
import { toPaginated } from '../types';
import { REFERENCE_STALE_TIME, type ReferenceQueryOptions } from './shared';

export interface Machine {
  id: number;
  name: string;
  code?: string;
  machine_type?: string;
  machine_type_label?: string;
  used_in?: string;
  is_active?: boolean;
  is_under_maintenance?: boolean;
  has_active_timer?: boolean;
  [key: string]: unknown;
}

export type MachinesParams = {
  page?: number;
  page_size?: number;
  name?: string;
  code?: string;
  machine_type?: string;
  /** e.g. 'machining', 'cutting', 'cnc_cutting', 'linear_cutting'. */
  used_in?: string;
  is_active?: boolean | string;
  compact?: boolean;
  ordering?: string;
};

/**
 * Port of apis/machines.js fetchMachines. Legacy defaults to page_size 10; as a
 * picker source we default to 100, which is what every dropdown caller passes.
 */
export function machinesQueryOptions(params: MachinesParams = {}) {
  const request: MachinesParams = { page: 1, page_size: 100, ...params };
  return queryOptions({
    queryKey: qk.machines.list(request),
    queryFn: async ({ signal }) =>
      toPaginated<Machine>(await apiFetch<unknown>('/machines/', { params: request, signal })),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useMachines(
  params: MachinesParams = {},
  options: ReferenceQueryOptions = {},
) {
  return useQuery({ ...machinesQueryOptions(params), ...options });
}
