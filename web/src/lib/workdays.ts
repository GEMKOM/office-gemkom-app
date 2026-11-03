/**
 * Working-day (iş günü) date arithmetic: the client mirror of the backend's
 * projects/services/schedule.py (port of utils/workdays.js).
 *
 *  - weekends count 0, full public holidays 0, half-day holidays (Arife) 0.5,
 *    ordinary weekdays 1, so durations are multiples of 0.5;
 *  - spanEnd(start, n): the start day counts (a 1-workday task starting
 *    Monday ends Monday); a weekend/holiday start rolls forward;
 *  - spanStart(end, n): mirror, the end day counts and it rolls backward;
 *  - workingDaysInclusive(start, end): closed interval [start, end].
 *
 * All dates are 'YYYY-MM-DD' strings. Never round-trip through
 * `new Date('YYYY-MM-DD')`: UTC parsing shifts the date in +03:00.
 */

const MAX_WALK_DAYS = 1100;

export interface Holiday {
  date: string;
  is_half_day?: boolean;
}

export interface WorkdayCalendar {
  dayValue(date: string): number;
  isWorkday(date: string): boolean;
  isNonWorkingDay(date: string): boolean;
  /** Working-day length of [start, end]; null if missing or reversed. */
  workingDaysInclusive(
    start: string | null | undefined,
    end: string | null | undefined,
  ): number | null;
  /** End date of a task of `durationWd` working days starting ON start. */
  spanEnd(start: string, durationWd: number | null | undefined): string;
  /** Start date of a task of `durationWd` working days ending ON end. */
  spanStart(end: string, durationWd: number | null | undefined): string;
}

function toParts(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(date: string, days: number): string {
  const d = toParts(date);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function createWorkdayCalendar(holidays: readonly Holiday[] = []): WorkdayCalendar {
  const holidayValues = new Map<string, number>();
  for (const h of holidays) holidayValues.set(h.date, h.is_half_day ? 0.5 : 0);

  function dayValue(date: string): number {
    const dow = toParts(date).getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) return 0;
    return holidayValues.get(date) ?? 1;
  }

  return {
    dayValue,
    isWorkday: (date) => dayValue(date) > 0,
    isNonWorkingDay: (date) => dayValue(date) === 0,
    workingDaysInclusive(start, end) {
      if (!start || !end || end < start) return null;
      let total = 0;
      let current = start;
      for (let i = 0; i < MAX_WALK_DAYS && current <= end; i++) {
        total += dayValue(current);
        current = addDaysIso(current, 1);
      }
      return total;
    },
    spanEnd(start, durationWd) {
      if (!start || !durationWd || durationWd <= 0) return start;
      let total = dayValue(start);
      let current = start;
      for (let i = 0; i < MAX_WALK_DAYS; i++) {
        if (total >= durationWd) return current;
        current = addDaysIso(current, 1);
        total += dayValue(current);
      }
      return current;
    },
    spanStart(end, durationWd) {
      if (!end || !durationWd || durationWd <= 0) return end;
      let total = dayValue(end);
      let current = end;
      for (let i = 0; i < MAX_WALK_DAYS; i++) {
        if (total >= durationWd) return current;
        current = addDaysIso(current, -1);
        total += dayValue(current);
      }
      return current;
    },
  };
}
