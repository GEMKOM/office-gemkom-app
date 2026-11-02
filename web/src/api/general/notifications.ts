import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@/shell/notifications';
import { apiFetch } from '../client';
import { toPaginated, type Paginated } from '../types';

/**
 * The Bildirimlerim archive: the calls the navbar bell does not make
 * (apis/notification/notifications.js getNotifications with filters,
 * getNotificationFacets, markNotificationRead/Unread).
 *
 * The bell's own data (unread count, latest list, mark all read) lives in
 * `@/shell/notifications`; these keys sit under the same ['notifications']
 * prefix and every mutation here invalidates that prefix so the bell badge
 * follows the archive.
 */

export interface ArchivedNotification extends AppNotification {
  notification_type?: string | null;
  category_display?: string | null;
}

export interface NotificationsParams {
  search?: string;
  category?: string;
  notification_type?: string;
  /** 'true' | 'false'; left out for both. */
  is_read?: string;
  created_at__date__gte?: string;
  created_at__date__lte?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export type NotificationFacetParams = Omit<NotificationsParams, 'ordering' | 'page' | 'page_size'>;

export interface NotificationFacet {
  value: string;
  label: string;
  count: number;
}

/** GET /notifications/facets/: counts under the current filters. */
export interface NotificationFacets {
  total: number;
  unread: number;
  categories: NotificationFacet[];
  types: NotificationFacet[];
  oldest: string | null;
}

const keys = {
  all: ['notifications'] as const,
  archive: ['notifications', 'archive'] as const,
  facets: ['notifications', 'facets'] as const,
};

function facetList(value: unknown): NotificationFacet[] {
  return Array.isArray(value) ? (value as NotificationFacet[]) : [];
}

/** A `{}` (or partial) reply still gives a usable shape. */
export function normalizeFacets(data: unknown): NotificationFacets {
  const body = (data && typeof data === 'object' ? data : {}) as Partial<
    Record<keyof NotificationFacets, unknown>
  >;
  return {
    total: typeof body.total === 'number' ? body.total : 0,
    unread: typeof body.unread === 'number' ? body.unread : 0,
    categories: facetList(body.categories),
    types: facetList(body.types),
    oldest: typeof body.oldest === 'string' ? body.oldest : null,
  };
}

export async function fetchNotifications(
  params: NotificationsParams,
  signal?: AbortSignal,
): Promise<Paginated<ArchivedNotification>> {
  const data = await apiFetch<unknown>('/notifications/', { params: { ...params }, signal });
  return toPaginated<ArchivedNotification>(data);
}

export async function fetchNotificationFacets(
  params: NotificationFacetParams,
  signal?: AbortSignal,
): Promise<NotificationFacets> {
  const data = await apiFetch<unknown>('/notifications/facets/', { params: { ...params }, signal });
  return normalizeFacets(data);
}

export function notificationsQueryOptions(params: NotificationsParams) {
  return queryOptions({
    queryKey: [...keys.archive, params] as const,
    queryFn: ({ signal }) => fetchNotifications(params, signal),
  });
}

export function notificationFacetsQueryOptions(params: NotificationFacetParams) {
  return queryOptions({
    queryKey: [...keys.facets, params] as const,
    queryFn: ({ signal }) => fetchNotificationFacets(params, signal),
  });
}

type Snapshot = [readonly unknown[], unknown][];

/** Flip one row in every cached archive page and move the unread facet with it. */
function applyReadState(client: QueryClient, id: number, read: boolean): Snapshot {
  const snapshot: Snapshot = [
    ...client.getQueriesData({ queryKey: keys.archive }),
    ...client.getQueriesData({ queryKey: keys.facets }),
  ];
  let changed = false;
  client.setQueriesData<Paginated<ArchivedNotification>>({ queryKey: keys.archive }, (page) => {
    if (!page) return page;
    return {
      ...page,
      results: page.results.map((n) => {
        if (n.id !== id || n.is_read === read) return n;
        changed = true;
        return { ...n, is_read: read };
      }),
    };
  });
  if (changed) {
    client.setQueriesData<NotificationFacets>({ queryKey: keys.facets }, (facets) =>
      facets ? { ...facets, unread: Math.max(0, facets.unread + (read ? -1 : 1)) } : facets,
    );
  }
  return snapshot;
}

/**
 * Mark one notification read or unread (POST mark_read / mark_unread). The row
 * flips at once; a failure puts it back. Settling refetches everything under
 * ['notifications'], the bell included.
 */
export function useSetNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: number; read: boolean }) =>
      apiFetch(`/notifications/${id}/${read ? 'mark_read' : 'mark_unread'}/`, { method: 'POST' }),
    onMutate: async ({ id, read }) => {
      await client.cancelQueries({ queryKey: keys.archive });
      return applyReadState(client, id, read);
    },
    onError: (_error, _vars, snapshot) => {
      snapshot?.forEach(([key, data]) => client.setQueryData(key, data));
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}
