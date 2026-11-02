import { useDocumentVisibility } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';

// The bell's data, from the same endpoints the legacy bell uses
// (apis/notification/notifications.js).

export interface AppNotification {
  id: number;
  title?: string | null;
  body?: string | null;
  category?: string | null;
  notification_type_display?: string | null;
  link?: string | null;
  is_read: boolean;
  created_at?: string | null;
}

type Page<T> = { results?: T[] } | T[];

// Same cadence as the legacy bell: every 45s, paused while the tab is hidden.
const POLL_MS = 45_000;
const LIST_SIZE = 20;

const keys = {
  all: ['notifications'] as const,
  count: ['notifications', 'unread-count'] as const,
  latest: ['notifications', 'latest'] as const,
};

export function useUnreadCount() {
  const visible = useDocumentVisibility() === 'visible';
  return useQuery({
    queryKey: keys.count,
    queryFn: ({ signal }) =>
      apiFetch<{ count?: number }>('/notifications/unread_count/', { signal }).then((d) => d?.count ?? 0),
    refetchInterval: visible ? POLL_MS : false,
    staleTime: POLL_MS,
  });
}

/**
 * Unread before read, newest first within each group. The server is asked for
 * this ordering too; repeating it keeps the list right if it ignores it.
 */
export function sortUnreadFirst(list: AppNotification[]): AppNotification[] {
  return list.slice().sort((a, b) => {
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

/** The latest notifications, fetched while the popover is open. */
export function useLatestNotifications(enabled: boolean) {
  return useQuery({
    queryKey: keys.latest,
    queryFn: ({ signal }) =>
      apiFetch<Page<AppNotification>>('/notifications/', {
        signal,
        params: { page_size: LIST_SIZE, ordering: 'is_read,-created_at' },
      }).then((page) => sortUnreadFirst(Array.isArray(page) ? page : (page?.results ?? []))),
    enabled,
    staleTime: 0,
  });
}

function setRead(client: ReturnType<typeof useQueryClient>, id: number | 'all') {
  let marked = 0;
  client.setQueryData<AppNotification[]>(keys.latest, (list) =>
    list?.map((n) => {
      if (n.is_read || (id !== 'all' && n.id !== id)) return n;
      marked += 1;
      return { ...n, is_read: true };
    }),
  );
  client.setQueryData<number>(keys.count, (count) => (id === 'all' ? 0 : Math.max(0, (count ?? 0) - marked)));
}

/** Marks one notification read; the row and the badge update at once. */
export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/notifications/${id}/mark_read/`, { method: 'POST' }),
    onMutate: (id) => setRead(client, id),
    onSettled: () => client.invalidateQueries({ queryKey: keys.count }),
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/notifications/mark_all_read/', { method: 'POST' }),
    onMutate: () => setRead(client, 'all'),
    onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

/** "4 dakika önce", "3 gün önce", then a short date after a week (as the legacy bell). */
export function timeAgo(value: string | null | undefined, now = Date.now()): string {
  if (!value) return '-';
  const date = new Date(value);
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (Number.isNaN(minutes)) return '-';
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dakika önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
