import type { DailySummaryRow } from '@/api/it/neo';
import { formatDate, formatNumber } from '@/lib/format';
import type { StatusFamily } from '@/ui';

// Labels and formatters of legacy it/neo/neo.js (tr-TR, Istanbul).

export const OUTCOME_LABELS: Record<string, string> = {
  answered: 'Yanıtlandı',
  answered_local: 'Selamlaşma',
  declined_budget: 'Bütçe reddi',
  declined_permission: 'Yetki reddi',
  truncated: 'Kesildi',
  error: 'Hata',
};

/** Where a question started (gemkom-backend assistant/page_context.py SOURCES). */
export const SOURCE_LABELS: Record<string, string> = {
  panel: 'Panele yazıldı',
  suggestion: 'Boş paneldeki öneri',
  followup: 'Devam sorusu',
  page_button: "Sayfadaki “Neo'ya sor”",
  home: 'Ana sayfa kartı',
  summary: 'Günlük özetten',
  unknown: 'Bilinmiyor (eski kayıt)',
};

/** Thumbs-down reasons (Message.FEEDBACK_REASON_CHOICES). */
export const FEEDBACK_REASON_LABELS: Record<string, string> = {
  wrong: 'Yanlış bilgi',
  incomplete: 'Eksik',
  unclear: 'Anlaşılmaz',
  slow: 'Çok yavaş',
  other: 'Diğer',
  none: 'Neden seçilmedi',
};

export function sourceLabel(value: string): string {
  return SOURCE_LABELS[value] || value;
}

export function reasonLabel(value: string): string {
  return FEEDBACK_REASON_LABELS[value] || value;
}

const WEEK_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

/** Monday 'YYYY-MM-DD' → '3 Kas – 9 Kas', read as local days. */
export function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  if (!y || !m || !d) return weekStart;
  return `${formatDate(new Date(y, m - 1, d), WEEK_FMT)} – ${formatDate(new Date(y, m - 1, d + 6), WEEK_FMT)}`;
}

/** Median and p90 in ms → '8.0 / 30.0 sn'; '—' with no samples. */
export function percentileLabel(p50: number | null | undefined, p90: number | null | undefined): string {
  if (p50 == null || p90 == null) return '—';
  return `${(p50 / 1000).toFixed(1)} / ${(p90 / 1000).toFixed(1)} sn`;
}

/** count of total → '35%'; '0%' when total is 0. */
export function shareLabel(count: number, total: number): string {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : '0%';
}

/** Every tool in gemkom-backend assistant/tools, as the usage page names it. */
export const TOOL_LABELS: Record<string, string> = {
  search_job_orders: 'İş emri arama',
  find_job_number: 'İş emri numarası bulma',
  get_job_order_brief: 'İş emri özeti',
  get_job_timeline: 'İş emri geçmişi',
  get_job_costs: 'Maliyetler',
  get_drawing_release_status: 'Çizim yayınları',
  get_job_order_hours: 'Çalışma saatleri',
  get_material_status: 'Malzeme durumu',
  get_planning_requests: 'Planlama talepleri',
  get_my_mentions: 'Etiketlenmeler',
  get_discussions: 'Tartışmalar',
  get_qc_status: 'Kalite kontrol',
  get_cutting_status: 'Kesim durumu',
  get_machine_faults: 'Makine arızaları',
  get_purchase_requests: 'Satın alma talepleri',
  get_purchase_order_status: 'Siparişler',
  get_item_price_history: 'Fiyat geçmişi',
  get_supplier_brief: 'Tedarikçi bilgisi',
  get_cost_benchmark: 'Maliyet karşılaştırması',
  get_sales_offers: 'Satış teklifleri',
  get_overtime_report: 'Mesai raporu',
  get_subcontractor_status: 'Taşeron durumu',
  who_does_what: 'Kim ne yapıyor',
  get_my_summary: 'Kişisel özet',
  get_my_work: 'Kişinin işleri',
  get_my_attendance: 'Kişinin devam kaydı',
  get_my_approvals: 'Onay bekleyenler',
  get_my_notifications: 'Bildirimler',
  search_docs: 'Rehber arama',
  read_doc: 'Rehber okuma',
  describe_data: 'Veri yapısı',
  query_data: 'Veri sorgusu',
  get_daily_summary: 'Günlük özet',
  get_portfolio_financials: 'Kâr ve marj toplamları',
  get_workload_overview: 'İş yükü',
  get_procurement_spend: 'Satın alma harcaması',
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
