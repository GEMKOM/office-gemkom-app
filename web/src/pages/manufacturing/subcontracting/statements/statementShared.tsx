import { isApiError } from '@/api/client';
import type { Statement, StatementAdjustment } from '@/api/subcontracting/statements';
import { toNumber } from '@/lib/format';
import { StatusBadge, type StatusFamily } from '@/ui';

export const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** Legacy getStatementStatusInfo, with the badge families the list used (teal shows blue). */
export const STATEMENT_STATUS: Record<string, { label: string; color: StatusFamily }> = {
  draft: { label: 'Taslak', color: 'grey' },
  submitted: { label: 'Onay Bekliyor', color: 'yellow' },
  approved: { label: 'Onaylandı', color: 'green' },
  rejected: { label: 'Reddedildi', color: 'red' },
  paid: { label: 'Ödendi', color: 'blue' },
  cancelled: { label: 'İptal Edildi', color: 'grey' },
};

export const STATUS_OPTIONS = Object.entries(STATEMENT_STATUS).map(([value, { label }]) => ({
  value,
  label,
}));

export function StatementStatusBadge({ status }: { status: string }) {
  const info = STATEMENT_STATUS[status] ?? { label: status, color: 'grey' as const };
  return <StatusBadge color={info.color}>{info.label}</StatusBadge>;
}

/** "YYYY-MM" for grouping (sorts naturally), 'unknown' without a period. */
export function statementPeriod(statement: Pick<Statement, 'year' | 'month'>): string {
  return statement.year && statement.month
    ? `${statement.year}-${String(statement.month).padStart(2, '0')}`
    : 'unknown';
}

/** "Şubat 2026". */
export function periodText(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] || month} ${year}`;
}

const TR_2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Legacy formatCurrency: "1.234,50 TRY"; '-' when there is no number. */
export function money(amount: unknown, currency?: string | null): string {
  const n = toNumber(amount as string | number | null | undefined);
  if (n === null) return '-';
  return `${TR_2.format(n)} ${currency || 'TRY'}`;
}

export function adjustmentTypeLabel(type: string | null | undefined): string {
  return (
    ({ addition: 'Ek Ödeme', deduction: 'Kesinti' } as Record<string, string>)[type ?? ''] ||
    type ||
    '-'
  );
}

/**
 * The adjustments' total from the list (some detail payloads lack it).
 * Deductions may come negative; abs() then the sign of the type.
 */
export function adjustmentsTotal(adjustments: readonly StatementAdjustment[]): number {
  return adjustments.reduce((sum, adj) => {
    const raw = Number.parseFloat(String(adj?.amount));
    const amount = Number.isFinite(raw) ? Math.abs(raw) : 0;
    return sum + (adj?.adjustment_type === 'deduction' ? -1 : 1) * amount;
  }, 0);
}

/**
 * Legacy statement API errors: detail, else message, else every field
 * message joined with ', ', else the fallback.
 */
export function statementErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const body = error.data as Record<string, unknown>;
    if (typeof body.detail === 'string' && body.detail) return body.detail;
    if (typeof body.message === 'string' && body.message) return body.message;
    const messages = Object.values(body)
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    return messages.join(', ') || fallback;
  }
  if (isApiError(error)) return fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}
