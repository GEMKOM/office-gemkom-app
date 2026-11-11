import { Alert, Button, Loader } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { isApiError } from '@/api';
import {
  dailySummaryDetailQueryOptions,
  neoConversationQueryOptions,
  neoKeys,
  useDailySummaryDetail,
  useDailySummaryRows,
  useNeoConversation,
  useNeoQuestions,
  useNeoSummary,
  useRegenerateDailySummary,
  useRunDailySummary,
  type DailySummaryRow,
  type DailySummaryRunResult,
  type NeoQuestion,
} from '@/api/it/neo';
import { formatNumber } from '@/lib/format';
import {
  confirm,
  DataTable,
  FaIcon,
  FilterBar,
  notify,
  PageHeader,
  useUrlFilters,
  type FilterConfig,
  type NotifyType,
  type PageFigure,
  type RowAction,
} from '@/ui';
import {
  jobColumns,
  questionColumns,
  reasonColumns,
  shareColumns,
  summaryColumns,
  toolColumns,
  userColumns,
  weekColumns,
  type ShareRow,
  type WeekRow,
} from './columns';
import {
  avgReadSeconds,
  formatSummaryDate,
  percentileLabel,
  readSecondsLabel,
  reasonLabel,
  sourceLabel,
  sumSummaryCost,
  usd,
} from './labels';
import { ConversationModal, DailySummaryModal } from './NeoModals';
import classes from './NeoUsagePage.module.css';

const PAGE_SIZE = 25;
const DEFAULT_DAYS = 30;

// Legacy kept the filters in memory only; here they live in the URL.
// days '' = the legacy default of 30.
const URL_DEFAULTS = { days: '', q: '', page: '1' };

type FilterState = { days: string; q: string };

const filterConfig: FilterConfig<keyof FilterState>[] = [
  { type: 'text', key: 'q', label: 'Soru Ara', placeholder: 'Soru içinde ara...' },
  {
    type: 'select',
    key: 'days',
    label: 'Dönem',
    placeholder: 'Son 30 gün',
    searchable: false,
    options: [
      { value: '7', label: 'Son 7 gün' },
      { value: '30', label: 'Son 30 gün' },
      { value: '90', label: 'Son 90 gün' },
    ],
  },
];

const EMPTY_FILTERS: FilterState = { days: '', q: '' };
const NO_ROWS: never[] = [];

// run_daily_summary() status → [toast text, toast type]; 'failed' is handled
// separately because its message comes from the response.
const RUN_MESSAGES: Record<string, [string, NotifyType]> = {
  ok: ['Özet üretildi', 'success'],
  exists: ['Bugünün özeti zaten var', 'info'],
  empty: ['Aktivite yok', 'info'],
  already_running: ['Özet şu anda üretiliyor', 'info'],
  skipped_weekday: ['Hafta sonu: özet üretilmedi', 'info'],
  disabled: ['Günlük özet devre dışı', 'info'],
};

/** One toast for both run and regenerate responses (task body or analytics row). */
function notifyRunResult(result: DailySummaryRunResult | undefined, failureDetail?: string, okText?: string) {
  const status = result?.status;
  if (status === 'failed') {
    notify.error(failureDetail || 'Özet üretilemedi.');
    return;
  }
  const entry = status ? RUN_MESSAGES[status] : undefined;
  if (entry) {
    notify.show(status === 'ok' && okText ? okText : entry[0], entry[1]);
    return;
  }
  notify.info(`Durum: ${status || 'bilinmiyor'}`);
}

function positiveInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** [key, count] pairs → table rows that know the period's total. */
function shareRows(pairs: readonly (readonly [string, number])[], label: (key: string) => string): ShareRow[] {
  const total = pairs.reduce((acc, [, count]) => acc + count, 0);
  return pairs.map(([key, count]) => ({ key, label: label(key), count, total }));
}

const isForbidden = (error: unknown) => isApiError(error) && error.status === 403;

/** Port of it/neo (neo.js): Neo usage analytics, gated by manage_assistant_analytics. */
export function NeoUsagePage() {
  const queryClient = useQueryClient();
  const { values, apply } = useUrlFilters(URL_DEFAULTS);
  const filters = useMemo<FilterState>(() => ({ days: values.days, q: values.q }), [values.days, values.q]);
  const days = Number(values.days) || DEFAULT_DAYS;
  const q = values.q.trim();
  const page = positiveInt(values.page, 1);

  const summary = useNeoSummary(days);
  const summaryRows = useDailySummaryRows(days);
  const questions = useNeoQuestions({ days, q, page, pageSize: PAGE_SIZE });
  const denied = isForbidden(summary.error);

  // 403 is the page-level "no permission" state, not a toast.
  useEffect(() => {
    if (summary.isError && !isForbidden(summary.error)) {
      notify.error(summary.error, { fallback: 'Kullanım özeti yüklenemedi.' });
    }
  }, [summary.isError, summary.error, summary.errorUpdatedAt]);
  useEffect(() => {
    if (summaryRows.isError && !isForbidden(summaryRows.error)) {
      notify.error(summaryRows.error, { fallback: 'Günlük özetler yüklenemedi.' });
    }
  }, [summaryRows.isError, summaryRows.error, summaryRows.errorUpdatedAt]);
  useEffect(() => {
    if (questions.isError && !isForbidden(questions.error)) {
      notify.error(questions.error, { fallback: 'Soru kayıtları yüklenemedi.' });
    }
  }, [questions.isError, questions.error, questions.errorUpdatedAt]);

  const data = summary.data;
  const engagement = data?.engagement;
  // A failed summaries call shows an empty table and $0 (legacy never let it take the page down).
  const rows = summaryRows.isError ? NO_ROWS : (summaryRows.data ?? NO_ROWS);

  // ---- figures (legacy renderStats) ----
  const figures = useMemo<PageFigure[]>(() => {
    const blank = '–';
    const outcomes = Object.fromEntries((data?.outcomes ?? []).map((o) => [o.outcome, o.count]));
    const declined = (outcomes.declined_budget || 0) + (outcomes.declined_permission || 0);
    const rowsReady = summaryRows.isSuccess || summaryRows.isError;
    return [
      { id: 'neo-stat-questions', label: data ? `Soru (${data.days} gün)` : 'Soru', value: data ? formatNumber(data.questions) : blank },
      { id: 'neo-stat-users', label: 'Aktif Kullanıcı', value: data ? formatNumber(data.active_users) : blank },
      { id: 'neo-stat-cost', label: 'Maliyet', value: data ? usd(data.total_cost_usd) : blank },
      ...(engagement
        ? [{ id: 'neo-stat-per-user', label: 'Soru / Kişi', value: formatNumber(engagement.questions_per_user, 1) }]
        : []),
      // Median and p90 once the backend sends them: one slow answer moved the
      // average more than the many quick ones.
      engagement
        ? {
            id: 'neo-stat-latency',
            label: 'Yanıt Süresi (medyan / %90)',
            value: percentileLabel(engagement.latency.p50_ms, engagement.latency.p90_ms),
          }
        : {
            id: 'neo-stat-latency',
            label: 'Ort. Yanıt Süresi',
            value: data ? `${((data.avg_latency_ms ?? 0) / 1000).toFixed(1)} sn` : blank,
          },
      ...(engagement
        ? [
            {
              id: 'neo-stat-incomplete',
              label: 'Eksik Yanıt',
              value: `${engagement.truncated} kesik · ${engagement.tool_limit_hits} limit`,
            },
          ]
        : []),
      {
        id: 'neo-stat-feedback',
        label: declined ? `Geri Bildirim · ${declined} red` : 'Geri Bildirim',
        value: data ? `${data.feedback?.up ?? 0} 👍 · ${data.feedback?.down ?? 0} 👎` : blank,
      },
      { id: 'neo-stat-summary-cost', label: 'Günlük Özet maliyeti', value: rowsReady ? usd(sumSummaryCost(rows)) : blank },
      {
        id: 'neo-stat-summary-read',
        label: 'Ort. okuma süresi',
        value: rowsReady ? readSecondsLabel(avgReadSeconds(rows)) : blank,
      },
    ];
  }, [data, engagement, rows, summaryRows.isSuccess, summaryRows.isError]);

  // ---- engagement tables: newest week first, shares of the period ----
  const weekRows = useMemo<WeekRow[]>(() => {
    const weeks = engagement?.weekly ?? [];
    const busiest = Math.max(0, ...weeks.map((w) => w.questions));
    return weeks
      .map((w) => ({ ...w, scale: busiest ? w.questions / busiest : 0 }))
      .reverse();
  }, [engagement]);
  const sourceRows = useMemo(
    () => shareRows(engagement?.sources.map((s) => [s.source, s.count] as const) ?? [], sourceLabel),
    [engagement],
  );
  const reasonRows = useMemo(
    () => shareRows(engagement?.feedback_reasons.map((r) => [r.reason, r.count] as const) ?? [], reasonLabel),
    [engagement],
  );

  // ---- refresh: everything again, questions from page 1 (legacy loadAll) ----
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...neoKeys.all, 'summary'] });
    void queryClient.invalidateQueries({ queryKey: neoKeys.dailySummaries });
    void queryClient.invalidateQueries({
      queryKey: neoKeys.questionsAll,
      refetchType: page === 1 ? 'active' : 'none',
    });
    if (page !== 1) apply({ page: '1' });
  };

  // ---- conversation transcript ----
  const [conversationId, setConversationId] = useState<number | null>(null);
  const conversation = useNeoConversation(conversationId);
  const openConversation = async (row: NeoQuestion) => {
    try {
      // Fetched before the modal opens, as legacy did.
      await queryClient.fetchQuery(neoConversationQueryOptions(row.conversation_id));
      setConversationId(row.conversation_id);
    } catch (error) {
      notify.error(error, { fallback: 'Sohbet yüklenemedi.' });
    }
  };

  // ---- daily summary detail ----
  const [summaryId, setSummaryId] = useState<number | null>(null);
  const summaryDetail = useDailySummaryDetail(summaryId);
  const openSummary = async (row: DailySummaryRow) => {
    try {
      await queryClient.fetchQuery(dailySummaryDetailQueryOptions(row.id));
      setSummaryId(row.id);
    } catch (error) {
      notify.error(error, { fallback: 'Özet yüklenemedi.' });
    }
  };

  // ---- run today's summary ----
  const run = useRunDailySummary();
  const runToday = async () => {
    try {
      const result = await run.mutateAsync();
      notifyRunResult(result, result?.error);
    } catch (error) {
      notify.error(error, { fallback: 'Özet üretilemedi.' });
    }
  };

  // ---- regenerate (synchronous on the server, 30–120 s) ----
  const regenerate = useRegenerateDailySummary();
  const [regenerating, setRegenerating] = useState<ReadonlySet<number>>(() => new Set());
  const confirmRegenerate = async (row: DailySummaryRow) => {
    const ok = await confirm({
      title: 'Özeti yeniden üret',
      icon: 'fas fa-arrows-rotate',
      message: `${formatSummaryDate(row.summary_date)} özeti yeniden üretilsin mi?`,
      description:
        'Mevcut özet yeni sürümle değiştirilir, okundu bilgileri korunur. İşlem 1–2 dakika sürebilir ve API maliyeti oluşturur.',
      confirmLabel: 'Yeniden üret',
    });
    if (!ok) return;
    // The dialog closes at once; the row carries the spinner while the call runs.
    setRegenerating((prev) => new Set(prev).add(row.id));
    try {
      const result = await regenerate.mutateAsync(row.id);
      notifyRunResult(result, result?.error_detail, 'Özet yeniden üretildi');
    } catch (error) {
      notify.error(error, { fallback: 'Özet yeniden üretilemedi.' });
    } finally {
      setRegenerating((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const summaryActions = (row: DailySummaryRow): RowAction<DailySummaryRow>[] => {
    const busy = regenerating.has(row.id);
    return [
      { key: 'view', label: 'Görüntüle', icon: 'fas fa-eye', color: 'primary', onClick: (r) => void openSummary(r) },
      {
        key: 'regenerate',
        label: 'Yeniden üret',
        icon: 'fas fa-arrows-rotate',
        hidden: busy,
        onClick: (r) => void confirmRegenerate(r),
      },
      {
        key: 'regenerating',
        label: 'Yeniden üretiliyor…',
        icon: 'fas fa-spinner fa-spin',
        hidden: !busy,
        disabled: true,
        onClick: () => {},
      },
    ];
  };

  const header = (
    <PageHeader
      title="Neo Kullanımı"
      subtitle="Kim neyi sordu, ne kadar kullandı — soru kayıtları, konu dağılımı ve maliyet"
      icon="fas fa-robot"
      backTo="/it/"
      stats={denied ? undefined : figures}
      actions={
        <Button variant="default" leftSection={<FaIcon icon="fas fa-sync-alt" />} onClick={refresh}>
          Yenile
        </Button>
      }
    />
  );

  if (denied) {
    return (
      <>
        {header}
        <Alert color="red" variant="light" role="alert" icon={<FaIcon icon="fas fa-lock" />}>
          Neo kullanım analizlerini görüntüleme yetkiniz yok. Soru kayıtları kişisel veri içerdiğinden bu sayfa ayrı
          bir yetkiye bağlıdır.
        </Alert>
      </>
    );
  }

  const loadingSummary = summary.isFetching;

  return (
    <>
      {header}
      <div className={classes.stack}>
        <FilterBar
          title="Filtrele"
          filters={filterConfig}
          values={filters}
          onApply={(next) => apply({ ...next, page: '1' })}
          onClear={() => apply({ ...EMPTY_FILTERS, page: '1' })}
        />

        {engagement ? (
          <div className={`${classes.breakdown} ${classes.engagement}`}>
            <div className={classes.cell}>
              <DataTable
                title="Haftalık Kullanım"
                icon="fas fa-chart-column"
                data={weekRows}
                columns={weekColumns}
                getRowId={(row) => row.week_start}
                loading={loadingSummary}
                emptyMessage="Kayıt yok"
              />
            </div>
            <div className={classes.cell}>
              <DataTable
                title="Sorular Nereden Geliyor"
                icon="fas fa-signs-post"
                data={sourceRows}
                columns={shareColumns}
                getRowId={(row) => row.key}
                loading={loadingSummary}
                emptyMessage="Kayıt yok"
                toolbar={
                  <span className={classes.muted}>
                    {formatNumber(engagement.with_page_context)} soru açık kayıtla soruldu
                  </span>
                }
              />
            </div>
            <div className={classes.cell}>
              <DataTable
                title="Olumsuz Oy Nedenleri"
                icon="fas fa-thumbs-down"
                data={reasonRows}
                columns={reasonColumns}
                getRowId={(row) => row.key}
                loading={loadingSummary}
                emptyMessage="Olumsuz oy yok"
              />
            </div>
          </div>
        ) : null}

        <DataTable
          title="Günlük Özetler"
          icon="fas fa-newspaper"
          data={rows}
          columns={summaryColumns}
          getRowId={(row) => String(row.id)}
          loading={summaryRows.isFetching}
          rowActions={summaryActions}
          extraData={regenerating}
          onRowClick={(row) => void openSummary(row)}
          emptyMessage="Henüz günlük özet üretilmedi"
          toolbar={
            <Button
              size="xs"
              disabled={run.isPending}
              onClick={() => void runToday()}
              leftSection={run.isPending ? <Loader size={12} color="currentColor" /> : <FaIcon icon="fas fa-play" />}
            >
              {run.isPending ? 'Üretiliyor…' : 'Bugünkü özeti üret'}
            </Button>
          }
        />

        <div className={classes.breakdown}>
          <div className={classes.cell}>
            <DataTable
              title="Kullanıcı Bazında"
              icon="fas fa-users"
              data={data?.per_user ?? NO_ROWS}
              columns={userColumns}
              getRowId={(row, index) => `${row.conversation__user__username ?? '?'}-${index}`}
              loading={loadingSummary}
              emptyMessage="Kayıt yok"
            />
          </div>
          <div className={classes.cell}>
            <DataTable
              title="Konu Dağılımı"
              icon="fas fa-wrench"
              data={data?.per_tool ?? NO_ROWS}
              columns={toolColumns}
              getRowId={(row, index) => `${row.tool_name}-${index}`}
              loading={loadingSummary}
              emptyMessage="Kayıt yok"
            />
          </div>
          <div className={classes.cell}>
            <DataTable
              title="En Çok Sorulan İşler"
              icon="fas fa-fire"
              data={data?.top_job_orders ?? NO_ROWS}
              columns={jobColumns}
              getRowId={(row, index) => `${row.job_no}-${index}`}
              loading={loadingSummary}
              emptyMessage="Henüz iş emri bazlı soru yok"
            />
          </div>
        </div>

        <DataTable
          title="Soru Kayıtları"
          icon="fas fa-comments"
          data={questions.data?.results ?? NO_ROWS}
          columns={questionColumns}
          getRowId={(row, index) => String(row.id ?? `${row.conversation_id}-${index}`)}
          loading={questions.isFetching}
          onRowClick={(row) => void openConversation(row)}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: questions.data?.count ?? 0,
            onPageChange: (next) => apply({ page: String(next) }),
          }}
          emptyMessage="Soru kaydı yok"
        />
      </div>

      {conversationId !== null && conversation.data ? (
        <ConversationModal detail={conversation.data} onClose={() => setConversationId(null)} />
      ) : null}
      {summaryId !== null && summaryDetail.data ? (
        <DailySummaryModal detail={summaryDetail.data} onClose={() => setSummaryId(null)} />
      ) : null}
    </>
  );
}
