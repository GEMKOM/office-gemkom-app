// The sheet's timeline: maps dates to pixels for the bars, the header tiers
// and the today line (port of the timeline half of grid.js).

const DAY_MS = 24 * 60 * 60 * 1000;

export type ZoomUnit = 'day' | 'week' | 'month';
export type GridLocale = 'tr' | 'en';

export const ZOOMS: Record<ZoomUnit, { label: string; colWidth: number }> = {
  day: { label: 'Gün', colWidth: 30 },
  week: { label: 'Hafta', colWidth: 46 },
  month: { label: 'Ay', colWidth: 86 },
};

export function normalizeZoom(zoom: unknown): ZoomUnit {
  return zoom === 'day' || zoom === 'week' || zoom === 'month' ? zoom : 'week';
}

const MONTHS: Record<GridLocale, { long: string[]; short: string[] }> = {
  tr: {
    long: [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ],
    short: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
  },
  en: {
    long: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

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

// Monday-start weeks: the shop's week, and what makes the week columns line up
// with the working-day arithmetic everywhere else on the page.
function startOfWeek(date: Date): Date {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
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
  top: string;
  label: string;
}

export interface Timeline {
  unit: ZoomUnit;
  colWidth: number;
  columns: TimelineColumn[];
  width: number;
  domainStart: Date;
  posOf(value: string | Date | null | undefined): number | null;
  xOf(value: string | Date | null | undefined): number | null;
}

export interface BarSpan {
  start?: string | null;
  end?: string | null;
}

/**
 * Maps dates to pixels. Positions are FRACTIONAL: a bar that ends mid-week
 * stops mid-column instead of snapping out to the week boundary, which is what
 * keeps a 3-day job from looking like a 5-day one under the week zoom.
 * `colWidthOverride` exists for the PDF export, which has to fit a whole plan
 * into a fixed page width instead of the screen's fixed column size.
 */
export function buildTimeline<R>(
  rows: readonly R[],
  zoom: ZoomUnit,
  today: Date,
  barOf: (row: R) => BarSpan | null,
  minWidth = 0,
  colWidthOverride: number | null = null,
  locale: GridLocale = 'tr',
): Timeline {
  const unit = normalizeZoom(zoom);
  const colWidth =
    colWidthOverride && colWidthOverride > 0 ? colWidthOverride : ZOOMS[unit].colWidth;
  const months = MONTHS[locale];

  // The domain has to come from the same accessor that draws the bars.
  let minMs = today.getTime();
  let maxMs = today.getTime();
  rows.forEach((row) => {
    const bar = barOf(row);
    if (!bar) return;
    for (const value of [bar.start, bar.end]) {
      const d = toDate(value);
      if (!d) continue;
      const t = d.getTime();
      if (t < minMs) minMs = t;
      if (t > maxMs) maxMs = t;
    }
  });
  // Breathing room on both sides so bars never touch the edge and "today"
  // stays visible on an all-past or all-future plan.
  const min = addDays(new Date(minMs), -10);
  const max = addDays(new Date(maxMs), 21);

  let domainStart: Date;
  if (unit === 'day') domainStart = new Date(min.getFullYear(), min.getMonth(), min.getDate());
  else if (unit === 'week') domainStart = startOfWeek(min);
  else domainStart = startOfMonth(min);

  // Enough columns to reach `max`, then enough more to fill the pane.
  const needed = minWidth > 0 ? Math.ceil(minWidth / colWidth) : 0;

  const columns: TimelineColumn[] = [];
  if (unit === 'month') {
    let cursor = startOfMonth(domainStart);
    while (cursor <= max || columns.length < needed) {
      columns.push({
        start: new Date(cursor.getTime()),
        top: String(cursor.getFullYear()),
        label: months.short[cursor.getMonth()] ?? '',
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  } else {
    const step = unit === 'day' ? 1 : 7;
    let cursor = new Date(domainStart.getTime());
    while (cursor <= max || columns.length < needed) {
      columns.push({
        start: new Date(cursor.getTime()),
        top: `${months.long[cursor.getMonth()]} ${cursor.getFullYear()}`,
        label: String(cursor.getDate()),
      });
      cursor = addDays(cursor, step);
    }
  }

  // Fractional position of a date, in columns.
  const posOf = (value: string | Date | null | undefined): number | null => {
    const date = toDate(value);
    if (!date) return null;
    if (unit === 'day') return (date.getTime() - domainStart.getTime()) / DAY_MS;
    if (unit === 'week') return (date.getTime() - domainStart.getTime()) / (7 * DAY_MS);
    const monthsIn =
      (date.getFullYear() - domainStart.getFullYear()) * 12 +
      (date.getMonth() - domainStart.getMonth());
    return monthsIn + (date.getDate() - 1) / daysInMonth(date);
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

/** Same geometry: every bar and label lands on the same pixel. */
export function sameTimeline(a: Timeline | null, b: Timeline): boolean {
  return (
    !!a &&
    a.unit === b.unit &&
    a.colWidth === b.colWidth &&
    a.columns.length === b.columns.length &&
    a.domainStart.getTime() === b.domainStart.getTime() &&
    a.columns[0]?.top === b.columns[0]?.top
  );
}

/** The month/year tier over the week/day tier. */
export function headerTiers(timeline: Timeline): { label: string; span: number }[] {
  const tiers: { label: string; span: number }[] = [];
  let run: { label: string; span: number } | null = null;
  timeline.columns.forEach((col) => {
    if (run && run.label === col.top) run.span += 1;
    else {
      if (run) tiers.push(run);
      run = { label: col.top, span: 1 };
    }
  });
  if (run) tiers.push(run);
  return tiers;
}

// Weekend and holiday shading as ONE gradient rather than a div per column:
// with ~70 rows, a stripe element per column per row is thousands of nodes for
// something the browser can paint from a background image.
export function nonWorkingBackground(
  timeline: Timeline,
  isNonWorkingDay: ((date: string) => boolean) | null | undefined,
): string {
  if (timeline.unit !== 'day' || typeof isNonWorkingDay !== 'function') return 'none';
  const stops: string[] = [];
  timeline.columns.forEach((col, idx) => {
    if (!isNonWorkingDay(toKey(col.start))) return;
    const from = idx * timeline.colWidth;
    const to = from + timeline.colWidth;
    stops.push(
      `transparent ${from}px`,
      `var(--pg-nonwork) ${from}px`,
      `var(--pg-nonwork) ${to}px`,
      `transparent ${to}px`,
    );
  });
  if (!stops.length) return 'none';
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
