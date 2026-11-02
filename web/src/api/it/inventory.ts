import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { qk } from '../keys';
import { SLOW_REFERENCE_STALE_TIME } from '../reference/shared';
import { extractResults, toPaginated } from '../types';

/** A user on a device (`assigned_users` of `/machines/`). */
export interface ItDeviceUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
}

/** A `/machines/` row as the IT inventory reads it. */
export interface ItDevice {
  id: number;
  name: string;
  code?: string | null;
  machine_type?: string;
  machine_type_label?: string;
  used_in?: string;
  is_active?: boolean;
  is_under_maintenance?: boolean;
  assigned_users?: ItDeviceUser[] | null;
  /** Free-form key/value pairs; values may be strings, numbers or booleans. */
  properties?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** Query params of apis/machines.js fetchMachines. */
export type ItDevicesParams = {
  page?: number;
  page_size?: number;
  name?: string;
  code?: string;
  machine_type?: string;
  used_in?: string;
  /** 'true' / 'false' as the legacy status filter sent it. */
  is_active?: string;
  ordering?: string;
};

/** Body of the inventory edit modal's PATCH. */
export interface ItDeviceUpdate {
  name: string;
  code: string | null;
  machine_type: string;
  used_in: string;
  is_active: boolean;
  assigned_users: number[];
  properties: Record<string, string | number | boolean>;
}

/** `/machines/types/` option, normalised to value/label like the edit modal did. */
export interface MachineTypeOption {
  value: string;
  label: string;
}

// Local keys (not in keys.ts) so this module stays self-contained.
export const itInventoryKeys = {
  all: ['itInventory'] as const,
  list: (params: ItDevicesParams) => ['itInventory', 'list', cleanParams(params)] as const,
  machineTypes: () => ['itInventory', 'machineTypes'] as const,
};

/**
 * Port of apis/machines.js fetchMachines (same path and params; unset ones are
 * left out, as legacy did).
 */
export async function fetchItDevices(params: ItDevicesParams, signal?: AbortSignal) {
  return toPaginated<ItDevice>(await apiFetch<unknown>('/machines/', { params, signal }));
}

export function itDevicesQueryOptions(params: ItDevicesParams) {
  return queryOptions({
    queryKey: itInventoryKeys.list(params),
    queryFn: ({ signal }) => fetchItDevices(params, signal),
  });
}

type RawMachineType = { value?: unknown; id?: unknown; label?: unknown; name?: unknown };

/** Port of fetchMachineTypes (`results` envelope or a bare array). */
export async function fetchMachineTypes(signal?: AbortSignal): Promise<MachineTypeOption[]> {
  const rows = extractResults<RawMachineType>(await apiFetch<unknown>('/machines/types/', { signal }));
  return rows
    .map((type) => ({
      value: String(type.value ?? type.id ?? ''),
      label: String(type.label ?? type.name ?? type.value ?? type.id ?? ''),
    }))
    .filter((type) => type.value !== '');
}

export function machineTypesQueryOptions() {
  return queryOptions({
    queryKey: itInventoryKeys.machineTypes(),
    queryFn: ({ signal }) => fetchMachineTypes(signal),
    // Legacy loaded the types once per page load.
    staleTime: SLOW_REFERENCE_STALE_TIME,
  });
}

export function useMachineTypes() {
  return useQuery(machineTypesQueryOptions());
}

/** Port of apis/machines.js updateMachine (PATCH). */
export async function updateItDevice(id: number | string, data: ItDeviceUpdate): Promise<ItDevice> {
  return apiFetch<ItDevice>(`/machines/${id}/`, { method: 'PATCH', body: data });
}

export function useUpdateItDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: ItDeviceUpdate }) => updateItDevice(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itInventoryKeys.all });
      // Machine pickers elsewhere show the name too.
      void queryClient.invalidateQueries({ queryKey: qk.machines.all });
    },
  });
}
