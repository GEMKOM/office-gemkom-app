import { categoryMeta } from '@/shell/notificationCategories';
import { hasRouteAccess } from '@/auth/accessControl';
import { Popover, Skeleton, TextInput, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { myVacationSummaryQueryOptions } from '@/api/general/vacation';
import { formatNumber } from '@/lib/format';
import { neoLinkTarget, openNeo } from '@/neo';
import { MoreLink } from '@/pages/hub/HubPanels';
import { useAttendanceToday } from '@/shell/attendance';
import { AppLink, useAppNavigate } from '@/shell/AppLink';
import { timeAgo, useLatestNotifications, useMarkRead, type AppNotification } from '@/shell/notifications';
import { CountBadge, FaIcon, Panel, PendingValue, StatusBadge } from '@/ui';
import type { NavPage } from '@/shell/pageVisits';
import type { Shortcut } from './shortcuts';
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
export function NotificationsPanel({ unread }: { unread?: number }) {
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
    <Panel
      title="Son Bildirimler"
      icon="fas fa-bell"
      badge={<CountBadge count={unread} label="okunmamış" />}
      actions={<MoreLink to="/general/notifications" />}
      padded={false}
    >
      {body}
    </Panel>
  );
}

const PICKER_ROWS = 8;
const lower = (text: string) => text.toLocaleLowerCase('tr');

/** Search the menu for a page to pin. */
function AddShortcut({ pages, onPin }: { pages: NavPage[]; onPin: (route: string) => void }) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const needle = lower(query.trim());
  const matches = pages
    .filter((page) => !needle || lower(`${page.section ?? ''} ${page.label}`).includes(needle))
    .slice(0, PICKER_ROWS);

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={320} shadow="md" trapFocus returnFocus>
      <Popover.Target>
        <UnstyledButton className={css.addShortcut} onClick={() => setOpened((o) => !o)} aria-label="Kısayol ekle">
          <FaIcon icon="fas fa-plus" /> <span className={css.addShortcutText}>Ekle</span>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Sayfa ara..."
          aria-label="Sayfa ara"
          data-autofocus
        />
        <ul className={css.picker}>
          {matches.map((page) => (
            <li key={page.path}>
              <UnstyledButton
                className={css.pickerRow}
                onClick={() => {
                  onPin(page.path);
                  setOpened(false);
                  setQuery('');
                }}
              >
                <FaIcon icon={page.icon} />
                <span className={css.shortcutText}>
                  <span className={css.shortcutLabel}>{page.label}</span>
                  {page.section ? <span className={css.shortcutSection}>{page.section}</span> : null}
                </span>
              </UnstyledButton>
            </li>
          ))}
          {matches.length === 0 ? <li className={css.pickerEmpty}>Eşleşen sayfa yok.</li> : null}
        </ul>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * "Kısayollar", right under the band: the pinned pages, the ones the user
 * opens most and their department's everyday pages, one click away. The pin
 * on a chip keeps it there; "Ekle" pins any page of the menu.
 */
export function ShortcutsBar({
  pages,
  addable,
  onToggle,
}: {
  pages: Shortcut[];
  /** Menu pages the user may open, to pick from. */
  addable: NavPage[];
  onToggle: (route: string) => void;
}) {
  const shown = new Set(pages.filter((page) => page.pinned).map((page) => page.path));
  const choices = addable.filter((page) => !shown.has(page.path));
  // Two pages can share a name ("Kayıt Defteri" in Satın Alma and in Mesai): say where.
  const labels = pages.map((page) => page.label);
  const nameOf = (page: Shortcut) =>
    page.section && labels.filter((label) => label === page.label).length > 1 ? `${page.label} · ${page.section}` : page.label;
  if (pages.length === 0 && choices.length === 0) return null;
  return (
    <section className={css.bar} aria-labelledby="home-shortcuts">
      <h2 id="home-shortcuts" className={css.barTitle}>
        <FaIcon icon="fas fa-bolt" /> Kısayollar
      </h2>
      <ul className={css.chips}>
        {pages.map((page) => (
          <li key={page.path} className={css.chipItem} data-pinned={page.pinned || undefined}>
            <AppLink to={page.path} className={css.chip} title={page.section ? `${page.section} › ${page.label}` : page.label}>
              <span className={css.chipIcon} aria-hidden>
                <FaIcon icon={page.icon} />
              </span>
              <span className={css.chipLabel}>{nameOf(page)}</span>
            </AppLink>
            <button
              type="button"
              className={css.pin}
              aria-pressed={page.pinned}
              aria-label={page.pinned ? `${page.label} sabitlemesini kaldır` : `${page.label} sabitle`}
              title={page.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
              onClick={() => onToggle(page.path)}
            >
              <FaIcon icon="fas fa-thumbtack" />
            </button>
          </li>
        ))}
      </ul>
      {choices.length > 0 ? <AddShortcut pages={choices} onPin={onToggle} /> : null}
    </section>
  );
}
