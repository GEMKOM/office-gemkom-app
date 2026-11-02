import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { qk } from '../keys';
import { extractResults } from '../types';
import {
  REFERENCE_STALE_TIME,
  SLOW_REFERENCE_STALE_TIME,
  type ReferenceQueryOptions,
} from './shared';

/** Light user row from `/users/dropdown/`. */
export interface UserOption {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  is_active?: boolean;
  [key: string]: unknown;
}

export type UsersParams = {
  /** Active only by default on the backend; 'all' for historical name lookups. */
  is_active?: boolean | 'all' | string;
  /** Comma-separated position department codes, e.g. 'design,planning'. */
  department_code?: string;
  group?: string;
};

/** Port of apis/users.js fetchAllUsers / fetchUsersDropdown. */
export function usersQueryOptions(params: UsersParams = {}) {
  return queryOptions({
    queryKey: qk.users.list(params),
    queryFn: async ({ signal }) =>
      // Endpoint returns a plain array; tolerate a paginated envelope too.
      extractResults<UserOption>(await apiFetch<unknown>('/users/dropdown/', { params, signal })),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useUsers(params: UsersParams = {}, options: ReferenceQueryOptions = {}) {
  return useQuery({ ...usersQueryOptions(params), ...options });
}

/** `/organization/groups/` row with value/label filled in for pickers. */
export interface Team {
  id?: number;
  name: string;
  display_name?: string;
  value: string;
  label: string;
  [key: string]: unknown;
}

type RawTeam = {
  name: string;
  display_name?: string;
  value?: string;
  label?: string;
  [key: string]: unknown;
};

/** Port of apis/users.js fetchTeams. */
export function teamsQueryOptions() {
  return queryOptions({
    queryKey: qk.teams.list(),
    queryFn: async ({ signal }): Promise<Team[]> => {
      const data = await apiFetch<unknown>('/organization/groups/', { signal });
      return extractResults<RawTeam>(data).map((g) => ({
        ...g,
        value: g.value ?? g.name,
        label: g.label ?? g.display_name ?? g.name,
      }));
    },
    staleTime: SLOW_REFERENCE_STALE_TIME,
  });
}

export function useTeams(options: ReferenceQueryOptions = {}) {
  return useQuery({ ...teamsQueryOptions(), ...options });
}

/** "Ad Soyad (kullanici)" the way legacy pickers label users. */
export function userLabel(
  user: Pick<UserOption, 'username' | 'full_name' | 'first_name' | 'last_name'>,
): string {
  const name = user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ');
  return name ? `${name} (${user.username})` : user.username;
}

/** One member of an organization group, as GET /organization/groups/{id}/members/ lists it. */
export interface MentionGroupMember {
  username: string;
  full_name?: string;
  position?: string;
  [key: string]: unknown;
}

export interface MentionGroupMembers {
  id?: number | string;
  name?: string;
  members?: MentionGroupMember[];
  [key: string]: unknown;
}

/**
 * Port of apis/users.js fetchUserGroupMembers: who a group @mention notifies.
 * The server notifies from the same list, so the two cannot disagree.
 */
export function groupMembersQueryOptions(groupId: number | string) {
  return queryOptions({
    queryKey: [...qk.teams.detail(groupId), 'members'] as const,
    queryFn: ({ signal }) =>
      apiFetch<MentionGroupMembers>(`/organization/groups/${groupId}/members/`, { signal }),
    // Memberships barely change within a visit, and one badge is often clicked twice.
    staleTime: SLOW_REFERENCE_STALE_TIME,
  });
}
