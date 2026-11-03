/**
 * The sheet's timeline model: dates to pixels for day / week / month columns.
 * Ported from buildTimeline in planning/project-planning/grid.js; the month
 * names follow sheetLang instead of grid.js's own locale switch.
 */
import { sheetLang } from './sheetLang';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ZoomUnit = 'day' | 'week' | 'month';

export const ZOOMS: Record<ZoomUnit, { label: string; labelEn: string; colWidth: number }> = {
  day: { label: 'Gün', labelEn: 'Day', colWidth: 30 },
  week: { label: 'Hafta', labelEn: 'Week', colWidth: 46 },
  month: { label: 'Ay', labelEn: 'Month', colWidth: 86 },
};

export const ZOOM_UNITS: readonly ZoomUnit[] = ['day', 'week', 'month'];

export function isZoomUnit(value: unknown): value is ZoomUnit {
  return value === 'day' || value === 'week' || value === 'month';
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const MONTHS_TR_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthName = (i: number) => (sheetLang() === 'en' ? MONTHS_EN : MONTHS_TR)[i]!;
const monthShort = (i: number) => (sheetLang() === 'en' ? MONTHS_EN_SHORT : MONTHS_TR_SHORT)[i]!;

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Local yyyy-mm-dd of a Date. */
export function toKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function addDays(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

// Monday-start weeks: the shop's week.
function startOfWeek(date: Date): Date {
  const out = new Date(date.getTime());
  const shift = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - shift);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export interface TimelineColumn {
  start: Date;
  /** The upper tier: "Eylül 2026" (day / week) or "2026" (month). */
  top: string;
  label: string;
}

export interface Timeline {
  unit: ZoomUnit;
  colWidth: number;
  columns: TimelineColumn[];
  width: number;
  domainStart: Date;
  /** Fractional position of a date, in columns. */
  posOf: (value: string | Date | null | undefined) => number | null;
  xOf: (value: string | Date | null | undefined) => number | null;
}

export interface BarSpan {
  start?: string | null;
  end?: string | null;
}

/**
 * Maps dates to pixels. Positions are FRACTIONAL: a bar that ends mid-week
 * stops mid-column instead of snapping out to the week boundary. The domain
 * comes from the same accessor that draws the bars, plus today, with room on
 * both sides; `minWidth` adds columns until the lane is filled, and
 * `colWidthOverride` is the print layout's own column width.
 */
export function buildTimeline<R>(
  rows: readonly R[],
  zoom: ZoomUnit,
  today: Date,
  barOf: (row: R) => BarSpan | null,
  minWidth = 0,
  colWidthOverride: number | null = null,
): Timeline {
  const unit: ZoomUnit = isZoomUnit(zoom) ? zoom : 'week';
  const colWidth = colWidthOverride && colWidthOverride > 0 ? colWidthOverride : ZOOMS[unit].colWidth;

  const dates: Date[] = [];
  rows.forEach((row) => {
    const bar = barOf(row);
    if (!bar) return;
    const s = toDate(bar.start);
    const e = toDate(bar.end);
    if (s) dates.push(s);
    if (e) dates.push(e);
  });
  dates.push(today);

  let min = new Date(Math.min(...dates.map((d) => d.getTime())));
  let max = new Date(Math.max(...dates.map((d) => d.getTime())));
  // Breathing room so bars never touch the edge and today stays visible on an
  // all-past or all-future plan.
  min = addDays(min, -10);
  max = addDays(max, 21);

  let domainStart: Date;
  if (unit === 'day') domainStart = new Date(min.getFullYear(), min.getMonth(), min.getDate());
  else if (unit === 'week') domainStart = startOfWeek(min);
  else domainStart = startOfMonth(min);

  const needed = minWidth > 0 ? Math.ceil(minWidth / colWidth) : 0;

  const columns: TimelineColumn[] = [];
  if (unit === 'month') {
    let cursor = startOfMonth(domainStart);
    while (cursor <= max || columns.length < needed) {
      columns.push({
        start: new Date(cursor.getTime()),
        top: String(cursor.getFullYear()),
        label: monthShort(cursor.getMonth()),
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  } else {
    const step = unit === 'day' ? 1 : 7;
    let cursor = new Date(domainStart.getTime());
    while (cursor <= max || columns.length < needed) {
      columns.push({
        start: new Date(cursor.getTime()),
        top: `${monthName(cursor.getMonth())} ${cursor.getFullYear()}`,
        label: String(cursor.getDate()),
      });
      cursor = addDays(cursor, step);
    }
  }

  const posOf = (value: string | Date | null | undefined): number | null => {
    const date = toDate(value);
    if (!date) return null;
    if (unit === 'day') return (date.getTime() - domainStart.getTime()) / DAY_MS;
    if (unit === 'week') return (date.getTime() - domainStart.getTime()) / (7 * DAY_MS);
    const months =
      (date.getFullYear() - domainStart.getFullYear()) * 12 + (date.getMonth() - domainStart.getMonth());
    return months + (date.getDate() - 1) / daysInMonth(date);
  };

  return {
    unit,
    colWidth,
    columns,
    width: columns.length * colWidth,
    domainStart,
    posOf,
    xOf: (value) => {
      const pos = posOf(value);
      return pos === null ? null : pos * colWidth;
    },
  };
}

/** Width of one day on this timeline (a week column is 7 days, a month 30). */
export function dayWidth(timeline: Pick<Timeline, 'unit' | 'colWidth'>): number {
  if (timeline.unit === 'day') return timeline.colWidth;
  return timeline.colWidth / (timeline.unit === 'week' ? 7 : 30);
}

/** The upper header tier: runs of equal `top` labels. */
export function timelineTiers(timeline: Timeline): { label: string; span: number }[] {
  const tiers: { label: string; span: number }[] = [];
  let run: { label: string; span: number } | null = null;
  for (const col of timeline.columns) {
    if (run && run.label === col.top) run.span += 1;
    else {
      if (run) tiers.push(run);
      run = { label: col.top, span: 1 };
    }
  }
  if (run) tiers.push(run);
  return tiers;
}

// Weekend and holiday shading as ONE gradient rather than a div per column:
// with ~70 rows, a stripe element per column per row is thousands of nodes.
export function nonWorkingBackground(
  timeline: Timeline,
  isNonWorkingDay: ((date: string) => boolean) | null | undefined,
  color = 'var(--pg-nonwork)',
): string {
  if (timeline.unit !== 'day' || typeof isNonWorkingDay !== 'function') return 'none';
  const stops: string[] = [];
  timeline.columns.forEach((col, idx) => {
    if (!isNonWorkingDay(toKey(col.start))) return;
    const from = idx * timeline.colWidth;
    const to = from + timeline.colWidth;
    stops.push(`transparent ${from}px`, `${color} ${from}px`, `${color} ${to}px`, `transparent ${to}px`);
  });
  if (!stops.length) return 'none';
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
