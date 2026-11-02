// The day's hour cells and their arithmetic (timesheets.js). Cell layout
// mirrors welding/timesheet_layout.py on the backend.

export interface HourCell {
  start: string;
  end: string;
  hours: number;
}

export const CELLS: readonly HourCell[] = [
  { start: '07:30', end: '08:00', hours: 0.5 },
  { start: '08:00', end: '09:00', hours: 1 },
  { start: '09:00', end: '10:00', hours: 1 },
  { start: '10:00', end: '11:00', hours: 1 },
  { start: '11:00', end: '12:00', hours: 1 },
  { start: '12:30', end: '13:00', hours: 0.5 },
  { start: '13:00', end: '14:00', hours: 1 },
  { start: '14:00', end: '15:00', hours: 1 },
  { start: '15:00', end: '16:00', hours: 1 },
  { start: '16:00', end: '17:00', hours: 1 },
  { start: '17:00', end: '18:00', hours: 1 },
  { start: '18:00', end: '19:00', hours: 1 },
  { start: '19:00', end: '20:00', hours: 1 },
  { start: '20:00', end: '21:00', hours: 1 },
];

/** Cells before this index are the regular day; the rest are overtime ("mesai"). */
export const REGULAR_CELLS = 10;
/** The first afternoon cell (a half holiday's holiday part starts here). */
export const NOON_CELL = 5;
/** The "İş emri dışı genel işler" job. */
export const GENERAL = '1000';

const BUCKET_WORD: Record<string, string> = { regular: 'normal', after_hours: 'fazla mesai', holiday: 'tatil' };
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export type HourBuckets = Partial<Record<'regular' | 'after_hours' | 'holiday', number>> & Record<string, number>;

export function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIso(value: string | null | undefined): Date | null {
  const [y, m, d] = String(value || '').split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export function shiftIso(value: string, delta: number): string {
  const d = fromIso(value) ?? new Date();
  d.setDate(d.getDate() + delta);
  return toIso(d);
}

export function dayName(iso: string | null | undefined): string {
  const d = fromIso(iso);
  return d ? DAY_NAMES[d.getDay()]! : '';
}

/** "05.11.2026 Perşembe". */
export function formatTr(iso: string | null | undefined): string {
  const d = fromIso(iso);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${DAY_NAMES[d.getDay()]}`;
}

/** 8 → "8", 7.5 → "7,5". */
export function fmtHours(h: unknown): string {
  const n = Number(h) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

/** "normal 8 sa · fazla mesai 2 sa", or "–". */
export function hoursWords(hours: Record<string, unknown> | null | undefined): string {
  const parts = Object.entries(hours || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([k, v]) => `${BUCKET_WORD[k] || k} ${fmtHours(v)} sa`);
  return parts.length ? parts.join(' · ') : '–';
}

/** The marked cells' hours by bucket for the day kind (weekday, saturday, sunday, holiday, half_holiday). */
export function hoursFor(cells: readonly boolean[], kind: string): HourBuckets {
  const out: HourBuckets = {};
  const add = (bucket: string, h: number) => {
    out[bucket] = (out[bucket] || 0) + h;
  };
  CELLS.forEach((cell, idx) => {
    if (!cells[idx]) return;
    if (kind === 'sunday' || kind === 'holiday') add('holiday', cell.hours);
    else if (kind === 'saturday') add('after_hours', cell.hours);
    else if (kind === 'half_holiday') add(idx >= NOON_CELL ? 'holiday' : 'regular', cell.hours);
    else add(idx >= REGULAR_CELLS ? 'after_hours' : 'regular', cell.hours);
  });
  return out;
}

export function sumHours(hours: Record<string, unknown> | null | undefined): number {
  return Object.values(hours || {}).reduce<number>((a, b) => a + Number(b), 0);
}

/** "07:30–12:00, 12:30–15:00" from the marked cells (the lunch gap splits a run). */
export function rangesText(cells: readonly boolean[] | null | undefined): string {
  const marked = cells || [];
  const runs: [number, number][] = [];
  let start: number | null = null;
  CELLS.forEach((cell, idx) => {
    const on = !!marked[idx];
    const prev = CELLS[idx - 1];
    const continues = on && start !== null && prev && prev.end === cell.start && marked[idx - 1];
    if (on && !continues) {
      if (start !== null) runs.push([start, idx - 1]);
      start = idx;
    } else if (!on && start !== null) {
      runs.push([start, idx - 1]);
      start = null;
    }
  });
  if (start !== null) runs.push([start, CELLS.length - 1]);
  return runs.map(([a, b]) => `${CELLS[a]!.start}–${CELLS[b]!.end}`).join(', ');
}

/** "08:00" → "08", "07:30" stays. */
export const shortTime = (t: string) => (t.endsWith(':00') ? t.slice(0, 2) : t);
export const jobLabel = (jobNo: string) => (jobNo === GENERAL ? 'GENEL' : jobNo);
export const jobTitle = (jobNo: string, title?: string | null) =>
  jobNo === GENERAL ? 'İş emri dışı genel işler' : title || '';
