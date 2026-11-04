import { categoryMeta } from '@/shell/notificationCategories';
import {
  Loader,
  Popover,
  SegmentedControl,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
  type FloatingPosition,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { neoLinkTarget, openNeo } from '@/neo';
import { AppLink, useAppNavigate } from './AppLink';
import { FaIcon } from './FaIcon';
import {
  groupByDay,
  timeAgo,
  useLatestNotifications,
  useMarkAllRead,
  useMarkRead,
  useUnreadCount,
  type AppNotification,
} from './notifications';
import classes from './shell.module.css';

const countLabel = (count: number) => (count > 99 ? '99+' : String(count));

type Filter = 'all' | 'unread';

const hasTarget = (item: AppNotification) => Boolean(item.link && item.link !== '#');

function NotificationRow({
  item,
  onOpen,
  onMarkRead,
}: {
  item: AppNotification;
  onOpen: (item: AppNotification) => void;
  onMarkRead: (item: AppNotification) => void;
}) {
  const meta = categoryMeta(item.category);
  return (
    <li className={classes.notifItem} data-unread={!item.is_read || undefined}>
      <UnstyledButton className={classes.notifRow} onClick={() => onOpen(item)}>
        <span className={classes.notifIcon} style={{ background: meta.bg, color: meta.color }}>
          <FaIcon icon={`fas ${meta.icon}`} />
        </span>
        <span className={classes.notifText}>
          <span className={classes.notifTitle}>{item.title || '-'}</span>
          {item.body ? <span className={classes.notifBody}>{item.body}</span> : null}
          <span className={classes.notifMeta}>
            {item.notification_type_display ? <>{item.notification_type_display} · </> : null}
            {timeAgo(item.created_at)}
            {hasTarget(item) ? <FaIcon icon="fas fa-arrow-right" className={classes.notifGo} /> : null}
          </span>
        </span>
        {!item.is_read && (
          <span className={classes.notifDot}>
            <VisuallyHidden>Okunmamış</VisuallyHidden>
          </span>
        )}
      </UnstyledButton>
      {!item.is_read && (
        <Tooltip label="Okundu işaretle" position="left" withArrow>
          <UnstyledButton className={classes.notifCheck} aria-label="Okundu işaretle" onClick={() => onMarkRead(item)}>
            <FaIcon icon="fas fa-check" />
          </UnstyledButton>
        </Tooltip>
      )}
    </li>
  );
}

function NotificationPanel({ count, onClose }: { count: number; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const { data: items, isPending, isError } = useLatestNotifications(true);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const navigate = useAppNavigate();

  const visible = useMemo(
    () => (items ? (filter === 'unread' ? items.filter((n) => !n.is_read) : items) : []),
    [items, filter],
  );
  const groups = useMemo(() => groupByDay(visible), [visible]);

  const open = (item: AppNotification) => {
    if (!item.is_read) markRead.mutate(item.id);
    // Neo's questions on a report open its thread in the panel, on this page.
    const neo = neoLinkTarget(item.link);
    if (neo) {
      onClose();
      openNeo(neo);
      return;
    }
    if (hasTarget(item)) {
      onClose();
      navigate(item.link!);
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
        <span className={classes.notifStateIcon} data-tone="error">
          <FaIcon icon="fas fa-triangle-exclamation" size={20} />
        </span>
        <strong>Bildirimler yüklenemedi</strong>
        Bağlantınızı kontrol edip tekrar deneyin.
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div className={classes.notifState}>
        <span className={classes.notifStateIcon}>
          <FaIcon icon={filter === 'unread' ? 'fas fa-check-double' : 'fas fa-bell-slash'} size={20} />
        </span>
        <strong>{filter === 'unread' ? 'Okunmamış bildirim yok' : 'Henüz bildiriminiz yok'}</strong>
        {filter === 'unread' ? 'Hepsini okudunuz.' : 'Yeni bildirimler burada görünecek.'}
      </div>
    );
  } else {
    body = (
      <div className={classes.notifScroll}>
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className={classes.notifGroup}>{group.label}</h3>
            <ul className={classes.notifList}>
              {group.items.map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={open} onMarkRead={(n) => markRead.mutate(n.id)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className={classes.notifHeader}>
        <span className={classes.notifHeading}>Bildirimler</span>
        {count > 0 && <span className={classes.notifCount}>{countLabel(count)}</span>}
        {count > 0 && (
          <UnstyledButton className={classes.notifAction} onClick={() => markAllRead.mutate()}>
            <FaIcon icon="fas fa-check-double" />
            Tümünü Okundu Yap
          </UnstyledButton>
        )}
      </div>
      {items && items.length > 0 && (
        <div className={classes.notifFilter}>
          <SegmentedControl
            size="xs"
            fullWidth
            aria-label="Bildirim filtresi"
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            data={[
              { value: 'all', label: 'Tümü' },
              { value: 'unread', label: 'Okunmamış' },
            ]}
          />
        </div>
      )}
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
