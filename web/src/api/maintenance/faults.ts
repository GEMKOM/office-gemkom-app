import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// Port of apis/maintenance.js (machine faults and fault timers) and of
// fetchMachinesDropdown in apis/machines.js, which the fault pages use.

/** A /machines/faults/ row. */
export interface MachineFault {
  id: number;
  machine?: number | null;
  machine_name?: string | null;
  /** Equipment typed in by hand when it is not a registered machine. */
  asset_name?: string | null;
  location?: string | null;
  description?: string | null;
  is_breaking?: boolean;
  is_maintenance?: boolean;
  reported_by?: number | null;
  reported_by_username?: string | null;
  reported_by_full_name?: string | null;
  reported_at?: string | null;
  resolved_by?: number | null;
  resolved_by_username?: string | null;
  resolved_by_full_name?: string | null;
  resolved_at?: string | null;
  resolution_description?: string | null;
  open_duration_seconds?: number | null;
  [key: string]: unknown;
}

/** Query params the fault pages send (legacy fetchMachineFaults passes them as-is). */
export type MachineFaultsParams = {
  page?: number;
  page_size?: number;
  unresolved?: boolean;
  is_breaking?: boolean;
  is_maintenance?: boolean;
  machine_id?: string;
  resolved_by?: string;
  /** YYYY-MM-DD */
  reported_after?: string;
  reported_before?: string;
  /** YYYY-MM-DD; the faults resolved that day (maintenance dashboard). */
  resolved_date?: string;
};

/** POST /machines/faults/ body, as legacy handleCreateFaultSubmit built it. */
export interface MaintenanceRequestInput {
  description: string;
  is_maintenance: boolean;
  is_breaking: boolean;
  machine?: number;
  asset_name?: string;
  location?: string;
}

/** A /machines/faults/timers/ row; the dashboard reads several field spellings. */
export interface FaultTimer {
  id?: number;
  [key: string]: unknown;
}

/** A /machines/dropdown/ option. */
export interface MachineOption {
  id: number;
  name: string;
  [key: string]: unknown;
}

// 'machineFaults' is also the prefix of the hub counts in
// api/manufacturing/counts.ts, so a create or delete refreshes those too.
export const maintenanceKeys = {
  faults: ['machineFaults'] as const,
  faultList: (params: MachineFaultsParams) => ['machineFaults', 'list', params] as const,
  faultTimers: (isActive: boolean) => ['machineFaults', 'timers', { is_active: isActive }] as const,
  machineDropdown: (usedIn: string | null) => ['machines', 'dropdown', usedIn] as const,
};

/** Legacy fetchMachineFaults: GET /machines/faults/ with the filters as-is. */
export function fetchMachineFaults(params: MachineFaultsParams = {}, signal?: AbortSignal) {
  return apiFetch<unknown>('/machines/faults/', { params, signal }).then((data) =>
    toPaginated<MachineFault>(data),
  );
}

export function machineFaultsQueryOptions(params: MachineFaultsParams = {}) {
  return queryOptions({
    queryKey: maintenanceKeys.faultList(params),
    queryFn: ({ signal }) => fetchMachineFaults(params, signal),
  });
}

/** Legacy fetchFaultTimers: GET /machines/faults/timers/?is_active=…; a bare list or a page. */
export function fetchFaultTimers(isActive = true, signal?: AbortSignal) {
  return apiFetch<unknown>('/machines/faults/timers/', {
    params: { is_active: isActive },
    signal,
  }).then((data) => extractResults<FaultTimer>(data));
}

export function faultTimersQueryOptions(isActive = true) {
  return queryOptions({
    queryKey: maintenanceKeys.faultTimers(isActive),
    queryFn: ({ signal }) => fetchFaultTimers(isActive, signal),
  });
}

/** Legacy fetchMachinesDropdown: GET /machines/dropdown/[?used_in=…], every machine as {id, name}. */
export function machineDropdownQueryOptions(usedIn: string | null = null) {
  return queryOptions({
    queryKey: maintenanceKeys.machineDropdown(usedIn),
    queryFn: async ({ signal }) =>
      extractResults<MachineOption>(
        await apiFetch<unknown>('/machines/dropdown/', { params: { used_in: usedIn }, signal }),
      ),
    // Reference data; the machine list rarely changes.
    staleTime: 5 * 60_000,
  });
}

/** Legacy createMaintenanceRequest. */
export function createMaintenanceRequest(data: MaintenanceRequestInput): Promise<MachineFault> {
  return apiFetch<MachineFault>('/machines/faults/', { method: 'POST', body: data });
}

/** Legacy deleteMaintenanceRequest. */
export function deleteMaintenanceRequest(id: number | string): Promise<void> {
  return apiFetch<void>(`/machines/faults/${id}/`, { method: 'DELETE' });
}

function useInvalidateFaults() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: maintenanceKeys.faults });
}

export function useCreateMaintenanceRequest() {
  const invalidate = useInvalidateFaults();
  return useMutation({ mutationFn: createMaintenanceRequest, onSuccess: invalidate });
}

export function useDeleteMaintenanceRequest() {
  const invalidate = useInvalidateFaults();
  return useMutation({
    mutationFn: (id: number | string) => deleteMaintenanceRequest(id),
    onSuccess: invalidate,
  });
}
