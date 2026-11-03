/**
 * Figures for the hero's date chain (HeroChain.tsx). Ported from
 * projects/project-tracking/heroChain.js, whose string builder became the
 * component. House rules: no yellow, no exclamation marks, working days are
 * "iş günü".
 */
import { dateLocale, sheetLang, tr } from './sheetLang';

function formatWd(value: number): string {
  const abs = Math.abs(Number(value) || 0);
  const text = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1);
  return sheetLang() === 'en' ? text : text.replace('.', ',');
}

// "iş günü" / "working days" after a signed figure.
function wdUnit(n: number): string {
  return tr('iş günü', Math.abs(n) === 1 ? 'working day' : 'working days');
}

export type SignedKind = 'late' | 'early' | 'ok';

export interface SignedWd {
  text: string;
  cls: 'ps-fig-late' | 'ps-fig-early' | 'ps-fig-ok';
  kind: SignedKind;
}

/**
 * A signed working-day distance, or null when there is nothing to compare
 * (no termin, no plan).
 */
export function signedWd(value: number | string | null | undefined): SignedWd | null {
  if (value === null || value === undefined || value === '') return null;
  const raw = Number(value);
  if (Number.isNaN(raw)) return null;
  // The text shows one decimal, so anything that would print as 0,0 is
  // "tam gününde" rather than a red +0,0.
  const n = Math.round(raw * 10) / 10;
  if (n > 0) return { text: `+${formatWd(n)} ${wdUnit(n)}`, cls: 'ps-fig-late', kind: 'late' };
  if (n < 0) return { text: `−${formatWd(n)} ${wdUnit(n)}`, cls: 'ps-fig-early', kind: 'early' };
  return { text: tr('tam gününde', 'on the day'), cls: 'ps-fig-ok', kind: 'ok' };
}

/**
 * "30 Eylül 2026". A date-only value is a calendar day, not an instant:
 * parsed as local time so a viewer west of UTC (the customer link) does not
 * see the termin a day early.
 */
export function formatDateLong(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
}
