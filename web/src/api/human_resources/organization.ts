import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { extractResults } from '../types';

// Port of apis/human_resources/organization.js: positions and their holders,
// as much as the positions page and the PDKS summary need.

/** Position department codes and their Turkish names (positions.js DEPARTMENT_CODES). */
export const DEPARTMENT_CODES = [
  { value: 'machining', label: 'Talaşlı İmalat' },
  { value: 'design', label: 'Dizayn' },
  { value: 'logistics', label: 'Lojistik' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'welding', label: 'Kaynaklı İmalat' },
  { value: 'planning', label: 'Planlama' },
  { value: 'manufacturing', label: 'İmalat' },
  { value: 'maintenance', label: 'Bakım' },
  { value: 'rollingmill', label: 'Haddehane' },
  { value: 'qualitycontrol', label: 'Kalite Kontrol' },
  { value: 'cutting', label: 'CNC Kesim' },
  { value: 'warehouse', label: 'Ambar' },
  { value: 'finance', label: 'Finans' },
  { value: 'management', label: 'Yönetim' },
  { value: 'external_workshops', label: 'Dış Atölyeler' },
  { value: 'human_resources', label: 'İnsan Kaynakları' },
  { value: 'sales', label: 'Proje Taahhüt' },
  { value: 'accounting', label: 'Muhasebe' },
] as const;

export function departmentLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return DEPARTMENT_CODES.find((d) => d.value === code)?.label ?? code;
}

export const POSITION_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export interface Position {
  id: number;
  title: string;
  level?: number | null;
  parent?: number | null;
  parent_title?: string | null;
  department_code?: string | null;
  is_active?: boolean;
  holder_count?: number;
  permission_count?: number;
  permission_codenames?: string[];
  [key: string]: unknown;
}

export interface PositionHolder {
  id: number;
  username?: string;
  full_name?: string;
  is_active?: boolean | number | string | null;
  [key: string]: unknown;
}

/** The backend filters on department_code; a `department` param is ignored. */
export type PositionsParams = { department_code?: string; level?: string };

export interface PositionInput {
  title: string;
  level: number;
  parent: number | null;
  department_code: string;
  is_active: boolean;
}

const BASE = '/organization/positions/';

export const positionKeys = {
  all: ['organization', 'positions'] as const,
  list: (params: QueryParams = {}) =>
    ['organization', 'positions', 'list', cleanParams(params)] as const,
  detail: (id: number | string) => ['organization', 'positions', 'detail', String(id)] as const,
  holders: (id: number | string) => ['organization', 'positions', 'holders', String(id)] as const,
};

/** fetchPositions: a plain list (a DRF page is tolerated). */
export function positionsQueryOptions(params: PositionsParams = {}) {
  return queryOptions({
    queryKey: positionKeys.list(params),
    queryFn: async ({ signal }) =>
      extractResults<Position>(await apiFetch<unknown>(BASE, { params, signal })),
  });
}

/** A node of GET /organization/positions/tree/ (the org chart). */
export interface PositionTreeNode {
  id: number;
  title?: string;
  level?: number | null;
  department_code?: string | null;
  holder_count?: number;
  children?: PositionTreeNode[];
  [key: string]: unknown;
}

/** fetchPositionTree: the root positions with their children nested. */
export function positionTreeQueryOptions() {
  return queryOptions({
    queryKey: [...positionKeys.all, 'tree'] as const,
    queryFn: async ({ signal }) => {
      const nodes = await apiFetch<unknown>(`${BASE}tree/`, { signal });
      return Array.isArray(nodes) ? (nodes as PositionTreeNode[]) : [];
    },
  });
}

export function usePositions(params: PositionsParams = {}) {
  return useQuery(positionsQueryOptions(params));
}

export function usePosition(id: number | null) {
  return useQuery({
    queryKey: positionKeys.detail(id ?? ''),
    queryFn: ({ signal }) => apiFetch<Position>(`${BASE}${id}/`, { signal }),
    enabled: id !== null,
  });
}

export function usePositionHolders(id: number | null) {
  return useQuery({
    queryKey: positionKeys.holders(id ?? ''),
    queryFn: async ({ signal }) =>
      extractResults<PositionHolder>(await apiFetch<unknown>(`${BASE}${id}/holders/`, { signal })),
    enabled: id !== null,
  });
}

function useInvalidatePositions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: positionKeys.all });
}

export function useSavePosition() {
  const invalidate = useInvalidatePositions();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: Partial<PositionInput> }) =>
      id
        ? apiFetch<Position>(`${BASE}${id}/`, { method: 'PATCH', body: data })
        : apiFetch<Position>(BASE, { method: 'POST', body: data }),
    onSuccess: invalidate,
  });
}

/** assignUserToPosition: PATCH the user's position; null removes it. */
export function useAssignUserToPosition() {
  const invalidate = useInvalidatePositions();
  return useMutation({
    mutationFn: ({ userId, positionId }: { userId: number; positionId: number | null }) =>
      apiFetch<unknown>(`/users/${userId}/`, { method: 'PATCH', body: { position: positionId } }),
    onSettled: invalidate,
  });
}
