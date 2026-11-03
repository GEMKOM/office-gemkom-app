import { Badge, NumberInput, type NumberInputProps } from '@mantine/core';
import { formatCurrency, toNumber, type NumberInput as NumberLike } from '@/lib/format';
import { StatusBadge, type FilterOption } from '@/ui';

// Labels, options and formatting shared by the Finans İşlemleri tabs
// (constants from the top of finance/purchase-orders/purchase-orders.js).

export const CURRENCY_OPTIONS: FilterOption[] = [
  { value: 'TRY', label: 'TRY' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
];

/** The filters spelled the currencies out. */
export const CURRENCY_FILTER_OPTIONS: FilterOption[] = [
  { value: 'TRY', label: 'Türk Lirası' },
  { value: 'USD', label: 'Amerikan Doları' },
  { value: 'EUR', label: 'Euro' },
];

export const EXPENSE_CATEGORY_OPTIONS: FilterOption[] = [
  { value: 'catering', label: 'Yemekhane / Catering' },
  { value: 'security', label: 'Güvenlik' },
  { value: 'transport', label: 'Ulaşım' },
  { value: 'rent', label: 'Kira' },
  { value: 'utilities', label: 'Kamu hizmetleri' },
  { value: 'insurance', label: 'Sigorta' },
  { value: 'other', label: 'Diğer' },
];

export const EXPENSE_RECURRENCE_OPTIONS: FilterOption[] = [
  { value: 'once', label: 'Tek seferlik' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'quarterly', label: 'Üç aylık' },
  { value: 'annual', label: 'Yıllık' },
];

export const TAX_TYPE_OPTIONS: FilterOption[] = [
  { value: 'vat', label: 'KDV' },
  { value: 'corporate_tax', label: 'Kurumlar Vergisi' },
  { value: 'sgk', label: 'SGK' },
  { value: 'income_tax_withholding', label: 'Gelir Vergisi Stopajı' },
  { value: 'other', label: 'Diğer' },
];

export const ADHOC_COST_CATEGORY_OPTIONS: FilterOption[] = [
  { value: 'material', label: 'Malzeme' },
  { value: 'service', label: 'Hizmet' },
  { value: 'transport', label: 'Nakliye' },
  { value: 'other', label: 'Diğer' },
];

/** value → label, falling back to the raw value, then '—'. */
export function optionLabel(
  options: readonly FilterOption[],
  value: string | null | undefined,
): string {
  return options.find((o) => o.value === value)?.label || value || '—';
}

/** Legacy parseMoneyNumber: numbers, API decimals and "1,5"; NaN when empty. */
export function parseMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return Number.NaN;
  return typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
}

/** Legacy formatCurrency: "₺0,00" rather than '-' for an empty amount. */
export function money(value: NumberLike, currency?: string | null): string {
  const n = toNumber(typeof value === 'string' ? value.replace(',', '.') : value);
  return formatCurrency(n ?? 0, currency || 'TRY');
}

/** A positive amount typed in a form, as legacy `parseFloat(raw.replace(',', '.'))`; null otherwise. */
export function positiveAmount(raw: string | number | null | undefined): number | null {
  const n = parseMoney(typeof raw === 'string' ? raw.trim() : raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Today as 'YYYY-MM-DD' in local time (the forms' default date). */
export function todayIso(): string {
  const today = new Date();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${m}-${d}`;
}

/** Whole days from today (local midnight) to a 'YYYY-MM-DD' or ISO date; null when unparseable. */
export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}

export function CurrencyBadge({ currency }: { currency?: string | null }) {
  if (!currency) return <>—</>;
  return (
    <Badge variant="light" color="gray" radius="sm">
      {currency}
    </Badge>
  );
}

/** Aktif / İptal of expenses and loans. */
export function RecordStatusBadge({ status }: { status?: string | null }) {
  if (status === 'active') return <StatusBadge color="green">Aktif</StatusBadge>;
  if (status === 'cancelled') return <StatusBadge color="red">İptal</StatusBadge>;
  return <StatusBadge color="grey">{status || '—'}</StatusBadge>;
}

export const RECORD_STATUS_FILTER: FilterOption[] = [
  { value: 'active', label: 'Aktif' },
  { value: 'cancelled', label: 'İptal' },
];

/** Plain text column value or '—' (legacy formatters' fallback). */
export function orDash(value: unknown): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

/** Money field of the finance forms: Turkish separators, two decimals, required unless told otherwise. */
export function AmountInput({
  required = true,
  min = 0.01,
  step = 0.01,
  decimals = 2,
  placeholder = '0,00',
  ...rest
}: Omit<NumberInputProps, 'decimalScale'> & { decimals?: number }) {
  return (
    <NumberInput
      withAsterisk={required}
      min={min}
      step={step}
      decimalScale={decimals}
      decimalSeparator=","
      thousandSeparator="."
      placeholder={placeholder}
      {...rest}
    />
  );
}
