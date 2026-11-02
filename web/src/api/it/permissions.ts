import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { positionKeys, type Position } from '../human_resources/organization';
import { userPermissionsQueryOptions, type UserPermissionsDetail } from '../human_resources/users';
import { extractResults } from '../types';

// Port of the requests it/permissions (Yetki Yönetimi) makes: apis/users.js
// (matrix, per-permission users) and apis/human_resources/organization.js
// (position detail, position permissions). The user detail and the override
// calls are shared with the HR users page (api/human_resources/users.ts).

export interface MatrixPermission {
  value?: boolean;
  source?: string;
  source_detail?: string;
}

/** A user of GET /users/permissions/matrix/. */
export interface MatrixUser {
  id: number;
  username: string;
  full_name?: string | null;
  is_superuser?: boolean;
  permissions?: Record<string, MatrixPermission>;
  position_id?: number | null;
  position_title?: string | null;
  position_level?: number | string | null;
  position_department_code?: string | null;
  position?: number | { id?: number; title?: string; level?: number | string; department_code?: string } | null;
  [key: string]: unknown;
}

export interface PermissionsMatrix {
  codenames: string[];
  users: MatrixUser[];
}

/** A row of GET /users/permissions/: the catalog entry with who holds it. */
export interface PermissionEntry {
  codename: string;
  name?: string | null;
  section?: string | null;
  portal?: string | null;
  users?: { id?: number; username: string }[];
  overrides?: { username: string; granted: boolean }[];
  [key: string]: unknown;
}

/** GET /organization/positions/<id>/; the codes come under either name. */
export interface PositionDetail extends Position {
  department_name?: string | null;
  parent_title?: string | null;
  codenames?: string[];
  holders?: { id: number; username?: string; full_name?: string }[];
}

export const permissionKeys = {
  matrix: ['users', 'permissions', 'matrix'] as const,
  list: ['users', 'permissions', 'list'] as const,
};

/** fetchPermissionsMatrix() with no filters, as the page called it. */
export function permissionsMatrixQueryOptions() {
  return queryOptions({
    queryKey: permissionKeys.matrix,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<Partial<PermissionsMatrix> | null>('/users/permissions/matrix/', { signal });
      return { codenames: data?.codenames ?? [], users: data?.users ?? [] } satisfies PermissionsMatrix;
    },
  });
}

/**
 * GET /users/permissions/: the page read it twice, as the catalog
 * (fetchPermissionsCatalog) and as the per-permission user list
 * (fetchPermissionsUsersList). One query serves both.
 */
export function permissionsListQueryOptions() {
  return queryOptions({
    queryKey: permissionKeys.list,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>('/users/permissions/', { signal });
      const rows =
        data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as { data?: unknown }).data)
          ? ((data as { data: PermissionEntry[] }).data)
          : extractResults<PermissionEntry>(data);
      return rows.filter((p) => p && p.codename);
    },
  });
}

/** The position detail with its holders: embedded, or GET .../holders/ on older payloads. */
export function positionDetailQueryOptions(id: number) {
  return queryOptions({
    // Not positionKeys.detail itself: usePosition caches the bare detail there.
    queryKey: [...positionKeys.detail(id), 'withHolders'] as const,
    queryFn: async ({ signal }) => {
      const detail = await apiFetch<PositionDetail>(`/organization/positions/${id}/`, { signal });
      if (Array.isArray(detail.holders)) return detail;
      const holders = extractResults<NonNullable<PositionDetail['holders']>[number]>(
        await apiFetch<unknown>(`/organization/positions/${id}/holders/`, { signal }),
      );
      return { ...detail, holders };
    },
  });
}

/** permission_codenames (newer) or codenames (older serializer). */
export function positionCodenames(detail: { permission_codenames?: unknown; codenames?: unknown } | undefined): string[] {
  if (Array.isArray(detail?.permission_codenames)) return detail.permission_codenames as string[];
  if (Array.isArray(detail?.codenames)) return detail.codenames as string[];
  return [];
}

/** patchPositionPermissions: replaces the position's permission set. */
export function useSavePositionPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, codenames }: { id: number; codenames: string[] }) =>
      apiFetch<unknown>(`/organization/positions/${id}/permissions/`, {
        method: 'PATCH',
        body: { codenames },
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: positionKeys.all }),
        queryClient.invalidateQueries({ queryKey: permissionKeys.matrix }),
        queryClient.invalidateQueries({ queryKey: permissionKeys.list }),
      ]),
  });
}

const POSITION_FIELDS = [
  'position_id',
  'position_title',
  'position_level',
  'position_department_code',
  'position',
] as const;

/**
 * Reloads one user's permission detail and copies it onto their matrix row, so
 * the users table shows the new count without reloading the matrix (legacy
 * refreshUserTableRow).
 */
export async function refreshUserPermissions(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: number,
): Promise<UserPermissionsDetail | null> {
  // staleTime 0: this always refetches, and the open panel reads the new data.
  const detail = await queryClient.fetchQuery(userPermissionsQueryOptions(userId));
  if (!detail) return detail;
  const user = (detail.user ?? detail) as Partial<MatrixUser>;
  const positionFields = Object.fromEntries(
    POSITION_FIELDS.filter((key) => key in user).map((key) => [key, user[key]]),
  ) as Partial<MatrixUser>;
  queryClient.setQueryData<PermissionsMatrix>(permissionKeys.matrix, (matrix) =>
    matrix
      ? {
          ...matrix,
          users: matrix.users.map((u) =>
            Number(u.id) === Number(user.id ?? userId)
              ? { ...u, ...positionFields, permissions: detail.effective_permissions ?? u.permissions }
              : u,
          ),
        }
      : matrix,
  );
  return detail;
}
