import { boundaryBackground, buildTimeline, dateAt, isoWeek, toKey } from './timeline';

const today = new Date(2026, 10, 3);
const bar = (row: { start: string; end: string }) => row;
const rows = [{ start: '2026-10-05', end: '2026-12-14' }];

describe('timeline', () => {
  it('numbers weeks the ISO way', () => {
    expect(isoWeek(new Date(2026, 10, 2))).toBe(45);
    // 2026 starts on a Thursday, so it has a week 53 that runs into 2027.
    expect(isoWeek(new Date(2026, 11, 28))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
    expect(isoWeek(new Date(2027, 0, 4))).toBe(1);
  });

  it('labels week columns with their week and marks where a month begins', () => {
    const tl = buildTimeline(rows, 'week', today, bar);
    const nov2 = tl.columns.find((c) => toKey(c.start) === '2026-11-02')!;
    expect(nov2.sub).toBe('H45');
    // The first week whose upper label says Kasım draws the month rule.
    expect(nov2.boundary).toBe(true);
    expect(tl.columns.find((c) => toKey(c.start) === '2026-11-09')!.boundary).toBeUndefined();
    expect(boundaryBackground(tl)).toContain('linear-gradient');
  });

  it('labels day columns with the weekday', () => {
    const tl = buildTimeline(rows, 'day', today, bar);
    expect(tl.columns.find((c) => toKey(c.start) === '2026-11-03')!.sub).toBe('Sa');
  });

  it('reads the day back from a pixel on every scale', () => {
    for (const unit of ['day', 'week', 'month'] as const) {
      const tl = buildTimeline(rows, unit, today, bar);
      expect(toKey(dateAt(tl, tl.xOf('2026-11-10')! + 0.5))).toBe('2026-11-10');
    }
  });
});
