import type { ReactNode } from 'react';
import type { ApprovalUser, Decimal, PaymentListItem, PoolRow } from '@/api/procurement/paymentLists';
import { formatDate } from '@/lib/format';
import { StatusBadge, type StatusFamily } from '@/ui';

// Port of procurement/payment-lists/format.js. Backend decimals arrive as
// strings; always go through num() before math.

export const LIST_STATUS_FAMILY: Record<string, StatusFamily> = {
  draft: 'grey',
  submitted: 'orange',
  approved: 'blue',
  sent_to_finance: 'purple',
  completed: 'green',
  rejected: 'red',
  cancelled: 'grey',
};

export const LIST_STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  submitted: 'Onayda',
  approved: 'Onaylandı',
  sent_to_finance: 'Finansta',
  completed: 'Tamamlandı',
  rejected: 'Reddedildi',
  cancelled: 'İptal',
};

export const BASIS_OPTIONS = [
  { value: 'immediate', label: 'Peşin / Avans' },
  { value: 'all', label: 'Tümü' },
  { value: 'on_delivery', label: 'Teslim Edildiğinde' },
  { value: 'after_invoice', label: 'Fatura Kesildikten Sonra' },
  { value: 'after_delivery', label: 'Teslimden Sonra' },
  { value: 'custom', label: 'Diğer' },
];

export const CURRENCY_OPTIONS = ['TRY', 'EUR', 'USD', 'GBP'].map((c) => ({ value: c, label: c }));

export const LIST_STATUS_OPTIONS = [
  { value: 'open', label: 'Açık (taslak, onayda, onaylı, finansta)' },
  { value: 'draft', label: 'Taslak' },
  { value: 'submitted', label: 'Onayda' },
  { value: 'approved', label: 'Onaylandı' },
  { value: 'sent_to_finance', label: 'Finansta' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'rejected', label: 'Reddedildi' },
  { value: 'cancelled', label: 'İptal' },
];

export function num(value: Decimal): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const moneyFormats = new Map<string, Intl.NumberFormat>();

export function fmtMoney(value: Decimal, currency: string | null | undefined = 'TRY'): string {
  const n = num(value);
  if (n === null) return '-';
  const cur = currency || 'TRY';
  try {
    let format = moneyFormats.get(cur);
    if (!format) {
      format = new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      moneyFormats.set(cur, format);
    }
    return format.format(n);
  } catch {
    return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
  }
}

export const fmtEur = (value: Decimal) => fmtMoney(value, 'EUR');

export function fmtRate(value: Decimal): string {
  const n = num(value);
  return n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function fmtPct(value: Decimal): string {
  const n = num(value);
  return n === null ? '-' : `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(value: string | null | undefined): string {
  return value ? formatDate(value) : '-';
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** A soft status pill; `title` becomes its tooltip (legacy badge(cls, text, title)). */
export function Pill({ color, title, children }: { color: StatusFamily; title?: string; children: ReactNode }) {
  if (!title) return <StatusBadge color={color}>{children}</StatusBadge>;
  return (
    <span title={title}>
      <StatusBadge color={color}>{children}</StatusBadge>
    </span>
  );
}

export function ListStatusBadge({ status, label }: { status: string; label?: string | null }) {
  return <Pill color={LIST_STATUS_FAMILY[status] ?? 'grey'}>{label || LIST_STATUS_LABEL[status] || status || '-'}</Pill>;
}

export function customersOf(row: PoolRow): string[] {
  const names = (row.jobs ?? []).map((j) => j.customer_short_name || j.customer_name).filter(Boolean) as string[];
  return [...new Set(names)];
}

export function jobNosOf(row: PoolRow): string[] {
  return (row.jobs ?? []).map((j) => j.job_no).filter(Boolean) as string[];
}

export function rowEur(row: PoolRow): number | null {
  return num(row.amount_eur !== undefined && row.amount_eur !== null ? row.amount_eur : row.gross_amount_eur);
}

export function sumEur(rows: readonly PoolRow[]): number {
  return rows.reduce((acc, r) => acc + (rowEur(r) || 0), 0);
}

export function sumByCurrency(rows: readonly PoolRow[], field: 'gross_amount' | 'net_amount' = 'gross_amount') {
  const out: Record<string, number> = {};
  rows.forEach((r) => {
    const cur = r.currency || 'TRY';
    out[cur] = (out[cur] || 0) + (num(r[field]) || 0);
  });
  return out;
}

export function currencyBreakdown(rows: readonly PoolRow[], field: 'gross_amount' | 'net_amount' = 'gross_amount') {
  return Object.entries(sumByCurrency(rows, field))
    .map(([cur, v]) => fmtMoney(v, cur))
    .join(' · ');
}

export function isOverdue(dateStr: string | null | undefined, paid: boolean | undefined): boolean {
  if (!dateStr || paid) return false;
  return new Date(dateStr) < new Date(todayIso());
}

export function userLabel(user: ApprovalUser | string | null | undefined): string {
  if (!user) return '-';
  if (typeof user === 'string') return user;
  return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '-';
}

/** "1/3 Avans" line of the Ödeme Şekli column and the modals. */
export function scheduleHead(row: PoolRow): string {
  return `${row.schedule_sequence ?? row.sequence ?? ''}/${row.schedule_count ?? ''} ${row.label || row.basis_label || ''}`.trim();
}

/** Items that count towards the list totals. */
export function includedItems(items: readonly PaymentListItem[] | null | undefined): PaymentListItem[] {
  return (items ?? []).filter((it) => !it.is_excluded && !it.po_cancelled);
}
