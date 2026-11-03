import { categoryMeta } from '@legacy/components/notificationBell/notificationCategories.js';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { Skeleton, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { myVacationSummaryQueryOptions } from '@/api/general/vacation';
import { formatNumber } from '@/lib/format';
import { neoLinkTarget, openNeo } from '@/neo';
import { MoreLink } from '@/pages/hub/HubPanels';
import { useAttendanceToday } from '@/shell/attendance';
import { AppLink, useAppNavigate } from '@/shell/AppLink';
import { timeAgo, useLatestNotifications, useMarkRead, type AppNotification } from '@/shell/notifications';
import { FaIcon, Panel, PendingValue, StatusBadge } from '@/ui';
import type { NavPage } from '@/shell/pageVisits';
import { VACATION_PAGE } from './work';
import css from './HomePage.module.css';

// The home page's own panels; the record lists and the approval counts are
// the shared hub panels.

/** Today: attendance (PDKS) and, for those who can request leave, the balance. */
export function TodayPanel() {
  const attendance = useAttendanceToday();
  const canVacation = hasRouteAccess(VACATION_PAGE);
  const summary = useQuery({ ...myVacationSummaryQueryOptions(), enabled: canVacation });
  const model = attendance.data;
  const remaining = summary.data?.annual_leave?.remaining_days;

  return (
    <Panel title="Bugün" icon="fas fa-calendar-day">
      <dl className={css.today}>
        <div>
          <dt>PDKS</dt>
          <dd>
            {attendance.isPending ? (
              <PendingValue />
            ) : attendance.isError || !model ? (
              '-'
            ) : (
              <StatusBadge color={model.tone}>{model.label}</StatusBadge>
            )}
          </dd>
        </div>
        {model?.checkIn || model?.checkOut ? (
          <div>
            <dt>Giriş / Çıkış</dt>
            <dd className={css.mono}>
              {model.checkIn ?? '-'} / {model.checkOut ?? '-'}
            </dd>
          </div>
        ) : null}
        {canVacation ? (
          <div>
            <dt>Kalan yıllık izin</dt>
            <dd>
              {summary.isPending ? (
                <PendingValue />
              ) : remaining === undefined || remaining === null || summary.isError ? (
                '-'
              ) : (
                `${formatNumber(Number(remaining), 1)} gün`
              )}
            </dd>
          </div>
        ) : null}
      </dl>
      {canVacation ? (
        <AppLink to={VACATION_PAGE} className={css.todayLink}>
          <FaIcon icon="fas fa-umbrella-beach" /> İzin taleplerim
        </AppLink>
      ) : null}
    </Panel>
  );
}

const LATEST = 5;

function NotificationRow({ item, onOpen }: { item: AppNotification; onOpen: (item: AppNotification) => void }) {
  const meta = categoryMeta(item.category);
  return (
    <li>
      <UnstyledButton className={css.notif} data-unread={!item.is_read || undefined} onClick={() => onOpen(item)}>
        <span className={css.notifIcon} style={{ background: meta.bg, color: meta.color }} aria-hidden>
          <FaIcon icon={`fas ${meta.icon}`} />
        </span>
        <span className={css.notifText}>
          <span className={css.notifTitle}>{item.title || '-'}</span>
          <span className={css.notifMeta}>
            {item.notification_type_display ? <>{item.notification_type_display} · </> : null}
            {timeAgo(item.created_at)}
          </span>
        </span>
        {!item.is_read ? (
          <span className={css.notifDot}>
            <VisuallyHidden>Okunmamış</VisuallyHidden>
          </span>
        ) : null}
      </UnstyledButton>
    </li>
  );
}

/** The latest notifications (unread first), the same list the bell shows. */
export function NotificationsPanel() {
  const { data, isPending, isError, refetch } = useLatestNotifications(true);
  const markRead = useMarkRead();
  const navigate = useAppNavigate();
  const items = (data ?? []).slice(0, LATEST);

  const open = (item: AppNotification) => {
    if (!item.is_read) markRead.mutate(item.id);
    const neo = neoLinkTarget(item.link);
    if (neo) {
      openNeo(neo);
      return;
    }
    if (item.link && item.link !== '#') navigate(item.link);
  };

  let body;
  if (isPending) {
    body = (
      <div className={css.note}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={18} my={10} />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <p className={css.note}>
        Bildirimler yüklenemedi.{' '}
        <button type="button" className={css.retry} onClick={() => void refetch()}>
          Yeniden Dene
        </button>
      </p>
    );
  } else if (items.length === 0) {
    body = <p className={css.note}>Henüz bir bildiriminiz yok.</p>;
  } else {
    body = (
      <ul className={css.notifs}>
        {items.map((item) => (
          <NotificationRow key={item.id} item={item} onOpen={open} />
        ))}
      </ul>
    );
  }

  return (
    <Panel title="Son Bildirimler" icon="fas fa-bell" actions={<MoreLink to="/general/notifications" />} padded={false}>
      {body}
    </Panel>
  );
}

/** The pages the user opens most, or their department's everyday pages. */
export function ShortcutsPanel({ pages }: { pages: NavPage[] }) {
  if (pages.length === 0) return null;
  return (
    <Panel title="Kısayollar" icon="fas fa-bolt">
      <ul className={css.shortcuts}>
        {pages.map((page) => (
          <li key={page.path}>
            <AppLink to={page.path} className={css.shortcut}>
              <span className={css.shortcutIcon} aria-hidden>
                <FaIcon icon={page.icon} />
              </span>
              <span className={css.shortcutText}>
                <span className={css.shortcutLabel}>{page.label}</span>
                {page.section ? <span className={css.shortcutSection}>{page.section}</span> : null}
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
