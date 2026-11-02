// Axis and label formatting for charts. Tooltips and tables use the full
// formatters from @/lib/format; axis ticks need the short form.
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';

const LOCALE = 'tr-TR';
const compactFormats = new Map<string, Intl.NumberFormat>();

function compactFormat(currency?: string): Intl.NumberFormat {
  const key = currency ?? '';
  let format = compactFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      notation: 'compact',
      maximumFractionDigits: 1,
      ...(currency ? { style: 'currency', currency } : {}),
    });
    compactFormats.set(key, format);
  }
  return format;
}

/** "1,2 Mn", "345 B" for axis ticks. */
export function compactNumber(value: number): string {
  return Number.isFinite(value) ? compactFormat().format(value) : '';
}

/** "€1,2 Mn" for axis ticks. */
export function compactCurrency(value: number, currency = 'EUR'): string {
  return Number.isFinite(value) ? compactFormat(currency).format(value) : '';
}

/** How a chart shows one value: in tooltips, labels and the table view. */
export type ValueFormat = (value: number) => string;

export const valueFormats = {
  number:
    (decimals = 0): ValueFormat =>
    (v) =>
      formatNumber(v, decimals),
  currency:
    (currency = 'EUR', decimals = 0): ValueFormat =>
    (v) =>
      formatCurrency(v, currency, decimals),
  percent:
    (decimals = 1): ValueFormat =>
    (v) =>
      formatPercent(v, decimals),
  unit:
    (unit: string, decimals = 0): ValueFormat =>
    (v) =>
      `${formatNumber(v, decimals)} ${unit}`,
};
