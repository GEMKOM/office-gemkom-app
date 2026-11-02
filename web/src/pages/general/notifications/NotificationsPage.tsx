import { categoryMeta } from '@legacy/components/notificationBell/notificationCategories.js';
import { ActionIcon, Button, Group, Loader, Tooltip, UnstyledButton } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Fragment, useMemo, type ReactNode } from 'react';
import {
  notificationFacetsQueryOptions,
  notificationsQueryOptions,
  useSetNotificationRead,
  type ArchivedNotification,
  type NotificationFacetParams,
  type NotificationsParams,
} from '@/api/general/notifications';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import { useAppNavigate } from '@/shell/AppLink';
import { sortUnreadFirst, useMarkAllRead } from '@/shell/notifications';
import {
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  Panel,
  useUrlFilters,
  type FilterConfig,
} from '@/ui';
import classes from './NotificationsPage.module.css';

const PAGE_SIZE = 25;

/**
 * The page opens on unread only: read notifications are the ones already
 * dealt with, and leaving them in pushed everything still waiting below the
 * fold (legacy DEFAULT_READ_FILTER).
 */
const DEFAULT_READ_FILTER = 'false';

const URL_DEFAULTS = {
  search: '',
  notification_type: '',
  is_read: DEFAULT_READ_FILTER,
  from: '',
  to: '',
  category: '',
  page: '1',
};

type FilterKeys = 'search' | 'notification_type' | 'is_read' | 'from' | 'to';
type FilterState = Record<FilterKeys, string>;

const EMPTY_ROWS: ArchivedNotification[] = [];

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function dayKey(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Bugün", "Dün", else "02 Kasım 2026 Pazartesi" (legacy dayLabel). */
export function dayLabel(value: string | null | undefined, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return 'Bugün';
  if (dayKey(date) === dayKey(yesterday)) return 'Dün';
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  });
}

interface RowEntry {
  item: ArchivedNotification;
  /** The "Okunanlar" header goes before this row. */
  readBlock: boolean;
  /** The day header before this row, null when the day did not change. */
  day: string | null;
}

/**
 * Rows under day headers. In the mixed view (`splitByReadState`) the read rows
 * sit in their own block below the unread ones, so the day headers restart
 * there instead of repeating out of order (legacy renderGroupedRows).
 */
export function groupRows(
  rows: ArchivedNotification[],
  splitByReadState: boolean,
  now = new Date(),
): RowEntry[] {
  let currentDay: string | null = null;
  let readBlockOpened = false;
  return rows.map((item) => {
    let readBlock = false;
    if (splitByReadState && item.is_read && !readBlockOpened) {
      readBlockOpened = true;
      readBlock = true;
      currentDay = null;
    }
    const key = dayKey(item.created_at);
    const day = key !== currentDay ? dayLabel(item.created_at, now) : null;
    currentDay = key;
    return { item, readBlock, day };
  });
}

function NotificationRow({
  item,
  onOpen,
  onToggleRead,
}: {
  item: ArchivedNotification;
  onOpen: (item: ArchivedNotification) => void;
  onToggleRead: (item: ArchivedNotification) => void;
}) {
  const meta = categoryMeta(item.category);
  const hasLink = Boolean(item.link && item.link !== '#');
  const toggleLabel = item.is_read ? 'Okunmadı işaretle' : 'Okundu işaretle';
  return (
    <div
      className={classes.row}
      data-unread={!item.is_read || undefined}
      data-testid={`notification-${item.id}`}
    >
      <span className={classes.icon} style={{ background: meta.bg, color: meta.color }} aria-hidden>
        <FaIcon icon={`fas ${meta.icon}`} />
      </span>
      <UnstyledButton
        component="div"
        role="button"
        tabIndex={0}
        className={classes.main}
        onClick={() => onOpen(item)}
      >
        <div className={classes.head}>
          <span className={classes.title}>{item.title || '-'}</span>
          <span
            className={classes.time}
            title={item.created_at ? formatDateTime(item.created_at) : undefined}
          >
            {item.created_at ? formatTime(item.created_at) : ''}
          </span>
        </div>
        {item.body ? <div className={classes.body}>{item.body}</div> : null}
        <div className={classes.meta}>
          {item.notification_type_display ? (
            <span className={classes.tag}>{item.notification_type_display}</span>
          ) : null}
          {item.category_display ? (
            <span className={classes.tag}>{item.category_display}</span>
          ) : null}
        </div>
      </UnstyledButton>
      <div className={classes.actions}>
        {hasLink ? (
          <Tooltip label="Aç" withArrow>
            <ActionIcon variant="subtle" color="gray" aria-label="Aç" onClick={() => onOpen(item)}>
              <FaIcon icon="fas fa-arrow-up-right-from-square" />
            </ActionIcon>
          </Tooltip>
        ) : null}
        <Tooltip label={toggleLabel} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label={toggleLabel}
            onClick={() => onToggleRead(item)}
          >
            <FaIcon icon={item.is_read ? 'fas fa-envelope' : 'fas fa-envelope-open'} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}

function StateBlock({
  icon,
  title,
  children,
}: {
  icon?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={classes.state}>
      {icon ? (
        <FaIcon icon={icon} className={classes.stateIcon} />
      ) : (
        <Loader size="sm" color="gray" />
      )}
      <div className={classes.stateTitle}>{title}</div>
      {children}
    </div>
  );
}

/** Port of general/notifications (notifications.js): the full notification archive. */
export function NotificationsPage() {
  const url = useUrlFilters(URL_DEFAULTS);
  const { values, apply } = url;
  const navigate = useAppNavigate();

  const filters = useMemo<FilterState>(
    () => ({
      search: values.search,
      notification_type: values.notification_type,
      is_read: values.is_read,
      from: values.from,
      to: values.to,
    }),
    [values.search, values.notification_type, values.is_read, values.from, values.to],
  );
  const page = positiveInt(values.page, 1);

  const facetParams: NotificationFacetParams = {
    search: filters.search || undefined,
    category: values.category || undefined,
    notification_type: filters.notification_type || undefined,
    is_read: filters.is_read || undefined,
    created_at__date__gte: filters.from || undefined,
    created_at__date__lte: filters.to || undefined,
  };
  // In the mixed view unread has to come first across the whole archive, not
  // just within the page on screen, so the server orders it.
  const params: NotificationsParams = {
    ordering: filters.is_read === '' ? 'is_read,-created_at' : '-created_at',
    page_size: PAGE_SIZE,
    page,
    ...facetParams,
  };

  const list = useQuery({
    ...notificationsQueryOptions(params),
    placeholderData: keepPreviousData,
  });
  const facetsQuery = useQuery({
    ...notificationFacetsQueryOptions(facetParams),
    placeholderData: keepPreviousData,
  });
  const facets = facetsQuery.data;
  const count = list.data?.count ?? 0;
  const loaded = list.data?.results ?? EMPTY_ROWS;

  // Rows flipped in place can stop matching the status filter; they drop out
  // here, and the mixed view keeps unread first (legacy visibleNotifications).
  const rows = useMemo(() => {
    if (filters.is_read === '') return sortUnreadFirst(loaded) as ArchivedNotification[];
    return loaded.filter((n) => String(Boolean(n.is_read)) === filters.is_read);
  }, [loaded, filters.is_read]);

  const setRead = useSetNotificationRead();
  const markAll = useMarkAllRead();

  const toggleRead = (item: ArchivedNotification) => {
    setRead.mutate(
      { id: item.id, read: !item.is_read },
      { onError: () => notify.error('Bildirim durumu güncellenemedi') },
    );
  };

  const open = async (item: ArchivedNotification) => {
    if (!item.is_read) {
      try {
        await setRead.mutateAsync({ id: item.id, read: true });
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }
    if (item.link && item.link !== '#') navigate(item.link);
  };

  const markAllRead = () => {
    markAll.mutate(undefined, {
      onSuccess: () => notify.success('Tüm bildirimler okundu olarak işaretlendi'),
      onError: () => notify.error('Bildirimler güncellenemedi'),
    });
  };

  const refresh = () => {
    if (page === 1) {
      void list.refetch();
      void facetsQuery.refetch();
    } else {
      apply({ page: '1' });
    }
  };

  const goToPage = (next: number) => {
    apply({ page: String(next) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const typeOptions = useMemo(
    () => (facets?.types ?? []).map((t) => ({ value: t.value, label: `${t.label} (${t.count})` })),
    [facets?.types],
  );
  const filterConfig: FilterConfig<FilterKeys>[] = [
    { type: 'text', key: 'search', label: 'Ara', placeholder: 'İş emri no, başlık, içerik...' },
    {
      type: 'select',
      key: 'notification_type',
      label: 'Bildirim Türü',
      placeholder: 'Tümü',
      options: typeOptions,
    },
    {
      type: 'select',
      key: 'is_read',
      label: 'Durum',
      placeholder: 'Tümü',
      searchable: false,
      options: [
        { value: 'false', label: 'Okunmamış' },
        { value: 'true', label: 'Okunmuş' },
      ],
    },
    { type: 'date', key: 'from', label: 'Başlangıç' },
    { type: 'date', key: 'to', label: 'Bitiş' },
  ];

  // The default unread-only view is the resting state, not a filter.
  const hasActiveFilters =
    Boolean(
      filters.search || filters.notification_type || filters.from || filters.to || values.category,
    ) || filters.is_read !== DEFAULT_READ_FILTER;

  const unread = facets?.unread ?? 0;
  const figure = (value: number | undefined) =>
    value === undefined ? '–' : value.toLocaleString('tr-TR');

  // Every category the user has ever received stays on the rail (at zero when
  // the filters exclude it), so the tabs do not vanish as filters narrow.
  const tabs = [
    { value: '', label: 'Tümü', count: facets?.total ?? 0, icon: 'fa-inbox' },
    ...(facets?.categories ?? []).map((c) => ({ ...c, icon: categoryMeta(c.value).icon })),
  ];

  let body: ReactNode;
  if (list.isPending) {
    body = <StateBlock title="Bildirimler yükleniyor…" />;
  } else if (list.isError && !list.data) {
    body = (
      <StateBlock icon="fas fa-triangle-exclamation" title="Bildirimler yüklenirken hata oluştu.">
        <Button size="xs" variant="default" onClick={() => void list.refetch()}>
          Tekrar dene
        </Button>
      </StateBlock>
    );
  } else if (rows.length === 0) {
    // On the default unread view an empty list is good news, not a dead end.
    body =
      filters.is_read === DEFAULT_READ_FILTER && !hasActiveFilters ? (
        <StateBlock icon="fas fa-check-circle" title="Okunmamış bildirim yok.">
          <div>Geçmiş bildirimleriniz için durum filtresini &quot;Tümü&quot; yapın.</div>
        </StateBlock>
      ) : (
        <StateBlock
          icon="fas fa-bell-slash"
          title={
            hasActiveFilters ? 'Bu filtrelere uyan bildirim bulunamadı.' : 'Henüz bildiriminiz yok.'
          }
        >
          {hasActiveFilters ? <div>Filtreleri temizleyip tekrar deneyin.</div> : null}
        </StateBlock>
      );
  } else {
    body = (
      <div className={classes.list} data-fetching={list.isFetching || undefined}>
        {groupRows(rows, filters.is_read === '').map(({ item, readBlock, day }) => (
          <Fragment key={item.id}>
            {readBlock ? <div className={classes.group}>Okunanlar</div> : null}
            {day !== null ? <div className={classes.day}>{day}</div> : null}
            <NotificationRow item={item} onOpen={(n) => void open(n)} onToggleRead={toggleRead} />
          </Fragment>
        ))}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const pager =
    list.data && rows.length > 0 ? (
      <div className={classes.pager}>
        {totalPages <= 1 ? (
          <span>{count} bildirim</span>
        ) : (
          <>
            <span>
              {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, count)} / {count}
            </span>
            <Group gap="sm">
              <Button
                size="xs"
                variant="default"
                disabled={page <= 1}
                leftSection={<FaIcon icon="fas fa-chevron-left" />}
                onClick={() => goToPage(page - 1)}
              >
                Önceki
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                size="xs"
                variant="default"
                disabled={page >= totalPages}
                rightSection={<FaIcon icon="fas fa-chevron-right" />}
                onClick={() => goToPage(page + 1)}
              >
                Sonraki
              </Button>
            </Group>
          </>
        )}
      </div>
    ) : null;

  return (
    <>
      <PageHeader
        title="Bildirimlerim"
        subtitle="Tüm bildirim geçmişiniz — arayın, filtreleyin, tekrar açın"
        icon="fas fa-bell"
        stats={[
          { id: 'notif-unread-count', label: 'Okunmamış', value: figure(facets?.unread) },
          { id: 'notif-total-count', label: 'Toplam', value: figure(facets?.total) },
        ]}
        actions={
          <Button
            leftSection={<FaIcon icon="fas fa-check-double" />}
            disabled={!unread}
            loading={markAll.isPending}
            onClick={markAllRead}
          >
            Tümünü Okundu İşaretle
          </Button>
        }
      />

      <Panel
        padded={false}
        headerLeft={
          <FilterBar
            inline
            filters={filterConfig}
            values={filters}
            onApply={(next) => apply({ ...next, page: '1' })}
            // Temizle returns to the default unread view, not to everything.
            onClear={() => apply({ ...URL_DEFAULTS })}
          />
        }
        actions={
          <Button
            size="xs"
            variant="default"
            leftSection={<FaIcon icon="fas fa-sync-alt" />}
            onClick={refresh}
            loading={list.isFetching && !list.isPending}
          >
            Yenile
          </Button>
        }
        footer={pager}
      >
        {facets ? (
          <>
            <div className={classes.tabs} role="tablist" aria-label="Kategori">
              {tabs.map((tab) => {
                const active = values.category === tab.value;
                return (
                  <UnstyledButton
                    key={tab.value || 'all'}
                    role="tab"
                    aria-selected={active}
                    className={classes.tab}
                    data-active={active || undefined}
                    data-empty={(!tab.count && !active) || undefined}
                    onClick={() => apply({ category: tab.value, page: '1' })}
                  >
                    <FaIcon icon={`fas ${tab.icon}`} />
                    {tab.label}
                    <span className={classes.tabCount}>{tab.count}</span>
                  </UnstyledButton>
                );
              })}
            </div>
            <div className={classes.since}>
              {facets.oldest
                ? `${formatDate(facets.oldest, { day: '2-digit', month: 'long', year: 'numeric' })} tarihinden bu yana`
                : 'Henüz bildirim yok'}
            </div>
          </>
        ) : null}
        {body}
      </Panel>
    </>
  );
}
