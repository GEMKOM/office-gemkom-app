// Pure data shaping for the management dashboard, ported from
// management/dashboard/dashboard.js and render/*.js. Number parsing is
// null-safe: a hidden (null) amount must never read as 0 or '€0'.
import type {
  DashboardPayload,
  DecisionRow,
  DecisionsMine,
  DeliverySection,
  MaterialSection,
  Num,
  OrderBookSection,
  PeopleSection,
  ProductionSection,
  QualitySafetySection,
  SectionKey,
} from '@/api/management/dashboard';

// ------------------------------------------------------------------ numbers

/** Parse an API number (string decimal, number) → number | null. */
export function pf(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Number or 0 (for counts that may be missing). */
export function n0(v: unknown): number {
  return pf(v) ?? 0;
}

const nf = new Map<number, Intl.NumberFormat>();
function fixed(d: number) {
  let f = nf.get(d);
  if (!f) {
    f = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
    nf.set(d, f);
  }
  return f;
}

/** tr-TR number: num('1234.5', 1) → '1.234,5'. '' for null. */
export function num(v: unknown, d = 0): string {
  const n = pf(v);
  return n === null ? '' : fixed(d).format(n);
}

/** Percent: pct(25) → '%25', pct(28.6, 1) → '%28,6'. '' for null. */
export function pct(v: unknown, d = 0): string {
  const n = pf(v);
  return n === null ? '' : `%${fixed(d).format(n)}`;
}

/** '€1,2M' / '€38k' / '€9,8k' / '€410'; '' for null (apis/formatters.js formatEurCompact). */
export function formatEurCompact(value: unknown): string {
  const n = pf(value);
  if (n === null) return '';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}€${fixed(1).format(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${sign}€${fixed(0).format(abs / 1_000)}k`;
  if (abs >= 1_000) return `${sign}€${fixed(1).format(abs / 1_000)}k`;
  return `${sign}€${fixed(0).format(abs)}`;
}

/** Kilograms → tons: formatTons('1412300.0') → '1.412,3 t'; '' for null. */
export function formatTons(kg: unknown, decimals = 1): string {
  const n = pf(kg);
  return n === null ? '' : `${fixed(decimals).format(n / 1000)} t`;
}

/** Working days: formatWd(16) → '16 iş günü', decimals only when present. */
export function formatWd(v: unknown): string {
  const n = pf(v);
  if (n === null) return '';
  return `${fixed(Number.isInteger(n) ? 0 : 1).format(n)} iş günü`;
}

/** Join non-empty parts with ' · '. */
export function dots(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== '' && p !== false).join(' · ');
}

/** Money formatter bound to meta.money_visible: '' when hidden or null. */
export function moneyFmt(visible: boolean): (v: Num) => string {
  return (v) => (visible ? formatEurCompact(v) : '');
}

// ------------------------------------------------------------------ dates (Europe/Istanbul)

const TZ = 'Europe/Istanbul';
const hhmm = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayMon = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' });
const dayMonYear = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const monthFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: TZ,
  month: 'short',
  year: '2-digit',
});

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO datetime → 'hh:mm' in Istanbul; '' when missing. */
export function stamp(iso: unknown): string {
  const d = toDate(iso);
  return d ? hhmm.format(d) : '';
}

/** 'Veri 08:31' (or another prefix); '' when missing. */
export function stampLabel(iso: unknown, prefix = 'Veri'): string {
  const s = stamp(iso);
  return s ? `${prefix} ${s}` : '';
}

/** 'YYYY-MM-DD' → '30 Eyl' (Istanbul morning, so the day never shifts). */
export function shortDate(dateStr: unknown, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr ?? ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0));
  return (withYear ? dayMonYear : dayMon).format(d);
}

/** 'YYYY-MM' → 'Eki 26'. */
export function monthLabel(ym: unknown): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym ?? ''));
  if (!m) return String(ym ?? '');
  return monthFmt.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 9, 0, 0)));
}

/** Week start 'YYYY-MM-DD' → '6 Tem'. */
export const weekLabel = (dateStr: unknown) => shortDate(dateStr);

// ------------------------------------------------------------------ RAG

export type RagWord = 'green' | 'orange' | 'red' | 'grey' | 'blue' | 'purple';
const RAG_WORDS = new Set<string>(['green', 'orange', 'red', 'grey', 'blue', 'purple']);

export function ragWord(word: unknown): RagWord {
  return typeof word === 'string' && RAG_WORDS.has(word) ? (word as RagWord) : 'grey';
}

const RAG_TEXT: Record<RagWord, string> = {
  green: 'İyi',
  orange: 'Dikkat',
  red: 'Kritik',
  grey: 'Veri yok',
  blue: 'Bilgi',
  purple: 'Bakım',
};

export function ragText(word: unknown): string {
  return RAG_TEXT[ragWord(word)];
}

/** Number tone inside a card: red / orange / green, else none. */
export function numTone(word: unknown): 'red' | 'orange' | 'green' | null {
  const w = ragWord(word);
  return w === 'red' || w === 'orange' || w === 'green' ? w : null;
}

export interface Trend {
  diff: number;
  pct: number | null;
  dir: 'up' | 'down' | 'flat';
}

/** {diff, pct, dir}; null when a side is missing. */
export function trendDir(cur: unknown, prev: unknown): Trend | null {
  const c = pf(cur);
  const p = pf(prev);
  if (c === null || p === null) return null;
  const diff = c - p;
  return {
    diff,
    pct: p !== 0 ? (diff / Math.abs(p)) * 100 : null,
    dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
  };
}

/** '↑ 12%' / '↓ 8%' / '→'; '' when a side is missing. */
export function trendArrow(cur: unknown, prev: unknown): string {
  const t = trendDir(cur, prev);
  if (!t) return '';
  if (t.dir === 'flat') return '→';
  const pctStr = t.pct !== null ? ` ${Math.abs(t.pct).toFixed(0)}%` : '';
  return t.dir === 'up' ? `↑${pctStr}` : `↓${pctStr}`;
}

/**
 * Trend tone by business meaning: goodWhen 'up' (throughput) or 'down'
 * (overtime, spend). Flat, or a baseline under minPrev, reads neutral.
 */
export function trendTone(
  cur: unknown,
  prev: unknown,
  { goodWhen = 'up', minPrev = 0 }: { goodWhen?: 'up' | 'down'; minPrev?: number } = {},
): 'good' | 'bad' | 'flat' | null {
  const t = trendDir(cur, prev);
  if (!t) return null;
  if (t.dir === 'flat' || Math.abs(pf(prev) ?? 0) < minPrev) return 'flat';
  return t.dir === goodWhen ? 'good' : 'bad';
}

// ------------------------------------------------------------------ slow tier

export type SlowStatus = 'idle' | 'pending' | 'done' | 'failed' | 'unavailable';
export type SlowBlockState = 'ready' | 'pending' | 'unavailable' | 'failed';

export const SLOW_TEXT: Record<Exclude<SlowBlockState, 'ready'>, string> = {
  pending: 'hesaplanıyor…',
  unavailable: 'henüz hesaplanmadı',
  failed: 'yüklenemedi',
};

/** A slow sub-block error: 'slow.<section>_<sub>', the dotted and the bare spellings too. */
export function slowError(
  errors: Record<string, string> | undefined,
  section: string,
  sub: string | null,
): string | null {
  if (!errors || typeof errors !== 'object') return null;
  const keys = sub
    ? [`slow.${section}_${sub}`, `slow.${section}.${sub}`, `slow.${sub}`, `slow.${section}`]
    : [`slow.${section}`, section];
  for (const k of keys) if (errors[k]) return String(errors[k]);
  return null;
}

/**
 * ready: value present · pending: not built, a ?block=slow fetch is in flight ·
 * unavailable: not built, nothing in flight · failed: the block errored.
 */
export function slowState(
  value: unknown,
  {
    slowStatus,
    errors,
    section,
    sub,
  }: {
    slowStatus: SlowStatus;
    errors?: Record<string, string>;
    section: string;
    sub: string | null;
  },
): SlowBlockState {
  if (value !== null && value !== undefined) return 'ready';
  const err = slowError(errors, section, sub);
  const notBuilt = !err || /hen[uü]z hesaplanmad/i.test(err);
  if (notBuilt) return slowStatus === 'pending' ? 'pending' : 'unavailable';
  return 'failed';
}

/** Whether the page must ask for ?block=slow after a full load. */
export function needsSlow(payload: DashboardPayload | undefined, refresh: boolean): boolean {
  if (!payload) return false;
  const slow = payload.meta?.cache_state?.slow ?? 'missing';
  return refresh || slow === 'missing' || slow === 'stale';
}

export const SLOW_SECTIONS: SectionKey[] = [
  'order_book',
  'delivery',
  'production',
  'material',
  'finance',
  'people',
];

/**
 * The slow response merged into the full payload, as the legacy mergeSlow():
 * previous 'slow.*' errors drop, slow sub-blocks fold into their sections,
 * exceptions replace, a section the full load lacked (without an error) is
 * taken as is. Returns a new payload; the input is not changed.
 */
export function mergeSlow(
  full: DashboardPayload,
  slow: DashboardPayload | null | undefined,
): DashboardPayload {
  const sections: Record<string, unknown> = { ...(full.sections ?? {}) };
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries(full.errors ?? {})) if (!k.startsWith('slow.')) errors[k] = v;
  const incoming = (slow?.sections ?? {}) as Record<string, unknown>;
  for (const [sec, val] of Object.entries(incoming)) {
    if (sec === 'exceptions') {
      sections.exceptions = val === undefined ? null : val;
      continue;
    }
    if (!val || typeof val !== 'object') continue;
    const current = sections[sec];
    if (SLOW_SECTIONS.includes(sec as SectionKey) && current && typeof current === 'object') {
      sections[sec] = { ...(current as object), ...(val as object) };
    } else if (!current && !errors[sec]) {
      sections[sec] = val;
    }
  }
  for (const [k, v] of Object.entries(slow?.errors ?? {})) errors[k] = v;
  const meta = { ...(full.meta ?? {}) };
  if (slow?.meta) {
    meta.cache_state = { ...(meta.cache_state ?? {}), ...(slow.meta.cache_state ?? {}) };
  }
  return { ...full, meta, sections: sections as DashboardPayload['sections'], errors };
}

/**
 * A ?block=live response applied to the payload, as the legacy pollLive():
 * the live strip and decisions.mine are replaced, errors.live follows.
 */
export function applyLive(
  payload: DashboardPayload,
  live: DashboardPayload | null | undefined,
): DashboardPayload {
  if (!live) return payload;
  const sections = { ...(payload.sections ?? {}) };
  const errors = { ...(payload.errors ?? {}) };
  const sec = live.sections ?? {};
  if ('live' in sec) {
    sections.live = sec.live;
    if (sec.live) delete errors.live;
  }
  if (live.errors?.live) errors.live = live.errors.live;
  if (
    sec.decisions &&
    'mine' in sec.decisions &&
    sections.decisions &&
    typeof sections.decisions === 'object'
  ) {
    sections.decisions = { ...sections.decisions, mine: sec.decisions.mine };
  }
  return { ...payload, sections, errors };
}

// ------------------------------------------------------------------ decisions

/** Row colour of a decision subject (by age; vacations and overtime by urgency first). */
export function decisionColor(key: string, row: DecisionRow): 'red' | 'orange' | 'blue' {
  const oldest = n0(row.oldest_days);
  if (key === 'vacation_request') {
    if (n0(row.urgent) >= 1) return 'red';
    return oldest > 3 ? 'orange' : 'blue';
  }
  if (key === 'overtime_request') {
    if (n0(row.starts_2d) >= 1) return 'red';
    return oldest > 3 ? 'orange' : 'blue';
  }
  if (oldest > 14) return 'red';
  if (oldest > 3) return 'orange';
  return 'blue';
}

export function mineColor(mine: DecisionsMine): 'red' | 'blue' {
  return n0(mine.oldest_days) > 7 ? 'red' : 'blue';
}

// ------------------------------------------------------------------ trend series

export interface IntakeRow {
  label: string;
  intake: number;
  completed: number;
  intakeKg: Num;
  completedKg: Num;
}

export function intakeSeries(ob: OrderBookSection | null | undefined): IntakeRow[] {
  const series = Array.isArray(ob?.series_6m) ? ob.series_6m : [];
  return series.map((r) => ({
    label: monthLabel(r.month),
    intake: n0(r.intake),
    completed: n0(r.completed),
    intakeKg: r.intake_kg,
    completedKg: r.completed_kg,
  }));
}

export interface CompletionRow {
  label: string;
  onTime: number;
  late: number;
  pct: number | null;
  /** Fewer than five completions: drawn grey, the % marked "az veri". */
  small: boolean;
}

export function completionSeries(dl: DeliverySection | null | undefined): CompletionRow[] {
  const series = Array.isArray(dl?.series_6m) ? dl.series_6m : [];
  return series.map((r) => ({
    label: monthLabel(r.month),
    onTime: n0(r.on_time),
    late: n0(r.late),
    pct: pf(r.pct),
    small: n0(r.on_time) + n0(r.late) < 5,
  }));
}

export interface NetRow {
  label: string;
  /** Net progress in tons. */
  net: number;
  /** Trailing 4-week average; null for the first three weeks. */
  avg: number | null;
  grossKg: Num;
  partial: boolean;
}

export function netSeries(pr: ProductionSection | null | undefined): NetRow[] {
  const series = Array.isArray(pr?.series_13w) ? pr.series_13w : [];
  const vals = series.map((r) => n0(r.net_kg) / 1000);
  return series.map((r, i) => {
    let avg: number | null = null;
    if (i >= 3) {
      const win = vals.slice(i - 3, i + 1);
      avg = win.reduce((a, b) => a + b, 0) / win.length;
    }
    return {
      label: weekLabel(r.week_start),
      net: vals[i]!,
      avg,
      grossKg: r.gross_kg,
      partial: !!r.partial,
    };
  });
}

export interface NcrRow {
  label: string;
  opened: number;
  per100t: Num;
}

export function ncrSeries(qs: QualitySafetySection | null | undefined): NcrRow[] {
  const series = Array.isArray(qs?.series_6m) ? qs.series_6m : [];
  return series.map((r) => ({
    label: monthLabel(r.month),
    opened: n0(r.opened),
    per100t: r.per_100t,
  }));
}

export interface DeliveryRow {
  label: string;
  lines: number;
  avg: number | null;
}

export function deliverySeries(mt: MaterialSection | null | undefined): DeliveryRow[] {
  const series = Array.isArray(mt?.deliveries_13w) ? mt.deliveries_13w : [];
  const avg = pf(mt?.deliveries_13w_avg);
  return series.map((r) => ({ label: weekLabel(r.week_start), lines: n0(r.lines), avg }));
}

export interface OvertimeRow {
  label: string;
  hours: number;
  partial: boolean;
}

export function overtimeSeries(pp: PeopleSection | null | undefined): OvertimeRow[] {
  const series = Array.isArray(pp?.overtime_6m) ? pp.overtime_6m : [];
  return series.map((r) => ({
    label: monthLabel(r.month),
    hours: n0(r.hours),
    partial: !!r.partial,
  }));
}
