// Date maths for the Gantt: view ranges, axis ticks, pixel scale, bar boxes,
// snapping and drag results. Pure functions in local time (the plant runs on
// Europe/Istanbul, like the legacy components/gantt/gantt.js), unit-tested in
// timeScale.test.ts.

export type GanttScale = 'day' | 'week' | 'month' | 'year';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Half-open time range [start, end) in epoch ms. */
export interface TimeRange {
  start: number;
  end: number;
}

export const SCALE_LABELS: Record<GanttScale, string> = {
  day: 'Gün',
  week: 'Hafta',
  month: 'Ay',
  year: 'Yıl',
};

const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
];

function toMs(value: Date | number): number {
  return typeof value === 'number' ? value : value.getTime();
}

/** Local midnight of the day holding `t`. */
export function startOfDay(t: Date | number): number {
  const d = new Date(toMs(t));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Local midnight `n` calendar days after `t`'s day (DST-safe). */
export function addDays(t: Date | number, n: number): number {
  const d = new Date(toMs(t));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

/** Monday 00:00 of the week holding `t` (weeks start on Monday, as in legacy). */
export function startOfWeek(t: Date | number): number {
  const d = new Date(toMs(t));
  const offset = d.getDay() === 0 ? -6 : 1 - d.getDay();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

export function startOfMonth(t: Date | number): number {
  const d = new Date(toMs(t));
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function daysInMonth(t: Date | number): number {
  const d = new Date(toMs(t));
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Calendar days in a range (whole local days). */
export function dayCount(range: TimeRange): number {
  return Math.max(1, Math.round((startOfDay(range.end) - startOfDay(range.start)) / DAY));
}

/**
 * The range a view shows for `anchor`. Day: that day. Week: Monday-Sunday.
 * Month: the month, or `months` consecutive months. Year: January-December.
 */
export function viewRange(scale: GanttScale, anchor: Date | number, months = 1): TimeRange {
  const d = new Date(toMs(anchor));
  switch (scale) {
    case 'day': {
      const start = startOfDay(d);
      return { start, end: addDays(start, 1) };
    }
    case 'week': {
      const start = startOfWeek(d);
      return { start, end: addDays(start, 7) };
    }
    case 'month': {
      const span = Math.max(1, Math.floor(months));
      return {
        start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
        end: new Date(d.getFullYear(), d.getMonth() + span, 1).getTime(),
      };
    }
    case 'year':
      return {
        start: new Date(d.getFullYear(), 0, 1).getTime(),
        end: new Date(d.getFullYear() + 1, 0, 1).getTime(),
      };
  }
}

/** Prev / next period (legacy navigate): one day, week, month or year. */
export function shiftAnchor(scale: GanttScale, anchor: Date | number, direction: number): number {
  const d = new Date(toMs(anchor));
  switch (scale) {
    case 'day':
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + direction,
        d.getHours(),
        d.getMinutes(),
      ).getTime();
    case 'week':
      return new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + 7 * direction,
        d.getHours(),
        d.getMinutes(),
      ).getTime();
    case 'month': {
      // Clamp the day so 31 Jan + 1 month is 28/29 Feb, not 3 March.
      const target = new Date(d.getFullYear(), d.getMonth() + direction, 1);
      const day = Math.min(d.getDate(), daysInMonth(target));
      return new Date(
        target.getFullYear(),
        target.getMonth(),
        day,
        d.getHours(),
        d.getMinutes(),
      ).getTime();
    }
    case 'year':
      return new Date(
        d.getFullYear() + direction,
        d.getMonth(),
        Math.min(d.getDate(), 28),
        d.getHours(),
      ).getTime();
  }
}

/**
 * Month span for monthsPerView 'auto' (legacy _taskMonthRange): every month the
 * bars touch plus today, plus `trailing` empty months, capped at `max`.
 * Returns the first month and the span, or null without bars.
 */
export function autoMonthSpan(
  times: Iterable<number>,
  now: number,
  { trailing = 3, max = 18 }: { trailing?: number; max?: number } = {},
): { start: number; months: number } | null {
  let min = Infinity;
  let maxT = -Infinity;
  for (const t of times) {
    if (!Number.isFinite(t)) continue;
    if (t < min) min = t;
    if (t > maxT) maxT = t;
  }
  if (min === Infinity) return null;
  min = Math.min(min, now);
  maxT = Math.max(maxT, now);
  const first = new Date(min);
  const last = new Date(maxT);
  const months =
    (last.getFullYear() - first.getFullYear()) * 12 +
    (last.getMonth() - first.getMonth()) +
    1 +
    trailing;
  return { start: startOfMonth(first), months: Math.min(Math.max(months, 1), max) };
}

/** The label of the period control, e.g. "Kasım 2026", "2-8 Kas", "Ağu – Ara 2026". */
export function periodLabel(scale: GanttScale, anchor: Date | number, months = 1): string {
  const d = new Date(toMs(anchor));
  switch (scale) {
    case 'day':
      return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
    case 'week': {
      const start = new Date(startOfWeek(d));
      const end = new Date(addDays(start, 6));
      const startMonth = MONTHS_SHORT[start.getMonth()];
      const endMonth = MONTHS_SHORT[end.getMonth()];
      return start.getMonth() === end.getMonth()
        ? `${start.getDate()}-${end.getDate()} ${endMonth}`
        : `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth}`;
    }
    case 'month': {
      if (months <= 1) return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + months - 1, 1);
      const to = `${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
      return first.getFullYear() === last.getFullYear()
        ? `${MONTHS_SHORT[first.getMonth()]} – ${to}`
        : `${MONTHS_SHORT[first.getMonth()]} ${first.getFullYear()} – ${to}`;
    }
    case 'year':
      return String(d.getFullYear());
  }
}

/** One column of the time axis. */
export interface Tick {
  start: number;
  end: number;
  label: string;
  sub: string;
  /** First column of a month (a stronger line on long strips). */
  monthStart?: boolean;
  /** Saturday or Sunday (day columns only). */
  weekend?: boolean;
}

/** The axis columns of a view: hours (day), days (week, month) or months (year). */
export function ticks(scale: GanttScale, range: TimeRange): Tick[] {
  const out: Tick[] = [];
  if (scale === 'day') {
    const day = new Date(range.start);
    for (let h = 0; h < 24; h++) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h).getTime();
      const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h + 1).getTime();
      out.push({
        start,
        end,
        label: String(h).padStart(2, '0'),
        sub: h === 0 ? `${day.getDate()}/${day.getMonth() + 1}` : h < 12 ? 'ÖÖ' : 'ÖS',
      });
    }
    return out;
  }
  if (scale === 'year') {
    const year = new Date(range.start).getFullYear();
    for (let m = 0; m < 12; m++) {
      out.push({
        start: new Date(year, m, 1).getTime(),
        end: new Date(year, m + 1, 1).getTime(),
        label: MONTHS_SHORT[m]!,
        sub: String(year),
        monthStart: true,
      });
    }
    return out;
  }
  for (let t = startOfDay(range.start), i = 0; t < range.end; t = addDays(t, 1), i++) {
    const d = new Date(t);
    const dow = d.getDay();
    out.push({
      start: t,
      end: addDays(t, 1),
      label: String(d.getDate()),
      sub:
        scale === 'week'
          ? `${WEEKDAYS_SHORT[dow === 0 ? 6 : dow - 1]} ${d.getMonth() + 1}`
          : MONTHS_SHORT[d.getMonth()]!,
      monthStart: d.getDate() === 1 && i > 0,
      weekend: dow === 0 || dow === 6,
    });
  }
  return out;
}

export interface ScaleOptions {
  /** Width of the timeline viewport (scroll area minus the label column). */
  viewportWidth: number;
  /** Months shown by the month view (from monthsPerView). */
  months?: number;
  /** Fixed day width of a multi-month strip (legacy monthDayWidth). */
  monthDayWidth?: number;
}

/**
 * Column width as legacy calculateCellWidth: day shows ~11 hours (07-17) of
 * 24, week fits 7 days, one month fits its days, a multi-month strip uses a
 * fixed day width and scrolls, a year fits 12 months.
 */
export function cellWidth(scale: GanttScale, range: TimeRange, options: ScaleOptions): number {
  const width = options.viewportWidth > 0 ? options.viewportWidth : 800;
  switch (scale) {
    case 'day':
      return Math.max(20, width / 11);
    case 'week':
      return Math.max(60, width / 7);
    case 'month':
      if ((options.months ?? 1) > 1) return options.monthDayWidth ?? 38;
      return Math.max(40, width / dayCount(range));
    case 'year':
      return Math.max(80, width / 12);
  }
}

/** Pixels per millisecond for a view; the timeline is linear in time. */
export function pxPerMs(scale: GanttScale, range: TimeRange, options: ScaleOptions): number {
  const cell = cellWidth(scale, range, options);
  switch (scale) {
    case 'day':
      return cell / HOUR;
    case 'week':
    case 'month':
      return cell / DAY;
    case 'year':
      // An average month; months are drawn proportional to their days.
      return cell / (DAY * 30.436875);
  }
}

/** Default snap step while dragging: 15 min (day), 1 h (week, month), 1 day (year). */
export function snapStep(scale: GanttScale): number {
  switch (scale) {
    case 'day':
      return 15 * MINUTE;
    case 'week':
    case 'month':
      return HOUR;
    case 'year':
      return DAY;
  }
}

/** Rounds `t` to the nearest `step` counted from `origin` (a local midnight). */
export function snapTime(t: number, step: number, origin: number): number {
  if (step <= 0) return t;
  return origin + Math.round((t - origin) / step) * step;
}

export interface BarBox {
  left: number;
  width: number;
  /** The bar runs past the view's start / end. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/**
 * Where a bar sits on the timeline, clipped to the view like legacy; null when
 * it is entirely outside. Short bars get `minWidth` so they stay clickable.
 */
export function barBox(
  start: number,
  end: number,
  range: TimeRange,
  scale: number,
  minWidth = 20,
): BarBox | null {
  if (!(end > range.start && start < range.end)) {
    // A zero-length bar exactly at a point inside the view still shows.
    if (!(start === end && start >= range.start && start < range.end)) return null;
  }
  const from = Math.max(start, range.start);
  const to = Math.min(end, range.end);
  const left = (from - range.start) * scale;
  const width = Math.max(minWidth, (to - from) * scale);
  return { left, width, clippedStart: start < range.start, clippedEnd: end > range.end };
}

export type DragMode = 'move' | 'start' | 'end';

/**
 * A bar's times after dragging by `delta` ms: moves keep the exact duration and
 * snap the start; resizes snap the dragged edge and keep at least `minDuration`.
 */
export function dragResult(
  mode: DragMode,
  original: TimeRange,
  delta: number,
  step: number,
  origin: number,
  minDuration = step,
): TimeRange {
  const duration = original.end - original.start;
  if (mode === 'move') {
    const start = snapTime(original.start + delta, step, origin);
    return { start, end: start + duration };
  }
  if (mode === 'start') {
    const start = Math.min(
      snapTime(original.start + delta, step, origin),
      original.end - minDuration,
    );
    return { start, end: original.end };
  }
  const end = Math.max(snapTime(original.end + delta, step, origin), original.start + minDuration);
  return { start: original.start, end };
}

/** The row under a y offset (from the top of the first row), clamped to the list. */
export function rowIndexAt(y: number, rowHeight: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, Math.floor(y / rowHeight)));
}

/**
 * Where a dragged row lands: before or after the row under the pointer,
 * depending on which half it is in.
 */
export function reorderTarget(
  y: number,
  rowHeight: number,
  count: number,
): { index: number; position: 'before' | 'after' } | null {
  const index = rowIndexAt(y, rowHeight, count);
  if (index < 0) return null;
  const within = y - index * rowHeight;
  return { index, position: within < rowHeight / 2 ? 'before' : 'after' };
}

// toLocale*String builds an Intl formatter on every call, which is slow when
// hundreds of bars mount at once; keep one of each.
const DATE_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const TIME_FORMAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

/** "12.03.2026 08:30 - 13.03.2026 17:00" for tooltips and aria labels. */
export function formatSpan(start: number, end: number): string {
  return `${DATE_FORMAT.format(start)} ${TIME_FORMAT.format(start)} - ${DATE_FORMAT.format(end)} ${TIME_FORMAT.format(end)}`;
}

/** Duration in hours with up to one decimal ("2", "1,5"). */
export function formatHours(ms: number): string {
  const hours = Math.round((ms / HOUR) * 10) / 10;
  return hours.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
}
