// Date entry for the sheet (gg.aa.yyyy).
//
// The sheet SHOWS day-first, but a native <input type="date"> is formatted by
// the BROWSER's locale: an English-language Chrome renders the same cell
// mm/dd/yyyy while being edited. The page cannot override that, so the date
// editor is a masked text input instead: what the planner types matches what
// the cell shows, on every machine. The value handed to onEdit stays the ISO
// yyyy-mm-dd the page and the API speak.

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const DATE_ENTRY_PLACEHOLDER = 'gg.aa.yyyy';

/** ISO yyyy-mm-dd -> 'dd.mm.yyyy' (empty string for a missing date). */
export function formatDMY(iso: string | null | undefined): string {
  const m = ISO_DATE_RE.exec(String(iso ?? '').trim());
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/** dd.mm: the year is on the header tiers and in every tooltip, and a bar
 *  label has to stay narrow enough not to reach the next row's work. */
export function shortDMY(iso: string | null | undefined): string {
  const m = ISO_DATE_RE.exec(String(iso ?? '').trim());
  return m ? `${m[3]}.${m[2]}` : '';
}

/** Typed text -> ISO yyyy-mm-dd, '' for blank (a cleared date), or null when
 *  it is not a date at all. Day-first always: 03.04 is 3 April, never 4 March.
 *  Accepts . / - and bare digits as separators, a 2-digit year (20xx), and a
 *  pasted ISO string; rejects anything that is not a real calendar day, so
 *  31.04 is refused rather than silently rolled into May. */
export function parseDMY(text: string | null | undefined): string | null {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  let y: string, mo: string, d: string;
  const iso = ISO_DATE_RE.exec(raw);
  if (iso) {
    [, y = '', mo = '', d = ''] = iso;
  } else {
    const m =
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(raw) ||
      /^(\d{2})(\d{2})(\d{4})$/.exec(raw);
    if (!m) return null;
    [, d = '', mo = '', y = ''] = m;
    if (y.length === 2) y = `20${y}`;
  }
  const [yn, mon, dn] = [Number(y), Number(mo), Number(d)];
  if (mon < 1 || mon > 12 || dn < 1) return null;
  // Real calendar day: month lengths and leap years, no rollover.
  const probe = new Date(Date.UTC(yn, mon - 1, dn));
  if (probe.getUTCFullYear() !== yn || probe.getUTCMonth() !== mon - 1 || probe.getUTCDate() !== dn)
    return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(yn).padStart(4, '0')}-${pad(mon)}-${pad(dn)}`;
}

/** Live mask for the editor, applied as the planner types.
 *
 *  Straight digits are cut positionally (10042026 -> 10.04.2026), but a typed
 *  separator wins over the positional cut: "3.4.2026" is 3 April and must not
 *  be re-sliced into "34.20.26". A pasted ISO date flips to the day-first form
 *  the cell shows rather than being cut up as digits. */
export function maskDMY(text: string | null | undefined): string {
  const raw = String(text ?? '');
  const trimmed = raw.trim();
  if (ISO_DATE_RE.test(trimmed)) return formatDMY(trimmed);
  const clean = (part: string | undefined, len: number) =>
    String(part ?? '')
      .replace(/\D/g, '')
      .slice(0, len);
  if (/[./-]/.test(raw)) {
    // Their grouping, our separator. A trailing empty group is kept so the dot
    // they just typed does not vanish from under the caret.
    const parts = raw.split(/[./-]/).slice(0, 3);
    const lens = [2, 2, 4];
    return parts.map((p, i) => clean(p, lens[i] ?? 4)).join('.');
  }
  const digits = clean(raw, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter((p) => p !== '')
    .join('.');
}

export interface GridOption {
  value: string;
  label: string;
}

// Keep the current value in a <select> even when it is not in the editable
// list (blocked/skipped on a department row). Otherwise the browser picks the
// first option and a blur looks like a real edit.
export function optionsWithCurrentValue(
  options: readonly GridOption[] | null | undefined,
  currentValue: unknown,
): GridOption[] {
  const opts = Array.isArray(options) ? options.slice() : [];
  if (
    currentValue != null &&
    String(currentValue) !== '' &&
    !opts.some((o) => String(o.value) === String(currentValue))
  ) {
    opts.unshift({ value: String(currentValue), label: String(currentValue) });
  }
  return opts;
}
