import { describe, expect, it } from 'vitest';
import {
  barGaps,
  localDateKey,
  machineCalendarWindows,
  offIntervals,
  parseClock,
  weekendsOff,
} from './calendar';
import { viewRange } from './timeScale';

const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

// Mon-Fri 08:00-12:00 and 13:00-17:30, Saturday 08:00-12:00, Sunday off;
// 29 October 2026 (Thursday) a holiday.
const calendar = {
  week_template: {
    '0': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:30' },
    ],
    '1': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:30' },
    ],
    '2': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:30' },
    ],
    '3': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:30' },
    ],
    '4': [
      { start: '08:00', end: '12:00' },
      { start: '13:00', end: '17:30' },
    ],
    '5': [{ start: '08:00', end: '12:00' }],
    '6': [],
  },
  work_exceptions: [{ date: '2026-10-29', windows: [] }],
};

describe('machineCalendarWindows', () => {
  const windows = machineCalendarWindows(calendar)!;

  it('maps JS weekdays onto the Monday-first template', () => {
    expect(windows(new Date(local(2026, 11, 2)))).toEqual([
      { start: 480, end: 720 },
      { start: 780, end: 1050 },
    ]);
    expect(windows(new Date(local(2026, 11, 7)))).toEqual([{ start: 480, end: 720 }]); // Saturday
    expect(windows(new Date(local(2026, 11, 8)))).toEqual([]); // Sunday
  });

  it('applies exceptions by the local date', () => {
    expect(windows(new Date(local(2026, 10, 29, 0, 30)))).toEqual([]);
    expect(localDateKey(new Date(local(2026, 10, 29, 0, 30)))).toBe('2026-10-29');
  });

  it('draws an overnight shift to midnight', () => {
    const night = machineCalendarWindows({
      week_template: { '0': [{ start: '22:00', end: '06:00', end_next_day: true }] },
    })!;
    expect(night(new Date(local(2026, 11, 2)))).toEqual([{ start: 1320, end: 1440 }]);
  });

  it('is undefined without a template', () => {
    expect(machineCalendarWindows(null)).toBeUndefined();
    expect(machineCalendarWindows({})).toBeUndefined();
    expect(parseClock('07:30')).toBe(450);
  });
});

describe('offIntervals', () => {
  const windows = machineCalendarWindows(calendar)!;

  it('week view shades whole days off only', () => {
    const offs = offIntervals('week', viewRange('week', local(2026, 10, 26)), windows);
    expect(offs).toEqual([
      { start: local(2026, 10, 29), end: local(2026, 10, 30), kind: 'day' },
      { start: local(2026, 11, 1), end: local(2026, 11, 2), kind: 'day' },
    ]);
  });

  it('day view shades the hours outside the windows', () => {
    const offs = offIntervals('day', viewRange('day', local(2026, 11, 2)), windows);
    expect(offs).toEqual([
      { start: local(2026, 11, 2, 0), end: local(2026, 11, 2, 8), kind: 'hours' },
      { start: local(2026, 11, 2, 12), end: local(2026, 11, 2, 13), kind: 'hours' },
      { start: local(2026, 11, 2, 17, 30), end: local(2026, 11, 3), kind: 'hours' },
    ]);
  });

  it('defaults to weekends without a calendar, nothing in the year view', () => {
    const offs = offIntervals('month', viewRange('month', local(2026, 11, 1)), weekendsOff);
    expect(offs).toHaveLength(9); // 1, 7, 8, 14, 15, 21, 22, 28, 29 Nov 2026
    expect(offIntervals('year', viewRange('year', local(2026, 1, 1)), weekendsOff)).toEqual([]);
  });
});

describe('barGaps', () => {
  const windows = machineCalendarWindows(calendar)!;

  it('gaps whole days off inside a bar in week/month views', () => {
    const bar = { start: local(2026, 11, 6, 9), end: local(2026, 11, 10, 12) };
    expect(barGaps(bar, 'week', viewRange('month', local(2026, 11, 1)), windows)).toEqual([
      { start: local(2026, 11, 8), end: local(2026, 11, 9) },
    ]);
  });

  it('gaps hours between windows in the day view, merged and clipped', () => {
    const bar = { start: local(2026, 11, 2, 10), end: local(2026, 11, 2, 19) };
    expect(barGaps(bar, 'day', viewRange('day', local(2026, 11, 2)), windows)).toEqual([
      { start: local(2026, 11, 2, 12), end: local(2026, 11, 2, 13) },
      { start: local(2026, 11, 2, 17, 30), end: local(2026, 11, 2, 19) },
    ]);
  });
});
