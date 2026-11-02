import type { DailySummaryRow } from '@/api/it/neo';
import { formatDate, formatNumber } from '@/lib/format';
import type { StatusFamily } from '@/ui';

// Labels and formatters of legacy it/neo/neo.js (tr-TR, Istanbul).

export const OUTCOME_LABELS: Record<string, string> = {
  answered: 'Yanıtlandı',
  declined_budget: 'Bütçe reddi',
  declined_permission: 'Yetki reddi',
  error: 'Hata',
};

export const TOOL_LABELS: Record<string, string> = {
  search_job_orders: 'İş emri arama',
  get_job_order_brief: 'İş emri özeti',
  get_job_order_hours: 'Çalışma saatleri',
  get_job_costs: 'Maliyetler',
  get_material_status: 'Malzeme durumu',
  get_discussions: 'Tartışmalar',
  get_my_mentions: 'Etiketlenmeler',
  get_my_summary: 'Kişisel özet',
  search_docs: 'Rehber arama',
  read_doc: 'Rehber okuma',
  get_daily_summary: 'Günlük özet',
};

/** DailySummary.status → [label, badge family]; no yellow by house rule. */
export const SUMMARY_STATUS: Record<string, [string, StatusFamily]> = {
  ok: ['Hazır', 'green'],
  empty: ['Aktivite yok', 'grey'],
  failed: ['Hata', 'red'],
  running: ['Üretiliyor', 'blue'],
};

export function summaryStatus(status: string | null | undefined): [string, StatusFamily] {
  return (status && SUMMARY_STATUS[status]) || [status || '?', 'grey'];
}

export const TRIGGER_LABELS: Record<string, string> = {
  schedule: 'Zamanlayıcı',
  workflow_dispatch: 'Elle (Actions)',
  command: 'Komut',
  api: 'Sayfa / API',
};

export function triggerLabel(value: string | null | undefined): string {
  return (value && TRIGGER_LABELS[value]) || value || '—';
}

export function toolLabel(value: string): string {
  return TOOL_LABELS[value] || value;
}

/** '$1.234,56'; anything unparseable counts as 0. */
export function usd(value: unknown): string {
  const n = Number.parseFloat(String(value));
  return `$${formatNumber(Number.isFinite(n) ? n : 0, 2)}`;
}

/** Integer with tr-TR grouping; anything unparseable counts as 0. */
export function fmtInt(value: unknown): string {
  const n = Number(value);
  return formatNumber(Number.isFinite(n) ? n : 0);
}

/** avg_read_seconds → '42 sn'; '—' while no read of that summary carried metrics. */
export function readSecondsLabel(value: unknown): string {
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? `${Math.round(n)} sn` : '—';
}

/** expand_rate (0..1) → '35%'; '—' when null. */
export function expandRateLabel(value: unknown): string {
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
}

/** latency in ms → '2.3 sn' (legacy toFixed); '—' when null. */
export function latencyLabel(ms: number | null | undefined): string {
  return ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} sn`;
}

export function truncate(text: unknown, max: number): string {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const SUMMARY_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  weekday: 'short',
};

/** 'YYYY-MM-DD' → '22.09.2026 Sal'; read as a local day so no UTC shift creeps in. */
export function formatSummaryDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return formatDate(new Date(y, m - 1, d), SUMMARY_DATE);
}

/** ISO timestamp → '22.09.2026 05:20:11' in Istanbul time. */
export function formatIstanbulDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
}

const rangeFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** '19 Eyl 05:20 – 22 Eyl 05:20' (payload label when present); '—' when unknown. */
export function formatWindowLabel(summary: DailySummaryRow & { payload?: Record<string, unknown> | null }): string {
  const window = summary.payload?.window as { label?: unknown } | undefined;
  if (window?.label) return String(window.label);
  const start = summary.window_start ? new Date(summary.window_start) : null;
  const end = summary.window_end ? new Date(summary.window_end) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  return `${rangeFmt.format(start)} – ${rangeFmt.format(end)}`;
}

/** Sum of cost_usd over the period's summaries. */
export function sumSummaryCost(rows: readonly DailySummaryRow[]): number {
  return rows.reduce((acc, row) => {
    const n = Number.parseFloat(String(row.cost_usd));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Plain mean of the per-summary averages; null until some read carried metrics. */
export function avgReadSeconds(rows: readonly DailySummaryRow[]): number | null {
  const values = rows.map((row) => Number.parseFloat(String(row.avg_read_seconds))).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((acc, n) => acc + n, 0) / values.length;
}
