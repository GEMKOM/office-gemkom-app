import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

/** A user who asked for a password reset (GET /users/forgot-password/list/). */
export interface PasswordResetRequest {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  department_code?: string | null;
  must_reset_password?: boolean;
  user_groups?: string[];
  [key: string]: unknown;
}

export interface PasswordResetResult {
  temp_password: string;
}

export const passwordResetKeys = {
  all: ['passwordResets'] as const,
  list: () => ['passwordResets', 'list'] as const,
};

/** Port of apis/users.js listPasswordResetRequests (bare array or envelope). */
export async function listPasswordResetRequests(
  signal?: AbortSignal,
): Promise<PasswordResetRequest[]> {
  return extractResults<PasswordResetRequest>(
    await apiFetch<unknown>('/users/forgot-password/list/', { signal }),
  );
}

export function passwordResetsQueryOptions() {
  return queryOptions({
    queryKey: passwordResetKeys.list(),
    queryFn: ({ signal }) => listPasswordResetRequests(signal),
  });
}

/** Port of adminResetUserPassword. The path has no trailing slash, as legacy sent it. */
export async function adminResetUserPassword(userId: number): Promise<PasswordResetResult> {
  return apiFetch<PasswordResetResult>(`/users/forgot-password/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /users/forgot-password/<id>: drops the request and leaves the
 * password alone (admin only; 204, also when nothing was pending).
 */
export async function cancelPasswordResetRequest(userId: number): Promise<void> {
  await apiFetch<unknown>(`/users/forgot-password/${userId}`, { method: 'DELETE' });
}

/** Takes the row off the list at once and puts it back if the request fails. */
export function useCancelPasswordResetRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPasswordResetRequest,
    onMutate: async (userId: number) => {
      await queryClient.cancelQueries({ queryKey: passwordResetKeys.list() });
      const previous = queryClient.getQueryData<PasswordResetRequest[]>(passwordResetKeys.list());
      queryClient.setQueryData<PasswordResetRequest[]>(passwordResetKeys.list(), (rows) =>
        rows?.filter((r) => r.id !== userId),
      );
      return { previous };
    },
    onError: (_error, _userId, context) => {
      if (context?.previous) queryClient.setQueryData(passwordResetKeys.list(), context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: passwordResetKeys.all }),
  });
}

export function useAdminResetPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminResetUserPassword,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: passwordResetKeys.all }),
  });
}
