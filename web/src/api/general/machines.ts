import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { qk } from '../keys';
import type { Machine, MachinesParams } from '../reference/machines';
import { extractResults, toPaginated } from '../types';

// Port of apis/machines.js for the machine management page
// (general/machines/machineList.js). Pickers keep using
// @/api/reference/machines; saves here refresh that cache too.

export interface AssignedUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface MachineRecord extends Machine {
  /** User objects; older rows carry bare ids. */
  assigned_users?: (AssignedUser | number)[];
  properties?: Record<string, unknown> | null;
  used_in_label?: string;
}

export interface MachineInput {
  name: string;
  code: string | null;
  machine_type: string;
  used_in: string;
  is_active: boolean;
  assigned_users: number[];
  properties: Record<string, unknown>;
}

export interface MachineOption {
  value: string;
  label: string;
}

export type MachineListParams = Omit<MachinesParams, 'compact'>;

/** Rarely change; legacy loaded them once per page load. */
const METADATA_STALE_TIME = 10 * 60_000;

const keys = {
  all: ['generalMachines'] as const,
  list: (params: MachineListParams) => ['generalMachines', 'list', cleanParams(params)] as const,
  types: () => ['generalMachines', 'types'] as const,
  usedIn: () => ['generalMachines', 'usedIn'] as const,
};

/** fetchMachines(page, pageSize, filters, ordering) */
export function machineListQueryOptions(params: MachineListParams) {
  return queryOptions({
    queryKey: keys.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<MachineRecord>(await apiFetch<unknown>('/machines/', { params, signal })),
    placeholderData: keepPreviousData,
  });
}

function optionsFrom(data: unknown): MachineOption[] {
  return extractResults<Partial<MachineOption>>(data)
    .filter((o) => o && o.value !== undefined && o.value !== null)
    .map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) }));
}

/** fetchMachineTypes */
export function machineTypesQueryOptions() {
  return queryOptions({
    queryKey: keys.types(),
    queryFn: async ({ signal }) =>
      optionsFrom(await apiFetch<unknown>('/machines/types/', { signal })),
    staleTime: METADATA_STALE_TIME,
  });
}

/** fetchMachineUsedIn */
export function machineUsedInQueryOptions() {
  return queryOptions({
    queryKey: keys.usedIn(),
    queryFn: async ({ signal }) =>
      optionsFrom(await apiFetch<unknown>('/machines/used_in/', { signal })),
    staleTime: METADATA_STALE_TIME,
  });
}

function useInvalidateMachines() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.all }),
      queryClient.invalidateQueries({ queryKey: qk.machines.all }),
    ]);
}

/** createMachine */
export function useCreateMachine() {
  const invalidate = useInvalidateMachines();
  return useMutation({
    mutationFn: (data: MachineInput) =>
      apiFetch<MachineRecord>('/machines/', { method: 'POST', body: data }),
    onSuccess: invalidate,
  });
}

/** updateMachine (PATCH) */
export function useUpdateMachine() {
  const invalidate = useInvalidateMachines();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MachineInput }) =>
      apiFetch<MachineRecord>(`/machines/${id}/`, { method: 'PATCH', body: data }),
    onSuccess: invalidate,
  });
}

/** deleteMachine */
export function useDeleteMachine() {
  const invalidate = useInvalidateMachines();
  return useMutation({
    mutationFn: (id: number) => apiFetch<unknown>(`/machines/${id}/`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}
