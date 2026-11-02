// Pure data shaping for the executive overview, ported from executive-overview.js.
import type { PaymentForecastMonth, PaymentForecastReport } from '@/api/procurement/reports';

/** parseFloat, 0 for anything else. Legacy let NaN through (a null month broke every cumulative point after it). */
export function num(value: unknown): number {
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** "2026-10" -> "Eki 2026" (legacy formatMonth). */
export function formatMonth(month: string | null | undefined): string {
  if (!month) return '-';
  const [year, m] = month.split('-');
  return new Date(Number(year), Number(m) - 1).toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'short',
  });
}

export interface ExecutiveKpis {
  totalSpent: number;
  totalPaid: number;
  totalAwaiting: number;
  poCount: number;
  activeSuppliers: number;
  mom: number | null;
  yoy: number | null;
}

function optional(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

export function executiveKpis(report: PaymentForecastReport | null | undefined): ExecutiveKpis {
  const k = report?.kpis;
  return {
    totalSpent: num(k?.total_spent_eur),
    totalPaid: num(k?.total_paid_eur),
    totalAwaiting: num(k?.total_awaiting_eur),
    poCount: Number(k?.po_count ?? 0) || 0,
    activeSuppliers: Number(k?.active_suppliers ?? 0) || 0,
    mom: optional(k?.mom_percent),
    yoy: optional(k?.yoy_percent),
  };
}

export interface ExecutiveMonth {
  month: string;
  label: string;
  spent: number;
  paid: number;
  awaiting: number;
  poCount: number;
  activeSuppliers: number;
  cumulativeSpent: number;
  cumulativePaid: number;
  cumulativeAwaiting: number;
}

export function seriesOf(report: PaymentForecastReport | null | undefined): PaymentForecastMonth[] {
  return Array.isArray(report?.series) ? report.series : [];
}

/** The chart series: sorted by month, with running totals (legacy updateCharts). */
export function chartMonths(series: PaymentForecastMonth[]): ExecutiveMonth[] {
  const sorted = [...series].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  let spent = 0;
  let paid = 0;
  let awaiting = 0;
  return sorted.map((item) => {
    const s = num(item.total_spent_eur);
    const p = num(item.paid_eur);
    const a = num(item.awaiting_eur);
    spent += s;
    paid += p;
    awaiting += a;
    return {
      month: item.month,
      label: formatMonth(item.month),
      spent: s,
      paid: p,
      awaiting: a,
      poCount: Number(item.po_count ?? 0) || 0,
      activeSuppliers: Number(item.active_suppliers ?? 0) || 0,
      cumulativeSpent: spent,
      cumulativePaid: paid,
      cumulativeAwaiting: awaiting,
    };
  });
}

/** Ödeme Dağılımı: paid and awaiting summed over the months (not the KPI totals), as legacy. */
export function paymentSplit(months: ExecutiveMonth[]): { paid: number; awaiting: number } {
  return months.reduce(
    (acc, m) => ({ paid: acc.paid + m.paid, awaiting: acc.awaiting + m.awaiting }),
    { paid: 0, awaiting: 0 },
  );
}
