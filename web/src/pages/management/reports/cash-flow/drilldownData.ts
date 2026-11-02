// Pure helpers for the month drill-down, ported from cash-flow-drilldown.js.
import type { OutflowDetail } from '@/api/procurement/reports';
import type { InflowDetailRow } from '@/api/sales/reports';
import { toDate } from '@/lib/format';
import { num } from './cashFlowData';

export const TAX_TYPE_LABELS: Record<string, string> = {
  vat: 'KDV',
  corporate_tax: 'Kurumlar Vergisi',
  sgk: 'SGK',
  income_tax_withholding: 'Gelir Vergisi Stopajı',
  other: 'Diğer',
};

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  catering: 'Yemekhane / Catering',
  security: 'Güvenlik',
  transport: 'Ulaşım',
  rent: 'Kira',
  utilities: 'Kamu hizmetleri',
  insurance: 'Sigorta',
  other: 'Diğer',
};

export const EXPENSE_RECURRENCE_LABELS: Record<string, string> = {
  once: 'Tek seferlik',
  monthly: 'Aylık',
  quarterly: 'Üç aylık',
  annual: 'Yıllık',
};

export const ADHOC_CATEGORY_LABELS: Record<string, string> = {
  material: 'Malzeme',
  transport: 'Taşıma',
  labor: 'İşçilik',
  subcontract: 'Taşeron',
  other: 'Diğer',
};

export type OutflowSectionKey =
  'procurement' | 'wages' | 'expenses' | 'loans' | 'taxes' | 'adhoc_costs';

export const OUTFLOW_SECTIONS: { key: OutflowSectionKey; totalKey: string; title: string }[] = [
  { key: 'procurement', totalKey: 'procurement_eur', title: 'Tedarik / Satın Alma' },
  { key: 'wages', totalKey: 'wages_eur', title: 'Maaşlar' },
  { key: 'expenses', totalKey: 'expenses_eur', title: 'Genel Giderler' },
  { key: 'loans', totalKey: 'loans_eur', title: 'Krediler' },
  { key: 'taxes', totalKey: 'taxes_eur', title: 'Vergiler' },
  { key: 'adhoc_costs', totalKey: 'adhoc_eur', title: 'Proje Giderleri' },
];

/** The inflow endpoint returns an array; anything else counts as none. */
export function inflowRows(data: unknown): InflowDetailRow[] {
  return Array.isArray(data) ? (data as InflowDetailRow[]) : [];
}

/** The outflow endpoint returns an object; arrays and empties count as none. */
export function outflowDetail(data: unknown): OutflowDetail | null {
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as OutflowDetail) : null;
}

export function inflowTotal(rows: InflowDetailRow[]): number {
  return rows.reduce((s, r) => s + num(r.installment_amount_eur), 0);
}

export function outflowItemCount(data: OutflowDetail | null): number {
  if (!data) return 0;
  let n = (data.procurement ?? []).length;
  if (num(data.wages?.total_eur) > 0) n += 1;
  n += (data.expenses ?? []).length;
  n += (data.loans ?? []).length;
  n += (data.taxes ?? []).length;
  n += (data.adhoc_costs ?? []).length;
  return n;
}

export function hasOutflowContent(data: OutflowDetail | null): boolean {
  if (!data) return false;
  if (num(data.totals?.grand_total_eur) > 0) return true;
  return outflowItemCount(data) > 0;
}

export function sectionHasContent(data: OutflowDetail | null, key: OutflowSectionKey): boolean {
  if (!data) return false;
  if (key === 'wages') return num(data.wages?.total_eur) > 0;
  const arr = data[key];
  return Array.isArray(arr) && arr.length > 0;
}

export function sectionTotal(data: OutflowDetail | null, totalKey: string): number {
  return num((data?.totals as Record<string, unknown> | null | undefined)?.[totalKey]);
}

/** Paid vs awaiting over the rows that track payment: procurement, loans, taxes. */
export function sumOutflowPaidAwaiting(data: OutflowDetail | null): {
  paidTotal: number;
  awaitTotal: number;
} {
  const trackable = [...(data?.procurement ?? []), ...(data?.loans ?? []), ...(data?.taxes ?? [])];
  return trackable.reduce(
    (acc, r) => {
      const amt = num(r.amount_eur);
      if (r.is_paid) acc.paidTotal += amt;
      else acc.awaitTotal += amt;
      return acc;
    },
    { paidTotal: 0, awaitTotal: 0 },
  );
}

/** Groups in Turkish alphabetical order of the key; items keep their order. */
export function groupSorted<T>(rows: T[], keyOf: (row: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr'));
}

export function byString<T>(pick: (row: T) => string | null | undefined, locale?: string) {
  return (a: T, b: T) =>
    locale
      ? String(pick(a) ?? '').localeCompare(String(pick(b) ?? ''), locale)
      : String(pick(a) ?? '').localeCompare(String(pick(b) ?? ''));
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** An installment past its due day on a job not yet completed. */
export function isInflowOverdue(r: InflowDetailRow, today: Date): boolean {
  if (!r.installment_due_date) return false;
  if (r.job_status === 'completed') return false;
  const due = toDate(r.installment_due_date);
  return Boolean(due && due < startOfDay(today));
}

/** An unpaid outflow past its due day. */
export function isOutflowOverdue(
  r: { is_paid?: boolean; due_date?: string | null },
  today: Date,
): boolean {
  if (r.is_paid) return false;
  if (!r.due_date) return false;
  const due = toDate(r.due_date);
  return Boolean(due && due < startOfDay(today));
}
