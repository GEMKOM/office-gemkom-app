import { Tooltip, type FloatingPosition } from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { AppLink } from './AppLink';
import { FaIcon } from './FaIcon';
import classes from './shell.module.css';

// Same cadence as the legacy bell (notificationBell.js): every 45s, paused
// while the tab is hidden.
const POLL_MS = 45_000;

export function NotificationBell({ tooltipPosition = 'bottom' }: { tooltipPosition?: FloatingPosition }) {
  const visible = useDocumentVisibility() === 'visible';
  const { data: count = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: ({ signal }) =>
      apiFetch<{ count?: number }>('/notifications/unread_count/', { signal }).then((d) => d?.count ?? 0),
    refetchInterval: visible ? POLL_MS : false,
    staleTime: POLL_MS,
  });

  return (
    <Tooltip label="Bildirimler" position={tooltipPosition} offset={12} withArrow>
      <AppLink to="/general/notifications" className={classes.railItem} aria-label="Bildirimler">
        <FaIcon icon="fas fa-bell" />
        {count > 0 ? <span className={classes.badgeDot}>{count > 99 ? '99+' : count}</span> : null}
      </AppLink>
    </Tooltip>
  );
}
