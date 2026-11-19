// tr-TR display formatting, matching what the legacy pages do by hand
// (`toLocaleDateString('tr-TR')`, `toLocaleString('tr-TR', {...})`, ...).
// Every formatter returns '-' for null, undefined and ''.

export type DateInput = Date | string | number | null | undefined;
export type NumberInput = number | string | null | undefined;

const EMPTY = '-';
const LOCALE = 'tr-TR';

// Building an Intl formatter is the slow part of toLocaleString; tables call
// these for every cell, so keep one per option set.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, options);
    numberFormats.set(key, format);
  }
  return format;
}

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALE, options);
    dateFormats.set(key, format);
  }
  return format;
}

function isEmpty(value: unknown): value is null | undefined | '' {
  return value === null || value === undefined || value === '';
}

/** A Date for a Date, timestamp, ISO string or "YYYY-MM-DD"; null when unparseable. */
export function toDate(value: DateInput): Date | null {
  if (isEmpty(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  // new Date('2026-10-30') is UTC midnight; a bare day from the API is a local day.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A number for a number or an API decimal string ("1234.50"); null otherwise. */
export function toNumber(value: NumberInput): number | null {
  if (isEmpty(value)) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatDateWith(value: DateInput, options: Intl.DateTimeFormatOptions): string {
  if (isEmpty(value)) return EMPTY;
  const date = toDate(value);
  // Legacy pages show the raw text when it is not a date; so do we.
  return date ? dateFormat(options).format(date) : String(value);
}

/** "30.10.2026" */
export function formatDate(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  return formatDateWith(value, options);
}

/** "30.10.2026 14:05" */
export function formatDateTime(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  return formatDateWith(value, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/** "14:05" */
export function formatTime(value: DateInput, options: Intl.DateTimeFormatOptions = {}): string {
  return formatDateWith(value, { hour: '2-digit', minute: '2-digit', ...options });
}

function fractionOptions(decimals: number | Intl.NumberFormatOptions | undefined): Intl.NumberFormatOptions {
  if (decimals === undefined) return {};
  if (typeof decimals === 'number') {
    return { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  }
  return decimals;
}

/**
 * "1.234,5". `decimals` fixes the fraction digits (2 -> "1.234,50"); pass
 * Intl options for anything else. Without it, like toLocaleString('tr-TR').
 */
export function formatNumber(
  value: NumberInput,
  decimals?: number | Intl.NumberFormatOptions,
): string {
  const n = toNumber(value);
  if (n === null) return isEmpty(value) ? EMPTY : String(value);
  return numberFormat(fractionOptions(decimals)).format(n);
}

/** "₺1.234,56", "€1.234,56" for currency 'EUR'. */
export function formatCurrency(
  value: NumberInput,
  currency = 'TRY',
  decimals: number | Intl.NumberFormatOptions = 2,
): string {
  const n = toNumber(value);
  if (n === null) return isEmpty(value) ? EMPTY : String(value);
  return numberFormat({ style: 'currency', currency, ...fractionOptions(decimals) }).format(n);
}

/** Takes percent units, like the legacy pages: 41.4 -> "41,4%". */
export function formatPercent(value: NumberInput, decimals = 1): string {
  const n = toNumber(value);
  if (n === null) return isEmpty(value) ? EMPTY : String(value);
  return `${numberFormat(fractionOptions(decimals)).format(n)}%`;
}

// --- bar lengths ----------------------------------------------------------------------
// Length materials (pipe, lama, profile, mil: cards whose category is 'boy') are
// read and typed in metres everywhere, never mm: "500 mm" next to quantities in
// metres gets read as 500 m of pipe (user, 2026-11-19). Lengths are still stored
// in mm (length_mm, piece_length_mm); plates keep mm.

/** A bar length (stored in mm) in metres: "6 m", "2,5 m", "0,75 m" (backend planning.sizes.bar_length). */
export function barMetres(lengthMm: NumberInput): string {
  const n = toNumber(lengthMm);
  if (n === null) return isEmpty(lengthMm) ? EMPTY : String(lengthMm);
  return `${String(Number((n / 1000).toFixed(3))).replace('.', ',')} m`;
}

/** A bar length in mm as the metres a bar length input shows (6000 → 6); '' when there is none. */
export function mmToMetres(lengthMm: NumberInput): number | '' {
  const n = toNumber(lengthMm);
  return n === null ? '' : Number((n / 1000).toFixed(3));
}

/**
 * What a bar length input holds (metres, "2,5" or 2.5) as whole mm for the API
 * (2500); '' when it is not a number.
 */
export function metresToMm(metres: NumberInput): number | '' {
  if (isEmpty(metres)) return '';
  const n = typeof metres === 'number' ? metres : Number(String(metres).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) : '';
}

/** Props for a Mantine NumberInput that takes a bar length in metres ("2,5"). */
export const BAR_METRES_INPUT = {
  decimalSeparator: ',',
  decimalScale: 3,
  min: 0,
  hideControls: true,
} as const;
