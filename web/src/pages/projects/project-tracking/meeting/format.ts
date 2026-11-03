import { formatDate } from '@/lib/format';

// The deck's number and date formats (legacy fmtInt / fmtHours / fmtShortDate
// in meetingView.js and meetingTiles.js).

type Value = number | string | null | undefined;

const num = (value: Value): number => Number(value ?? 0) || 0;

/** "1.234" */
export function fmtInt(value: Value): string {
  return Math.round(num(value)).toLocaleString('tr-TR');
}

/** "12,5" */
export function fmtHours(value: Value): string {
  return num(value).toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}

/** "12,25" */
export function fmtQty2(value: Value): string {
  return num(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/** "30.10.2026", "—" when empty. */
export function fmtShortDate(value: string | null | undefined): string {
  return value ? formatDate(value) : '—';
}

/** Working days without a sign: "3", "2,5". */
export function fmtWd(value: Value): string {
  const abs = Math.abs(num(value));
  return (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)).replace('.', ',');
}

/** "€12.345", "—" when absent. */
export function fmtEur(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `€${Math.round(value).toLocaleString('tr-TR')}`;
}

/** "€4,25/kg", "—" when absent. */
export function fmtPerKg(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : `€${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}/kg`;
}

/** Not null / undefined (0 counts). */
export function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
