import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';

// Port of the admin config calls in apis/notification/notifications.js
// (getNotificationConfigs, updateNotificationConfig, resetNotificationConfigs).
// The user's own notifications live in ../general/notifications.ts.

/** A department choice; older payloads send plain strings. */
export type ConfigGroupChoice =
  | string
  | { value?: string; name?: string; id?: string | number; label?: string; display?: string };

/** A department on a config: a string or { name, display }. */
export type ConfigGroup =
  | string
  | { name?: string; value?: string; id?: string | number; display?: string; label?: string };

/** An org user group on a config: an id, a name, or { id, name }. */
export type ConfigUserGroup =
  string | number | { id?: string | number | null; name?: string | null; title?: string | null };

export interface ConfigUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  [key: string]: unknown;
}

/** One row of GET /notifications/config/ `configs`. */
export interface NotificationConfig {
  notification_type: string;
  notification_type_display?: string | null;
  category?: string | null;
  category_display?: string | null;
  always_notified?: string | null;
  title_template?: string | null;
  body_template?: string | null;
  link_template?: string | null;
  available_vars?: string[] | null;
  default_send_email?: boolean;
  default_send_in_app?: boolean;
  is_default?: boolean;
  is_routable?: boolean;
  enabled?: boolean;
  users?: ConfigUser[] | null;
  groups?: ConfigGroup[] | null;
  user_groups?: ConfigUserGroup[] | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface NotificationConfigsResponse {
  configs?: NotificationConfig[];
  groups?: ConfigGroupChoice[];
  group_choices?: ConfigGroupChoice[];
  team_choices?: ConfigGroupChoice[];
  [key: string]: unknown;
}

/** PATCH /notifications/config/<type>/ body. */
export interface NotificationConfigPatch {
  title_template?: string;
  body_template?: string;
  link_template?: string;
  default_send_email?: boolean;
  default_send_in_app?: boolean;
  enabled?: boolean;
  user_ids?: number[];
  groups?: string[];
  user_groups?: number[];
}

export const notificationConfigKeys = {
  all: ['notificationConfigs'] as const,
};

export function notificationConfigsQueryOptions() {
  return queryOptions({
    queryKey: notificationConfigKeys.all,
    queryFn: ({ signal }) =>
      apiFetch<NotificationConfigsResponse>('/notifications/config/', { signal }),
  });
}

export function updateNotificationConfig(
  notificationType: string,
  data: NotificationConfigPatch,
): Promise<NotificationConfig> {
  return apiFetch<NotificationConfig>(
    `/notifications/config/${encodeURIComponent(notificationType)}/`,
    { method: 'PATCH', body: data },
  );
}

export function resetNotificationConfigs(): Promise<{ message?: string; [key: string]: unknown }> {
  return apiFetch('/notifications/config/reset/', { method: 'POST' });
}

/**
 * The message the legacy calls threw: the body's `detail`, else
 * "Failed to <action>: <status>"; a body that is not JSON gave the Turkish
 * fallback.
 */
export function notificationConfigErrorMessage(
  error: unknown,
  action: string,
  fallback: string,
): string {
  if (!isApiError(error)) return error instanceof Error && error.message ? error.message : fallback;
  if (!error.data || typeof error.data !== 'object') return fallback;
  const detail = (error.data as Record<string, unknown>).detail;
  return typeof detail === 'string' && detail ? detail : `Failed to ${action}: ${error.status}`;
}

export function useUpdateNotificationConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, data }: { type: string; data: NotificationConfigPatch }) =>
      updateNotificationConfig(type, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationConfigKeys.all }),
  });
}

export function useResetNotificationConfigs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetNotificationConfigs,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationConfigKeys.all }),
  });
}
