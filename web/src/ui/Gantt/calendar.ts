// Working time for the Gantt background: weekends, holidays and (in the day
// view) the hours a machine does not work. Pure functions; see calendar.test.ts.

import { addDays, startOfDay, type GanttScale, type TimeRange } from './timeScale';

/** A working window inside one day, in minutes from midnight (end may be 1440). */
export interface WorkWindow {
  start: number;
  end: number;
}

/**
 * The working windows of a local day: [] is a day off, null means "no
 * calendar for this day" (nothing is shaded).
 */
export type WorkingWindows = (day: Date) => readonly WorkWindow[] | null;

/** Saturdays and Sundays off, every other day unshaded (no machine calendar). */
export const weekendsOff: WorkingWindows = (day) => {
  const dow = day.getDay();
  return dow === 0 || dow === 6 ? [] : null;
};

/** `/machines/calendar?machine_fk=` as the legacy pages read it. */
export interface MachineCalendar {
  /** "0" = Monday … "6" = Sunday; [] or missing = no work that day. */
  week_template?: Record<
    string,
    readonly { start: string; end: string; end_next_day?: boolean }[] | undefined
  > | null;
  /** Dated overrides; `windows: []` closes the day (a holiday). */
  work_exceptions?:
    readonly { date: string; windows: readonly { start: string; end: string }[] }[] | null;
  [key: string]: unknown;
}

/** "07:30" -> 450. */
export function parseClock(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Local "YYYY-MM-DD" (legacy compared toISOString dates, which is the UTC day). */
export function localDateKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function toWindows(
  list: readonly { start: string; end: string; end_next_day?: boolean }[],
): WorkWindow[] {
  return list
    .map((w) => {
      const start = parseClock(w.start);
      // An overnight shift is drawn up to midnight on its first day.
      const end = w.end_next_day ? 24 * 60 : parseClock(w.end);
      return { start, end: end <= start ? 24 * 60 : end };
    })
    .sort((a, b) => a.start - b.start);
}

/** Working windows from a machine calendar's week template and exceptions. */
export function machineCalendarWindows(
  calendar: MachineCalendar | null | undefined,
): WorkingWindows | undefined {
  const template = calendar?.week_template;
  if (!template) return undefined;
  const exceptions = new Map<string, WorkWindow[]>();
  for (const ex of calendar.work_exceptions ?? [])
    exceptions.set(ex.date, toWindows(ex.windows ?? []));
  const days = new Map<number, WorkWindow[]>();
  for (let i = 0; i < 7; i++) days.set(i, toWindows(template[String(i)] ?? []));
  return (day) => {
    const exception = exceptions.get(localDateKey(day));
    if (exception) return exception;
    const dow = day.getDay();
    return days.get(dow === 0 ? 6 : dow - 1) ?? [];
  };
}

/** A shaded stretch of the background; `kind` 'day' is a whole day off. */
export interface OffInterval extends TimeRange {
  kind: 'day' | 'hours';
}

function dayWindowsToGaps(dayStart: number, windows: readonly WorkWindow[]): TimeRange[] {
  const gaps: TimeRange[] = [];
  const at = (minutes: number) => {
    const d = new Date(dayStart);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
  };
  let cursor = 0;
  for (const w of windows) {
    if (w.start > cursor) gaps.push({ start: at(cursor), end: at(w.start) });
    cursor = Math.max(cursor, w.end);
  }
  if (cursor < 24 * 60) gaps.push({ start: at(cursor), end: addDays(dayStart, 1) });
  return gaps;
}

/**
 * What to shade in a view: whole days off in week/month views, and in the day
 * view also the hours outside the working windows. The year view shades
 * nothing (legacy).
 */
export function offIntervals(
  scale: GanttScale,
  range: TimeRange,
  windowsFor: WorkingWindows,
): OffInterval[] {
  if (scale === 'year') return [];
  const out: OffInterval[] = [];
  for (let t = startOfDay(range.start); t < range.end; t = addDays(t, 1)) {
    const windows = windowsFor(new Date(t));
    if (windows === null) continue;
    if (windows.length === 0) {
      out.push({ start: t, end: addDays(t, 1), kind: 'day' });
    } else if (scale === 'day') {
      for (const gap of dayWindowsToGaps(t, windows)) out.push({ ...gap, kind: 'hours' });
    }
  }
  return out;
}

/**
 * The parts of a bar that fall on time off, drawn as gaps in the bar (legacy
 * split the bar into working segments). Week and month views gap whole days
 * off; the day view also gaps the hours between windows. Only the part of the
 * bar inside `clip` is checked.
 */
export function barGaps(
  bar: TimeRange,
  scale: GanttScale,
  clip: TimeRange,
  windowsFor: WorkingWindows,
): TimeRange[] {
  if (scale === 'year') return [];
  const from = Math.max(bar.start, clip.start);
  const to = Math.min(bar.end, clip.end);
  if (!(to > from)) return [];
  const gaps: TimeRange[] = [];
  for (let t = startOfDay(from); t < to; t = addDays(t, 1)) {
    const windows = windowsFor(new Date(t));
    if (windows === null) continue;
    const dayGaps =
      windows.length === 0
        ? [{ start: t, end: addDays(t, 1) }]
        : scale === 'day'
          ? dayWindowsToGaps(t, windows)
          : [];
    for (const g of dayGaps) {
      const start = Math.max(g.start, from);
      const end = Math.min(g.end, to);
      if (end > start) {
        const last = gaps.at(-1);
        if (last && last.end === start) last.end = end;
        else gaps.push({ start, end });
      }
    }
  }
  return gaps;
}
