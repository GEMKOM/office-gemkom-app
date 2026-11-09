import dayjs from 'dayjs';
import type { PeriodCostRow } from '@/api/accounting/periodCost';
import { formatDate } from '@/lib/format';

export type FlatRow = PeriodCostRow & { level: number; hasChildren: boolean };

/** Each expanded row is followed by its children, recursively. */
export function flattenTree(
  rows: readonly PeriodCostRow[],
  expanded: ReadonlySet<string> | 'all',
  level = 0,
): FlatRow[] {
  const out: FlatRow[] = [];
  for (const row of rows) {
    const hasChildren = row.children.length > 0;
    out.push({ ...row, level, hasChildren });
    if (hasChildren && (expanded === 'all' || expanded.has(row.job_no))) {
      out.push(...flattenTree(row.children, expanded, level + 1));
    }
  }
  return out;
}

/** Roots whose job no, title or customer contains the text (children ride along). */
export function filterRoots(rows: readonly PeriodCostRow[], text: string): PeriodCostRow[] {
  const needle = text.trim().toLocaleLowerCase('tr-TR');
  if (!needle) return [...rows];
  const matches = (row: PeriodCostRow): boolean =>
    [row.job_no, row.title, row.customer_name ?? ''].some((v) =>
      v.toLocaleLowerCase('tr-TR').includes(needle),
    ) || row.children.some(matches);
  return rows.filter(matches);
}

export const num = (value: string | null | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** '2026-10' -> 'Ekim 2026'. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return formatDate(new Date(y, m - 1, 1), { month: 'long', year: 'numeric' });
}

/** The month just closed: the one accounting reports on next. */
export function lastClosedMonth(today = dayjs()): string {
  return today.subtract(1, 'month').format('YYYY-MM');
}

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
