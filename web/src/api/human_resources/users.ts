import { impersonateUser as legacyImpersonateUser } from '@legacy/authService.js';
import { queryOptions } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { qk } from '../keys';
import { extractResults, toPaginated } from '../types';

// The HR employees page (human_resources/users): the parts of apis/users.js,
// apis/human_resources/organization.js and apis/human_resources/attendance.js
// it calls.

/** A row of `/users/` as the HR list shows and edits it. */
export interface HrUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  personel_kodu?: string | null;
  birth_date?: string | null;
  tc_kimlik_no?: string | null;
  gender?: string | null;
  sigorta_yuzde_grubu?: string | null;
  position_title?: string | null;
  is_active?: boolean;
  shift_rule_id?: number | null;
  shift_rule?: number | { id?: number } | null;
  [key: string]: unknown;
}

export interface HrUsersParams {
  page?: number;
  page_size?: number;
  username?: string;
  position?: string;
  position_level?: string;
  department_code?: string;
  /** 'true' | 'false' | 'all'; left out, the backend lists active accounts. */
  is_active?: string;
  ordering?: string;
}

/** Port of authFetchUsers: one server page of `/users/`. */
export function hrUsersQueryOptions(params: HrUsersParams) {
  return queryOptions({
    queryKey: qk.users.list({ hr: true, ...params }),
    queryFn: async ({ signal }) =>
      toPaginated<HrUser>(await apiFetch<unknown>('/users/', { params: { ...params }, signal })),
  });
}

export function createUser(data: Record<string, unknown>): Promise<unknown> {
  return apiFetch<unknown>('/users/', { method: 'POST', body: data });
}

export function patchUser(id: number, data: Record<string, unknown>): Promise<unknown> {
  return apiFetch<unknown>(`/users/${id}/`, { method: 'PATCH', body: data });
}

export function deleteUser(id: number): Promise<void> {
  return apiFetch<void>(`/users/${id}/`, { method: 'DELETE' });
}

/** Port of assignUserToPosition: null removes the position. */
export function assignUserToPosition(userId: number, positionId: number | null): Promise<unknown> {
  return patchUser(userId, { position: positionId });
}

/** Legacy impersonateUser swaps the session and reloads on `/`. */
export function impersonateUser(userId: number): Promise<void> {
  return legacyImpersonateUser(userId);
}

/**
 * The legacy create/update error text: `message`, `detail`, a plain string,
 * else every field error as `field: text` joined with ' | '
 * (non_field_errors without the prefix), else the fallback.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  if (!isApiError(error)) return error instanceof Error && error.message ? error.message : fallback;
  const data = error.data;
  if (typeof data === 'string' && data) return data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    if (typeof body.message === 'string' && body.message) return body.message;
    if (typeof body.detail === 'string' && body.detail) return body.detail;
    const joined = Object.entries(body)
      .map(([field, value]) => {
        const text = Array.isArray(value) ? value.join(', ') : String(value);
        return field === 'non_field_errors' ? text : `${field}: ${text}`;
      })
      .join(' | ');
    if (joined) return joined;
  }
  return fallback;
}

// ---- organization positions ----

export interface OrgPosition {
  id: number;
  title?: string;
  level?: number | string | null;
  department_code?: string | null;
  department_name?: string | null;
  [key: string]: unknown;
}

/** Port of organization.js fetchPositions (no filters). */
export function orgPositionsQueryOptions() {
  return queryOptions({
    queryKey: ['organization', 'positions', 'list'] as const,
    queryFn: async ({ signal }) =>
      extractResults<OrgPosition>(await apiFetch<unknown>('/organization/positions/', { signal })),
    staleTime: 5 * 60_000,
  });
}

/** "Başlık (L2) - Departman", the legacy position option label. */
export function positionLabel(p: OrgPosition): string {
  return `${p.title || '-'} (L${p.level || '-'})${p.department_name ? ` - ${p.department_name}` : ''}`;
}

// ---- shift rules ----

export interface ShiftRule {
  id: number;
  name: string;
  expected_start?: string | null;
  expected_end?: string | null;
  is_active?: boolean;
  [key: string]: unknown;
}

/** Port of fetchShiftRules, active rules only (the page drops inactive ones). */
export function activeShiftRulesQueryOptions() {
  return queryOptions({
    queryKey: ['attendance', 'shiftRules', 'list'] as const,
    queryFn: async ({ signal }) =>
      extractResults<ShiftRule>(await apiFetch<unknown>('/attendance/hr/shift-rules/', { signal })),
    select: (rules: ShiftRule[]) => rules.filter((r) => r && r.is_active !== false),
  });
}

/** Port of assignShiftRuleToUser: null means the default rule. */
export function assignShiftRuleToUser(
  userId: number,
  shiftRuleId: number | null,
): Promise<unknown> {
  return apiFetch<unknown>('/attendance/hr/shift-rules/assign/', {
    method: 'POST',
    body: { user_id: userId, shift_rule_id: shiftRuleId },
  });
}

// ---- permissions ----

export interface EffectivePermission {
  value?: boolean;
  source?: string;
  source_detail?: string;
}

export interface PermissionOverride {
  codename: string;
  granted: boolean;
  reason?: string;
}

export interface UserPermissionsDetail {
  user?: { is_superuser?: boolean; [key: string]: unknown };
  effective_permissions?: Record<string, EffectivePermission>;
  overrides?: PermissionOverride[];
  position?: number | { id?: number } | null;
  [key: string]: unknown;
}

export function userPermissionsQueryOptions(userId: number) {
  return queryOptions({
    queryKey: ['users', 'permissions', String(userId)] as const,
    queryFn: ({ signal }) =>
      apiFetch<UserPermissionsDetail | null>(`/users/${userId}/permissions/`, { signal }),
    staleTime: 0,
  });
}

export function saveUserPermissionOverride(
  userId: number,
  { codename, granted, reason }: { codename: string; granted: boolean; reason?: string },
): Promise<unknown> {
  return apiFetch<unknown>(`/users/${userId}/permission-overrides/`, {
    method: 'POST',
    body: { codename, granted, reason: reason || '' },
  });
}

export function deleteUserPermissionOverride(userId: number, codename: string): Promise<unknown> {
  return apiFetch<unknown>(`/users/${userId}/permission-overrides/${codename}/`, {
    method: 'DELETE',
  });
}
