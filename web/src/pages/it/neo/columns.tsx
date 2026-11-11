import type { DailySummaryRow, NeoJobUsage, NeoQuestion, NeoToolUsage, NeoUserUsage, NeoWeek } from '@/api/it/neo';
import { formatNumber } from '@/lib/format';
import { StatusBadge, type DataTableColumn } from '@/ui';
import {
  expandRateLabel,
  fmtInt,
  formatSummaryDate,
  latencyLabel,
  readSecondsLabel,
  shareLabel,
  summaryStatus,
  toolLabel,
  triggerLabel,
  truncate,
  usd,
  weekLabel,
} from './labels';
import classes from './NeoUsagePage.module.css';

// Module scope so DataTable rows stay memoized. None sortable, as legacy.

function dangerCount(value: number | null | undefined) {
  return value ? <span className={classes.danger}>{value}</span> : '0';
}

export const userColumns: DataTableColumn<NeoUserUsage>[] = [
  { key: 'user', header: 'Kullanıcı', render: (row) => row.conversation__user__username || '?' },
  { key: 'messages', header: 'Soru', width: 70, render: (row) => row.messages ?? '-' },
  { key: 'cost_usd', header: 'Maliyet', width: 110, render: (row) => usd(row.cost_usd) },
  { key: 'thumbs_down', header: '👎', width: 60, render: (row) => dangerCount(row.thumbs_down) },
];

export const toolColumns: DataTableColumn<NeoToolUsage>[] = [
  { key: 'tool_name', header: 'Araç', render: (row) => toolLabel(row.tool_name) },
  { key: 'calls', header: 'Çağrı', width: 70, render: (row) => row.calls ?? '-' },
  { key: 'denied', header: 'Red', width: 60, render: (row) => dangerCount(row.denied) },
  {
    key: 'avg_duration_ms',
    header: 'Süre',
    width: 80,
    render: (row) => (row.avg_duration_ms == null ? '—' : `${Math.round(row.avg_duration_ms)} ms`),
  },
];

export const jobColumns: DataTableColumn<NeoJobUsage>[] = [
  { key: 'job_no', header: 'İş Emri', render: (row) => <strong>{row.job_no}</strong> },
  { key: 'times_asked', header: 'Soru', width: 70, render: (row) => row.times_asked ?? '-' },
];

/** A week, with its question count drawn against the busiest week. */
export interface WeekRow extends NeoWeek {
  /** 0..1 of the busiest week's questions. */
  scale: number;
}

export const weekColumns: DataTableColumn<WeekRow>[] = [
  { key: 'week_start', header: 'Hafta', width: 130, render: (row) => weekLabel(row.week_start) },
  { key: 'active_users', header: 'Kişi', width: 60, render: (row) => row.active_users },
  {
    key: 'questions',
    header: 'Soru',
    render: (row) => (
      <span className={classes.barCell}>
        <span className={classes.barValue}>{row.questions}</span>
        <span className={classes.barTrack} aria-hidden>
          {row.questions > 0 ? <span className={classes.bar} style={{ width: `${Math.round(row.scale * 100)}%` }} /> : null}
        </span>
      </span>
    ),
  },
];

/** An entry point or a thumbs-down reason, with its share of the total. */
export interface ShareRow {
  key: string;
  label: string;
  count: number;
  total: number;
}

export const shareColumns: DataTableColumn<ShareRow>[] = [
  { key: 'label', header: 'Kaynak', render: (row) => row.label },
  { key: 'count', header: 'Adet', width: 60, render: (row) => row.count },
  { key: 'share', header: 'Pay', width: 60, render: (row) => shareLabel(row.count, row.total) },
];

export const reasonColumns: DataTableColumn<ShareRow>[] = [
  { key: 'label', header: 'Neden', render: (row) => row.label },
  { key: 'count', header: 'Adet', width: 60, render: (row) => row.count },
  { key: 'share', header: 'Pay', width: 60, render: (row) => shareLabel(row.count, row.total) },
];

const QUESTION_TIME: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

export const questionColumns: DataTableColumn<NeoQuestion>[] = [
  {
    key: 'created_at',
    header: 'Zaman',
    width: 150,
    render: (row) => new Date(row.created_at).toLocaleString('tr-TR', QUESTION_TIME),
  },
  { key: 'user_full_name', header: 'Kullanıcı', width: 170, render: (row) => row.user_full_name || row.user || '?' },
  { key: 'content', header: 'Soru', render: (row) => truncate(row.content || '', 160) },
];

function headlineCell(row: DailySummaryRow) {
  if (row.status === 'failed') {
    const text = row.error_detail || 'Hata ayrıntısı yok';
    return (
      <span className={classes.danger} title={text}>
        {truncate(text, 90)}
      </span>
    );
  }
  if (!row.headline) return <span className={classes.muted}>—</span>;
  return <span title={row.headline}>{truncate(row.headline, 90)}</span>;
}

function tokensCell(row: DailySummaryRow) {
  const title =
    row.cache_read_tokens || row.cache_write_tokens
      ? `Önbellek okuma ${fmtInt(row.cache_read_tokens)} · yazma ${fmtInt(row.cache_write_tokens)}`
      : undefined;
  return (
    <span title={title}>
      {fmtInt(row.input_tokens)} / {fmtInt(row.output_tokens)}
    </span>
  );
}

export function SummaryStatusBadge({ status }: { status: string | null | undefined }) {
  const [label, color] = summaryStatus(status);
  return <StatusBadge color={color}>{label}</StatusBadge>;
}

export const summaryColumns: DataTableColumn<DailySummaryRow>[] = [
  {
    key: 'summary_date',
    header: 'Tarih',
    width: 130,
    render: (row) => <strong>{formatSummaryDate(row.summary_date)}</strong>,
  },
  { key: 'status', header: 'Durum', width: 110, render: (row) => <SummaryStatusBadge status={row.status} /> },
  { key: 'headline', header: 'Başlık', render: headlineCell },
  { key: 'model', header: 'Model', width: 130, render: (row) => row.model || '—' },
  { key: 'input_tokens', header: 'Token (giriş / çıkış)', width: 150, render: tokensCell },
  { key: 'cost_usd', header: 'Maliyet', width: 90, render: (row) => usd(row.cost_usd) },
  { key: 'read_count', header: 'Okuma', width: 70, render: (row) => formatNumber(Number(row.read_count || 0)) },
  { key: 'avg_read_seconds', header: 'Ort. okuma', width: 90, render: (row) => readSecondsLabel(row.avg_read_seconds) },
  { key: 'expand_rate', header: 'Detay %', width: 80, render: (row) => expandRateLabel(row.expand_rate) },
  { key: 'latency_ms', header: 'Süre', width: 75, render: (row) => latencyLabel(row.latency_ms) },
  { key: 'attempts', header: 'Deneme', width: 70, render: (row) => row.attempts ?? '-' },
  { key: 'triggered_by', header: 'Tetik', width: 110, render: (row) => triggerLabel(row.triggered_by) },
];
