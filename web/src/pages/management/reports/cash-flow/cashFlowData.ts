// Pure data shaping for the cash-flow page, ported from cash-flow.js.
import type { DbsSupplierRow, PaymentForecastReport } from '@/api/procurement/reports';
import type { RevenueReport } from '@/api/sales/reports';
import { toDate } from '@/lib/format';

/** parseFloat, 0 for anything else (legacy `num`). */
export function num(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

type Bag = Record<string, unknown> | null | undefined;

/** First present field (supports API renames), as a number; 0 when none (legacy `pickNum`). */
export function pickNum(obj: Bag | object, ...keys: string[]): number {
  if (!obj) return 0;
  const bag = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = bag[key];
    if (v !== null && v !== undefined && v !== '') return num(v);
  }
  return 0;
}

export function hasAmount(obj: Bag | object, ...keys: string[]): boolean {
  if (!obj) return false;
  const bag = obj as Record<string, unknown>;
  return keys.some((key) => bag[key] !== null && bag[key] !== undefined && bag[key] !== '');
}

export function sumSeries(series: readonly object[] | null | undefined, ...keys: string[]): number {
  return (series ?? []).reduce((acc, row) => acc + pickNum(row, ...keys), 0);
}

/** "2026-10" -> "Ekim 2026" (legacy fmtMonth). */
export function monthLabel(ym: string | null | undefined): string {
  if (!ym) return '—';
  const [y, m] = String(ym).split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
}

/** "2026-10" -> "Eki 26" for chart axes. */
export function monthShort(ym: string): string {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('tr-TR', {
    month: 'short',
    year: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Period presets

export type PresetKey = 'month' | 'quarter' | 'year' | 'last12' | 'all';

export const PRESET_OPTIONS: { value: PresetKey; label: string }[] = [
  { value: 'month', label: 'Bu Ay' },
  { value: 'quarter', label: 'Bu Çeyrek' },
  { value: 'year', label: 'Bu Yıl' },
  { value: 'last12', label: 'Son 12 Ay' },
  { value: 'all', label: 'Tümü' },
];

export function isPreset(value: string): value is PresetKey {
  return PRESET_OPTIONS.some((o) => o.value === value);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** created_gte / created_lte for a preset, in local dates (legacy applyPreset). */
export function presetRange(key: PresetKey, today: Date): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case 'month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case 'quarter': {
      const q = Math.floor(m / 3) * 3;
      return { from: ymd(new Date(y, q, 1)), to: ymd(new Date(y, q + 3, 0)) };
    }
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last12':
      return { from: ymd(new Date(y, m - 11, 1)), to: ymd(today) };
    default:
      return { from: '', to: '' };
  }
}

// ---------------------------------------------------------------------------
// Monthly rows

export interface CashFlowRow {
  /** "YYYY-MM" */
  month: string;
  monthLabel: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
  paid: number;
  awaiting: number;
  po_count: number;
  offer_count: number;
  netNegative: boolean;
  /** The first month whose cumulative net changes sign. */
  crossesZero: boolean;
}

export interface CashFlowTotals {
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
  paid: number;
  awaiting: number;
  po_count: number;
  offer_count: number;
}

/** Merges the outflow and inflow series by month (legacy buildMergedRows). */
export function buildMergedRows(
  outflow: PaymentForecastReport | null | undefined,
  inflow: RevenueReport | null | undefined,
): { rows: CashFlowRow[]; totals: CashFlowTotals } {
  const outSeries = Array.isArray(outflow?.series) ? outflow.series : [];
  const inSeries = Array.isArray(inflow?.series) ? inflow.series : [];
  const months = new Set<string>();
  outSeries.forEach((r) => months.add(r.month));
  inSeries.forEach((r) => months.add(r.month));
  const sorted = [...months].filter(Boolean).sort();

  const outByMonth = new Map(outSeries.map((r) => [r.month, r]));
  const inByMonth = new Map(inSeries.map((r) => [r.month, r]));

  let cumulative = 0;
  let zeroCrossMarked = false;

  const rows = sorted.map((month): CashFlowRow => {
    const o = outByMonth.get(month);
    const i = inByMonth.get(month);
    const inflowAmt = pickNum(i, 'total_inflow_eur', 'revenue_eur');
    const outflowAmt = pickNum(o, 'total_outflow_eur', 'total_spent_eur');
    const net = inflowAmt - outflowAmt;
    const prevCum = cumulative;
    cumulative += net;
    const crossed = (prevCum >= 0 && cumulative < 0) || (prevCum < 0 && cumulative > 0);
    const crossesZero = !zeroCrossMarked && crossed;
    if (crossesZero) zeroCrossMarked = true;
    return {
      month,
      monthLabel: monthLabel(month),
      inflow: inflowAmt,
      outflow: outflowAmt,
      net,
      cumulative,
      paid: pickNum(o, 'procurement_paid_eur', 'paid_eur'),
      awaiting: pickNum(o, 'procurement_awaiting_eur', 'awaiting_eur'),
      po_count: Number(o?.po_count ?? 0) || 0,
      offer_count: Number(i?.offer_count ?? 0) || 0,
      netNegative: net < 0,
      crossesZero,
    };
  });

  const totals = rows.reduce<CashFlowTotals>(
    (acc, r) => {
      acc.inflow += r.inflow;
      acc.outflow += r.outflow;
      acc.net += r.net;
      acc.paid += r.paid;
      acc.awaiting += r.awaiting;
      acc.po_count += r.po_count;
      acc.offer_count += r.offer_count;
      return acc;
    },
    {
      inflow: 0,
      outflow: 0,
      net: 0,
      cumulative: 0,
      paid: 0,
      awaiting: 0,
      po_count: 0,
      offer_count: 0,
    },
  );
  totals.cumulative = rows.length ? rows[rows.length - 1]!.cumulative : 0;
  return { rows, totals };
}

// ---------------------------------------------------------------------------
// KPI cards

export interface CashFlowKpis {
  totalIn: number;
  totalOut: number;
  net: number;
  paid: number;
  awaiting: number;
  dbsUsed: number;
  momIn: number | null;
  momOut: number | null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/** Legacy renderKpis: KPI totals, falling back to the series sums for paid / awaiting. */
export function cashFlowKpis(
  outflow: PaymentForecastReport | null | undefined,
  inflow: RevenueReport | null | undefined,
): CashFlowKpis {
  const outKpis = outflow?.kpis;
  const totalIn = pickNum(inflow?.kpis, 'total_inflow_eur', 'total_revenue_eur');
  const totalOut = pickNum(outKpis, 'total_outflow_eur', 'total_spent_eur');
  const series = Array.isArray(outflow?.series) ? outflow.series : [];
  const paid = hasAmount(outKpis, 'total_procurement_paid_eur', 'total_paid_eur')
    ? pickNum(outKpis, 'total_procurement_paid_eur', 'total_paid_eur')
    : sumSeries(series, 'procurement_paid_eur', 'paid_eur');
  const awaiting = hasAmount(outKpis, 'total_procurement_awaiting_eur', 'total_awaiting_eur')
    ? pickNum(outKpis, 'total_procurement_awaiting_eur', 'total_awaiting_eur')
    : sumSeries(series, 'procurement_awaiting_eur', 'awaiting_eur');
  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    paid,
    awaiting,
    dbsUsed: num(outflow?.dbs_summary?.total_dbs_used_eur),
    momIn: optionalNumber(inflow?.kpis?.mom_percent),
    momOut: optionalNumber(outKpis?.mom_percent),
  };
}

// ---------------------------------------------------------------------------
// DBS and undated

export interface DbsRow extends DbsSupplierRow {
  /** Used / limit in percent; 0 without a limit. */
  utilization: number;
}

export function enrichDbsRows(suppliers: DbsSupplierRow[] | null | undefined): DbsRow[] {
  return (suppliers ?? []).map((s) => {
    const usedEur = num(s.dbs_used_eur);
    const limitEur = num(s.dbs_limit_eur);
    return { ...s, utilization: limitEur > 0 ? (usedEur / limitEur) * 100 : 0 };
  });
}

/** Bar colour of the DBS utilisation: over 90% red, over 70% yellow. */
export function utilizationTone(pct: number): 'bad' | 'warning' | 'normal' {
  if (pct > 90) return 'bad';
  if (pct > 70) return 'warning';
  return 'normal';
}

/** A DBS expiry within 30 days (or past) is flagged. */
export function expirySoon(value: string | null | undefined, now: Date): boolean {
  const expiry = toDate(value);
  if (!expiry) return false;
  const days = (expiry.getTime() - now.getTime()) / 86_400_000;
  return days <= 30;
}

export interface UndatedSummary {
  amount: number;
  count: number;
}

export function undatedOutflow(outflow: PaymentForecastReport | null | undefined): UndatedSummary {
  const data = outflow?.undated_schedules;
  return {
    amount: pickNum(data, 'total_outflow_eur', 'total_eur'),
    count: Number(data?.po_count ?? 0) || 0,
  };
}

export function undatedInflow(inflow: RevenueReport | null | undefined): UndatedSummary {
  const data = inflow?.undated;
  return {
    amount: pickNum(data, 'total_inflow_eur', 'revenue_eur'),
    count: Number(data?.offer_count ?? 0) || 0,
  };
}
