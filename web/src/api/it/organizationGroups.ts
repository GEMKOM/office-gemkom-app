import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { qk } from '../keys';
import { extractResults } from '../types';

/** A row of GET /organization/groups/. */
export interface OrganizationGroup {
  id: number;
  name: string;
  description?: string | null;
  is_active?: boolean;
  position_count?: number;
  member_count?: number;
  [key: string]: unknown;
}

export interface GroupPosition {
  id?: number;
  position_id?: number;
  title?: string;
  name?: string;
  level?: number | null;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface GroupMember {
  id?: number;
  full_name?: string;
  name?: string;
  username?: string;
  [key: string]: unknown;
}

/** GET /organization/groups/<id>/; older payloads name the lists differently. */
export interface OrganizationGroupDetail extends OrganizationGroup {
  positions?: GroupPosition[];
  position_list?: GroupPosition[];
  members?: GroupMember[];
  resolved_members?: GroupMember[];
}

export interface GroupCreateInput {
  name: string;
  description?: string;
  is_active?: boolean;
  position_ids?: number[];
}

export interface GroupPatchInput {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export const organizationGroupKeys = {
  all: ['organizationGroups'] as const,
  list: () => ['organizationGroups', 'list'] as const,
  detail: (id: number) => ['organizationGroups', 'detail', id] as const,
  positions: () => ['organizationPositions', 'list'] as const,
};

/**
 * Legacy parseJsonOrThrow (apis/human_resources/organization.js): the body's
 * detail / message / error, else the fallback for that call.
 */
export function organizationErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const body = error.data as Record<string, unknown>;
    for (const key of ['detail', 'message', 'error']) {
      if (typeof body[key] === 'string' && body[key]) return body[key];
    }
  }
  return fallback;
}

/** Throws an Error carrying the legacy message, so pages can show `error.message`. */
async function withMessage<T>(request: Promise<T>, fallback: string): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(organizationErrorMessage(error, fallback), { cause: error });
  }
}

export function positionIdOf(position: GroupPosition): number {
  return Number(position.id ?? position.position_id);
}

export function positionLabel(position: GroupPosition | undefined | null): string {
  if (!position) return '-';
  const title = position.title || position.name || '-';
  return position.level != null ? `${title} (L${position.level})` : title;
}

export function groupPositions(detail: OrganizationGroupDetail | undefined): GroupPosition[] {
  const raw = detail?.positions ?? detail?.position_list ?? [];
  return Array.isArray(raw) ? raw : [];
}

export function groupMembers(detail: OrganizationGroupDetail | undefined): GroupMember[] {
  const raw = detail?.members ?? detail?.resolved_members ?? [];
  return Array.isArray(raw) ? raw : [];
}

export function groupPositionIds(detail: OrganizationGroupDetail | undefined): number[] {
  return groupPositions(detail)
    .map(positionIdOf)
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function organizationGroupsQueryOptions() {
  return queryOptions({
    queryKey: organizationGroupKeys.list(),
    queryFn: async ({ signal }) =>
      extractResults<OrganizationGroup>(
        await withMessage(
          apiFetch<unknown>('/organization/groups/', { signal }),
          'Gruplar yüklenemedi.',
        ),
      ),
  });
}

export function useOrganizationGroup(id: number | null) {
  return useQuery({
    queryKey: organizationGroupKeys.detail(id ?? 0),
    queryFn: ({ signal }) =>
      withMessage(
        apiFetch<OrganizationGroupDetail>(`/organization/groups/${id}/`, { signal }),
        'Grup detayı yüklenemedi.',
      ),
    enabled: id !== null,
  });
}

/** Port of fetchPositions({}): the first response only, as legacy read it. */
export function usePositionsCatalog() {
  return useQuery({
    queryKey: organizationGroupKeys.positions(),
    queryFn: async ({ signal }) =>
      extractResults<GroupPosition>(
        await withMessage(
          apiFetch<unknown>('/organization/positions/', { signal }),
          'Pozisyonlar yüklenemedi.',
        ),
      ),
    staleTime: 5 * 60_000,
  });
}

function useInvalidateGroups() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: organizationGroupKeys.all }),
      // The cached team pickers read the same endpoint.
      queryClient.invalidateQueries({ queryKey: qk.teams.all }),
    ]);
}

export function useCreateOrganizationGroup() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: (data: GroupCreateInput) =>
      withMessage(
        apiFetch<OrganizationGroup>('/organization/groups/', { method: 'POST', body: data }),
        'Grup oluşturulamadı.',
      ),
    onSuccess: invalidate,
  });
}

export function usePatchOrganizationGroup() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: GroupPatchInput }) =>
      withMessage(
        apiFetch<OrganizationGroup>(`/organization/groups/${id}/`, { method: 'PATCH', body: data }),
        'Grup güncellenemedi.',
      ),
    onSuccess: invalidate,
  });
}

/** Port of patchOrganizationGroupPositions: replaces the group's whole position list. */
export function useSetGroupPositions() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: ({ id, positionIds }: { id: number; positionIds: number[] }) =>
      withMessage(
        apiFetch<OrganizationGroupDetail>(`/organization/groups/${id}/positions/`, {
          method: 'PATCH',
          body: { position_ids: [...new Set(positionIds.map(Number).filter(Boolean))] },
        }),
        'Grup pozisyonları güncellenemedi.',
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteOrganizationGroup() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: (id: number) =>
      withMessage(
        apiFetch<void>(`/organization/groups/${id}/`, { method: 'DELETE' }),
        'Grup silinemedi.',
      ),
    onSuccess: invalidate,
  });
}
