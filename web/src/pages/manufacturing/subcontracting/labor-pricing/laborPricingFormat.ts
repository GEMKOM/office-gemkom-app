// Number helpers and rate thresholds of labor-pricing.js.

export const HOURS_PER_YEVMIYE = 9;

/** tr-TR with fixed digits; '—' for anything that is not a finite number. */
export function fmt(value: number, digits: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function eur(value: unknown): string {
  return `${fmt(Math.round(Number(value)), 0)} €`;
}

export function tl(value: unknown): string {
  return `${fmt(Math.round(Number(value)), 0)} ₺`;
}

/** One decimal for half days, none for whole ones (legacy `days % 1 ? 1 : 0`). */
export function dayDigits(days: number): number {
  return days % 1 ? 1 : 0;
}

// ---- rate thresholds ----------------------------------------------------------

/** Under `green` is comfortable, over `red` needs a look; null = that limit is off. */
export interface Thresholds {
  green: number | null;
  red: number | null;
}

export const THRESHOLD_DEFAULTS: Thresholds = { green: 1, red: 2 };
// v2: the first version started both limits empty, and anyone who had touched
// them has nulls stored that would hide the 1 € / 2 € defaults.
export const THRESHOLD_KEY = 'labor-pricing-thresholds-v2';

export function toLimit(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The stored limits: a key never stored keeps its default; one stored as null stays off. */
export function loadThresholds(): Thresholds {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(THRESHOLD_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      const s = saved as Record<string, unknown>;
      return {
        green: 'green' in s ? toLimit(s.green) : THRESHOLD_DEFAULTS.green,
        red: 'red' in s ? toLimit(s.red) : THRESHOLD_DEFAULTS.red,
      };
    }
  } catch {
    // Private window or blocked storage: the defaults are fine.
  }
  return { ...THRESHOLD_DEFAULTS };
}

export function saveThresholds(thresholds: Thresholds) {
  try {
    localStorage.setItem(THRESHOLD_KEY, JSON.stringify(thresholds));
  } catch {
    // Not worth failing the repaint over.
  }
}

/** Row tint from the line's labor rate. Red wins where the two limits overlap. */
export function rowTint(laborPerKg: unknown, thresholds: Thresholds): string | null {
  const rate = Number(laborPerKg);
  if (laborPerKg === null || laborPerKg === undefined || !Number.isFinite(rate)) return null;
  if (thresholds.red !== null && rate > thresholds.red) return 'rgba(176, 46, 46, .16)';
  if (thresholds.green !== null && rate < thresholds.green) return 'rgba(39, 107, 76, .16)';
  return null;
}
