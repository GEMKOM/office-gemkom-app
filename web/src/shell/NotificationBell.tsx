import { categoryMeta } from '@legacy/components/notificationBell/notificationCategories.js';
import { Loader, Popover, ScrollArea, Tooltip, UnstyledButton, VisuallyHidden, type FloatingPosition } from '@mantine/core';
import { useState } from 'react';
import { AppLink, useAppNavigate } from './AppLink';
import { FaIcon } from './FaIcon';
import {
  timeAgo,
  useLatestNotifications,
  useMarkAllRead,
  useMarkRead,
  useUnreadCount,
  type AppNotification,
} from './notifications';
import classes from './shell.module.css';

const countLabel = (count: number) => (count > 99 ? '99+' : String(count));

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: (item: AppNotification) => void }) {
  const meta = categoryMeta(item.category);
  return (
    <li>
      <UnstyledButton className={classes.notifRow} data-unread={!item.is_read || undefined} onClick={() => onOpen(item)}>
        <span className={classes.notifIcon} style={{ background: meta.bg, color: meta.color }}>
          <FaIcon icon={`fas ${meta.icon}`} />
        </span>
        <span className={classes.notifText}>
          <span className={classes.notifTitle}>{item.title || '-'}</span>
          {item.body ? <span className={classes.notifBody}>{item.body}</span> : null}
          <span className={classes.notifMeta}>
            {item.notification_type_display ? <>{item.notification_type_display} · </> : null}
            {timeAgo(item.created_at)}
          </span>
        </span>
        {!item.is_read && (
          <span className={classes.notifDot}>
            <VisuallyHidden>Okunmamış</VisuallyHidden>
          </span>
        )}
      </UnstyledButton>
    </li>
  );
}

function NotificationPanel({ count, onClose }: { count: number; onClose: () => void }) {
  const { data: items, isPending, isError } = useLatestNotifications(true);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useAppNavigate();

  const open = (item: AppNotification) => {
    if (!item.is_read) markRead.mutate(item.id);
    if (item.link && item.link !== '#') {
      onClose();
      navigate(item.link);
    }
  };

  let body;
  if (isPending) {
    body = (
      <div className={classes.notifState}>
        <Loader size="sm" color="gray" />
      </div>
    );
  } else if (isError) {
    body = (
      <div className={classes.notifState}>
        <FaIcon icon="fas fa-triangle-exclamation" size={20} />
        Bildirimler yüklenirken hata oluştu.
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className={classes.notifState}>
        <FaIcon icon="fas fa-bell-slash" size={20} />
        Henüz bildiriminiz yok
      </div>
    );
  } else {
    body = (
      <ScrollArea.Autosize mah="min(440px, 60vh)" type="auto">
        <ul className={classes.notifList}>
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={open} />
          ))}
        </ul>
      </ScrollArea.Autosize>
    );
  }

  return (
    <>
      <div className={classes.notifHeader}>
        <span className={classes.notifHeading}>Bildirimler</span>
        {count > 0 && <span className={classes.notifCount}>{countLabel(count)}</span>}
        {count > 0 && (
          <UnstyledButton className={classes.notifAction} onClick={() => markAllRead.mutate()}>
            Tümünü Okundu Yap
          </UnstyledButton>
        )}
      </div>
      {body}
      <AppLink to="/general/notifications" className={classes.notifFooter} onClick={onClose}>
        Tümünü Gör <FaIcon icon="fas fa-arrow-right" />
      </AppLink>
    </>
  );
}

/**
 * The bell with the unread count; opens the latest notifications. `row` is the
 * expanded rail's labelled version.
 */
export function NotificationBell({
  variant = 'icon',
  position = 'bottom-end',
}: {
  variant?: 'icon' | 'row';
  position?: FloatingPosition;
}) {
  const [opened, setOpened] = useState(false);
  const { data: count = 0 } = useUnreadCount();
  const label = count > 0 ? `Bildirimler, ${count} okunmamış` : 'Bildirimler';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position={position}
      offset={variant === 'row' ? 10 : 14}
      width="min(380px, calc(100vw - 24px))"
      withinPortal
      trapFocus
      returnFocus
      classNames={{ dropdown: classes.notifPanel }}
    >
      <Popover.Target>
        <Tooltip label="Bildirimler" position="right" offset={12} withArrow disabled={opened || variant === 'row' || position.startsWith('bottom')}>
          {variant === 'row' ? (
            <UnstyledButton className={classes.railRow} aria-label={label} onClick={() => setOpened((o) => !o)}>
              <FaIcon icon="fas fa-bell" />
              <span className={classes.railRowLabel}>Bildirimler</span>
              {count > 0 && <span className={classes.rowCount}>{countLabel(count)}</span>}
            </UnstyledButton>
          ) : (
            <UnstyledButton className={classes.railItem} aria-label={label} onClick={() => setOpened((o) => !o)}>
              <FaIcon icon="fas fa-bell" />
              {count > 0 ? <span className={classes.badgeDot}>{countLabel(count)}</span> : null}
            </UnstyledButton>
          )}
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>{opened && <NotificationPanel count={count} onClose={() => setOpened(false)} />}</Popover.Dropdown>
    </Popover>
  );
}
