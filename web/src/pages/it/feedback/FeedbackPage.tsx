import { Alert, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  feedbackReportsQueryOptions,
  feedbackStatsQueryOptions,
  isForbidden,
  type FeedbackFilters,
  type FeedbackReport,
} from '@/api/it/feedback';
import {
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type DataTableColumn,
  type FilterConfig,
} from '@/ui';
import {
  KIND_META,
  kindMeta,
  PRIORITY_LABELS,
  shortDateTime,
  STATUS_META,
  FeedbackStatusBadge,
  truncate,
  usd,
} from './feedbackMeta';
import { FeedbackReportModal } from './FeedbackReportModal';

// Legacy kept its filters in memory; here they live in the URL.
const URL_DEFAULTS = { status: '', kind: '', q: '' };
type FilterState = { status: string; kind: string; q: string };

const filterConfig: FilterConfig<keyof FilterState>[] = [
  { type: 'text', key: 'q', label: 'Ara', placeholder: 'Başlık veya açıklamada ara...' },
  {
    type: 'select',
    key: 'status',
    label: 'Durum',
    placeholder: 'Tümü',
    searchable: false,
    options: Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label })),
  },
  {
    type: 'select',
    key: 'kind',
    label: 'Tür',
    placeholder: 'Tümü',
    searchable: false,
    options: Object.entries(KIND_META).map(([value, meta]) => ({ value, label: meta.label })),
  },
];

const EMPTY_ROWS: FeedbackReport[] = [];

function GithubCell({ row }: { row: FeedbackReport }) {
  const entries = row.github_issues ?? [];
  if (!entries.length) return <>—</>;
  const [icon, title, color] = entries.some((e) => e.pr_merged_at)
    ? ['fas fa-code-merge', 'PR merge edildi', 'var(--mantine-color-green-8)']
    : entries.some((e) => e.pr_number)
      ? ['fas fa-code-pull-request', 'PR açık', 'var(--mantine-color-blue-7)']
      : ['fas fa-circle-dot', 'Issue açık', 'var(--gk-muted)'];
  return (
    <span title={title} aria-label={title}>
      <FaIcon icon={icon} color={color} />
    </span>
  );
}

const columns: DataTableColumn<FeedbackReport>[] = [
  { key: 'id', header: '#', width: 55 },
  { key: 'created_at', header: 'Tarih', width: 135, render: (row) => shortDateTime(row.created_at) },
  {
    key: 'reporter_name',
    header: 'Bildiren',
    width: 150,
    render: (row) => row.reporter_name || row.reporter_username || '?',
  },
  {
    key: 'kind',
    header: 'Tür',
    width: 110,
    render: (row) => {
      const meta = kindMeta(row.kind);
      return (
        <>
          <FaIcon icon={meta.icon} style={{ color: 'var(--gk-muted)', marginRight: 4 }} />
          {meta.label}
        </>
      );
    },
  },
  {
    key: 'title',
    header: 'Başlık',
    render: (row) => (
      <>
        <strong>{truncate(row.title || '', 90)}</strong>
        {row.ai_summary ? (
          <Text c="dimmed" fz={12}>
            {truncate(row.ai_summary, 110)}
          </Text>
        ) : null}
      </>
    ),
  },
  {
    key: 'priority',
    header: 'Öncelik',
    width: 85,
    render: (row) => (row.priority ? PRIORITY_LABELS[row.priority] || row.priority : '—'),
  },
  { key: 'status', header: 'Durum', width: 135, render: (row) => <FeedbackStatusBadge status={row.status} /> },
  { key: 'github_issues', header: 'GitHub', width: 75, render: (row) => <GithubCell row={row} /> },
];

/** Port of it/feedback (feedback.js): the manager view of the feedback pipeline. */
export function FeedbackPage() {
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(
    () => ({ status: values.status, kind: values.kind, q: values.q }),
    [values.status, values.kind, values.q],
  );
  const params: FeedbackFilters = { status: filters.status, kind: filters.kind, q: filters.q.trim() };

  const stats = useQuery(feedbackStatsQueryOptions());
  const denied = isForbidden(stats.error);
  const list = useQuery({ ...feedbackReportsQueryOptions(params), enabled: !denied });
  const [openId, setOpenId] = useState<number | null>(null);
  const closeReport = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (stats.isError && !isForbidden(stats.error)) notify.error(stats.error, { fallback: 'İstatistikler yüklenemedi.' });
  }, [stats.isError, stats.error]);
  useEffect(() => {
    if (list.isError && !isForbidden(list.error)) notify.error(list.error, { fallback: 'Bildirimler yüklenemedi.' });
  }, [list.isError, list.error]);

  const refresh = () => {
    void stats.refetch();
    void list.refetch();
  };

  const figure = (value: string | number | undefined) =>
    stats.data ? String(value ?? '') : '–';

  return (
    <>
      <PageHeader
        title="Geri Bildirimler"
        subtitle="Hata ve öneri bildirimleri — AI triyajı, geliştirme kuyruğu ve PR durumları"
        icon="fas fa-bug"
        backTo="/it/"
        stats={
          denied
            ? undefined
            : [
                { id: 'fb-open', label: 'Açık Bildirim', value: figure(stats.data?.open_total) },
                { id: 'fb-awaiting', label: 'Kararın Bekleniyor', value: figure(stats.data?.awaiting_decision) },
                { id: 'fb-pipeline', label: 'AI Hattında (Issue/PR)', value: figure(stats.data?.in_pipeline) },
                { id: 'fb-done', label: 'Tamamlanan (30 gün)', value: figure(stats.data?.done_30d) },
                {
                  id: 'fb-cost',
                  label: 'AI Maliyeti (30 gün)',
                  value: stats.data ? usd(stats.data.ai_cost_30d) : '–',
                },
              ]
        }
      />

      {denied ? (
        <Alert color="gray" icon={<FaIcon icon="fas fa-lock" />}>
          Geri bildirim yönetimi yetkiniz yok. Bu sayfa AI triyaj kararlarını ve geliştirme kuyruğunu yönettiği için
          ayrı bir yetkiye bağlıdır.
        </Alert>
      ) : (
        <DataTable
          title="Bildirimler"
          icon="fas fa-bug"
          filters={
            <FilterBar
              inline
              filters={filterConfig}
              values={filters}
              onApply={(next) => apply(next)}
              onClear={() => apply({ status: '', kind: '', q: '' })}
            />
          }
          data={list.data ?? EMPTY_ROWS}
          columns={columns}
          getRowId={(row) => String(row.id)}
          loading={list.isFetching}
          verticalSpacing="xs"
          emptyMessage="Bildirim yok"
          onRowClick={(row) => setOpenId(row.id)}
          onRefresh={refresh}
        />
      )}

      {openId !== null ? <FeedbackReportModal key={openId} reportId={openId} onClose={closeReport} /> : null}
    </>
  );
}
