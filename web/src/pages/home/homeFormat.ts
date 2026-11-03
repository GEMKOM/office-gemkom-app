import { formatDate, toDate } from '@/lib/format';

// Small readers for the loosely typed rows the home page shows.

export const str = (value: unknown): string => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

/** The raw date string (for sorting), or null. */
export const rowDate = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** "3 Kas" for a row, or null when there is no date. */
export function day(value: unknown): string | null {
  const raw = rowDate(value);
  return raw && toDate(raw) ? formatDate(raw, { day: 'numeric', month: 'short' }) : null;
}

/** Today in the viewer's calendar, as the API writes dates ("2026-11-03"). */
export function localIsoDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole calendar days since `since`, or null without a date. */
export function daysWaiting(since: string | null, now = Date.now()): number | null {
  const date = since ? toDate(since) : null;
  if (!date) return null;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

export function waitingMeta(days: number | null): string | undefined {
  if (days === null) return undefined;
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Dünden beri';
  return `${days} gündür`;
}

/** "Günaydın" before noon, "İyi günler" in the afternoon, "İyi akşamlar" from 18:00. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'İyi geceler';
  if (hour < 12) return 'Günaydın';
  if (hour < 18) return 'İyi günler';
  return 'İyi akşamlar';
}
