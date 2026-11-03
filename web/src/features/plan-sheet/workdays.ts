/**
 * Working-day (iş günü) arithmetic the sheet needs: weekend and holiday
 * shading, and the lengths an editable link recomputes. The part of
 * utils/workdays.js (the backend's schedule.py mirror) the plan sheet uses:
 * weekends count 0, full holidays 0, half-day holidays (Arife) 0.5.
 *
 * Dates are 'YYYY-MM-DD' strings, built from (y, m, d) parts only: parsing
 * them with new Date('YYYY-MM-DD') would shift the day in +03:00.
 */
import type { SheetHoliday } from './types';

const MAX_WALK_DAYS = 1100;

function toParts(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y!, m! - 1, d);
}

function toStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = toParts(dateStr);
  d.setDate(d.getDate() + days);
  return toStr(d);
}

export interface WorkdayCalendar {
  isNonWorkingDay: (date: string) => boolean;
  /** Working-day length of [start, end]; null if missing or reversed. */
  workingDaysInclusive: (start: string | null | undefined, end: string | null | undefined) => number | null;
}

export function createWorkdayCalendar(holidays: readonly SheetHoliday[] = []): WorkdayCalendar {
  const holidayValues = new Map<string, number>();
  for (const h of holidays) holidayValues.set(h.date, h.is_half_day ? 0.5 : 0);

  function dayValue(dateStr: string): number {
    const dow = toParts(dateStr).getDay(); // 0 = Sun, 6 = Sat
    if (dow === 0 || dow === 6) return 0;
    return holidayValues.get(dateStr) ?? 1;
  }

  return {
    isNonWorkingDay: (dateStr) => dayValue(dateStr) === 0,
    workingDaysInclusive: (startStr, endStr) => {
      if (!startStr || !endStr || endStr < startStr) return null;
      let total = 0;
      let current = startStr;
      for (let i = 0; i < MAX_WALK_DAYS && current <= endStr; i++) {
        total += dayValue(current);
        current = addDays(current, 1);
      }
      return total;
    },
  };
}

/** Signed working days from `planned` to `actual`, the backend's
 *  working_day_delta: the first day is not counted, the last one is. */
export function workingDayDelta(
  calendar: WorkdayCalendar,
  planned: string | null | undefined,
  actual: string | null | undefined,
): number | null {
  if (!planned || !actual) return null;
  if (planned === actual) return 0;
  const [sign, first, last] =
    actual > planned ? [1, addDays(planned, 1), actual] : [-1, addDays(actual, 1), planned];
  const total = calendar.workingDaysInclusive(first, last);
  return total == null ? null : sign * total;
}
