import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { toPaginated } from '../types';

// Port of apis/welding/teams.js (the /teams/ resource: welding crews, not
// the /organization/groups/ teams in reference/users.ts).

/** A user as the backend may nest it in a team row. */
export interface WeldingTeamUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  [key: string]: unknown;
}

/**
 * A /teams/ row. The backend has shipped the foreman and members in several
 * shapes (ids, nested objects, *_detail lists); legacy teams.js read them all.
 */
export interface WeldingTeam {
  id: number;
  name: string;
  is_active?: boolean;
  foreman?: number | WeldingTeamUser | null;
  foreman_id?: number | null;
  foreman_name?: string | null;
  foreman_full_name?: string | null;
  members?: (number | WeldingTeamUser)[];
  member_ids?: number[];
  members_detail?: WeldingTeamUser[];
  members_count?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** POST /teams/ and PATCH /teams/<id>/ body, as legacy buildSavePayload sent it. */
export interface WeldingTeamInput {
  name: string;
  foreman: number | null;
  members: number[];
  is_active: boolean;
}

export type WeldingTeamsParams = {
  search?: string;
  is_active?: boolean | string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const weldingTeamKeys = {
  all: ['weldingTeams'] as const,
  list: (params: WeldingTeamsParams = {}) => ['weldingTeams', 'list', params] as const,
};

/** Legacy fetchTeams: GET /teams/ with the filters as-is. */
export function fetchWeldingTeams(params: WeldingTeamsParams = {}, signal?: AbortSignal) {
  return apiFetch<unknown>('/teams/', { params, signal }).then((data) =>
    toPaginated<WeldingTeam>(data),
  );
}

export function weldingTeamsQueryOptions(params: WeldingTeamsParams = {}) {
  return queryOptions({
    queryKey: weldingTeamKeys.list(params),
    queryFn: ({ signal }) => fetchWeldingTeams(params, signal),
  });
}

/** Legacy createTeam. */
export function createWeldingTeam(data: WeldingTeamInput): Promise<WeldingTeam> {
  return apiFetch<WeldingTeam>('/teams/', { method: 'POST', body: data });
}

/** Legacy updateTeam (PATCH). */
export function patchWeldingTeam(
  id: number | string,
  data: Partial<WeldingTeamInput>,
): Promise<WeldingTeam> {
  return apiFetch<WeldingTeam>(`/teams/${id}/`, { method: 'PATCH', body: data });
}

/** Legacy deleteTeam; the backend deactivates the team. */
export function deleteWeldingTeam(id: number | string): Promise<void> {
  return apiFetch<void>(`/teams/${id}/`, { method: 'DELETE' });
}

/**
 * Legacy readErrorMessage: detail / message / error, else every value of a
 * field-error body joined with ', ', else the fallback.
 */
export function weldingTeamErrorMessage(error: unknown, fallback: string): string {
  if (!isApiError(error)) return fallback;
  const data = error.data;
  if (!data || typeof data !== 'object') return fallback;
  const body = data as Record<string, unknown>;
  const details = body.detail ?? body.message ?? body.error;
  if (details) return Array.isArray(details) ? details.join(', ') : String(details);
  const values = Object.values(body).flat();
  return values.length > 0 ? values.map(String).join(', ') : fallback;
}

function useInvalidateWeldingTeams() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: weldingTeamKeys.all });
}

export function useCreateWeldingTeam() {
  const invalidate = useInvalidateWeldingTeams();
  return useMutation({ mutationFn: createWeldingTeam, onSuccess: invalidate });
}

export function usePatchWeldingTeam() {
  const invalidate = useInvalidateWeldingTeams();
  return useMutation({
    mutationFn: ({ id, data }: { id: number | string; data: Partial<WeldingTeamInput> }) =>
      patchWeldingTeam(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteWeldingTeam() {
  const invalidate = useInvalidateWeldingTeams();
  return useMutation({
    mutationFn: (id: number | string) => deleteWeldingTeam(id),
    onSuccess: invalidate,
  });
}
