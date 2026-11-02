import { describe, expect, it } from 'vitest';
import {
  addDays,
  autoMonthSpan,
  barBox,
  cellWidth,
  DAY,
  dayCount,
  dragResult,
  HOUR,
  MINUTE,
  periodLabel,
  pxPerMs,
  reorderTarget,
  rowIndexAt,
  shiftAnchor,
  snapStep,
  snapTime,
  startOfWeek,
  ticks,
  viewRange,
} from './timeScale';

const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).getTime();

describe('viewRange', () => {
  it('day: local midnight to the next midnight', () => {
    expect(viewRange('day', local(2026, 11, 4, 15, 30))).toEqual({
      start: local(2026, 11, 4),
      end: local(2026, 11, 5),
    });
  });

  it('week: Monday to the next Monday, Sunday belongs to the week before', () => {
    // 8 Nov 2026 is a Sunday.
    expect(viewRange('week', local(2026, 11, 8, 12))).toEqual({
      start: local(2026, 11, 2),
      end: local(2026, 11, 9),
    });
    expect(viewRange('week', local(2026, 11, 9))).toEqual({
      start: local(2026, 11, 9),
      end: local(2026, 11, 16),
    });
  });

  it('month: one month, or several in a strip', () => {
    expect(viewRange('month', local(2026, 2, 14))).toEqual({
      start: local(2026, 2, 1),
      end: local(2026, 3, 1),
    });
    expect(viewRange('month', local(2026, 11, 20), 3)).toEqual({
      start: local(2026, 11, 1),
      end: local(2027, 2, 1),
    });
  });

  it('year: January to January', () => {
    expect(viewRange('year', local(2026, 7, 1))).toEqual({
      start: local(2026, 1, 1),
      end: local(2027, 1, 1),
    });
  });
});

describe('shiftAnchor', () => {
  it('moves by one period', () => {
    expect(shiftAnchor('day', local(2026, 12, 31, 9), 1)).toBe(local(2027, 1, 1, 9));
    expect(shiftAnchor('week', local(2026, 11, 4), -1)).toBe(local(2026, 10, 28));
    expect(shiftAnchor('year', local(2026, 5, 5), 1)).toBe(local(2027, 5, 5));
  });

  it('clamps the day when a month is shorter (31 Jan -> 28 Feb)', () => {
    expect(shiftAnchor('month', local(2026, 1, 31), 1)).toBe(local(2026, 2, 28));
    expect(shiftAnchor('month', local(2026, 3, 31), -1)).toBe(local(2026, 2, 28));
  });
});

describe('ticks', () => {
  it('day view: 24 hours, the first labelled with the date', () => {
    const t = ticks('day', viewRange('day', local(2026, 11, 4)));
    expect(t).toHaveLength(24);
    expect(t[0]).toMatchObject({ label: '00', sub: '4/11' });
    expect(t[7]).toMatchObject({ label: '07', sub: 'ÖÖ' });
    expect(t[13]).toMatchObject({ label: '13', sub: 'ÖS' });
  });

  it('week view: seven days with Turkish day names and weekend flags', () => {
    const t = ticks('week', viewRange('week', local(2026, 11, 4)));
    expect(t.map((x) => x.sub)).toEqual([
      'Pzt 11',
      'Sal 11',
      'Çar 11',
      'Per 11',
      'Cum 11',
      'Cmt 11',
      'Paz 11',
    ]);
    expect(t.map((x) => Boolean(x.weekend))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  it('month strip: one column a day, month starts marked', () => {
    const t = ticks('month', viewRange('month', local(2026, 1, 10), 2));
    expect(t).toHaveLength(31 + 28);
    expect(t[31]).toMatchObject({ label: '1', sub: 'Şub', monthStart: true });
    expect(t[0]?.monthStart).toBe(false);
  });

  it('year view: twelve months', () => {
    const t = ticks('year', viewRange('year', local(2026, 3, 1)));
    expect(t.map((x) => x.label)).toEqual([
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
    ]);
  });
});

describe('cellWidth / pxPerMs', () => {
  const opts = { viewportWidth: 1100 };

  it('matches legacy calculateCellWidth', () => {
    expect(cellWidth('day', viewRange('day', 0), opts)).toBe(100); // 11 hours visible
    expect(cellWidth('week', viewRange('week', 0), { viewportWidth: 700 })).toBe(100);
    expect(cellWidth('week', viewRange('week', 0), { viewportWidth: 210 })).toBe(60); // minimum
    expect(cellWidth('month', viewRange('month', local(2026, 4, 1)), { viewportWidth: 1200 })).toBe(
      40,
    );
    expect(
      cellWidth('month', viewRange('month', local(2026, 4, 1), 3), {
        viewportWidth: 1200,
        months: 3,
      }),
    ).toBe(38);
    expect(cellWidth('year', viewRange('year', 0), { viewportWidth: 2400 })).toBe(200);
  });

  it('keeps the timeline linear in time', () => {
    const range = viewRange('week', local(2026, 11, 4));
    const scale = pxPerMs('week', range, { viewportWidth: 700 });
    expect((range.end - range.start) * scale).toBeCloseTo(700, 6);
    const day = viewRange('day', local(2026, 11, 4));
    expect(HOUR * pxPerMs('day', day, opts)).toBeCloseTo(100, 6);
  });
});

describe('barBox', () => {
  const range = { start: local(2026, 11, 2), end: local(2026, 11, 9) };
  const scale = 100 / DAY;

  it('positions a bar from the view start', () => {
    expect(barBox(local(2026, 11, 3), local(2026, 11, 4, 12), range, scale)).toEqual({
      left: 100,
      width: 150,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it('clips a bar that runs past the view and flags it', () => {
    const box = barBox(local(2026, 10, 30), local(2026, 11, 3), range, scale)!;
    expect(box.left).toBe(0);
    expect(box.width).toBeCloseTo(100, 6);
    expect(box.clippedStart).toBe(true);
    expect(box.clippedEnd).toBe(false);
  });

  it('gives short bars a minimum width and drops bars outside the view', () => {
    expect(barBox(local(2026, 11, 3), local(2026, 11, 3, 1), range, scale)?.width).toBe(20);
    expect(barBox(local(2026, 11, 9), local(2026, 11, 10), range, scale)).toBeNull();
    expect(barBox(local(2026, 10, 1), local(2026, 11, 2), range, scale)).toBeNull();
  });
});

describe('snapping and drag results', () => {
  const origin = local(2026, 11, 2);

  it('snaps to the nearest step from the origin', () => {
    expect(snapTime(origin + 22 * MINUTE, 15 * MINUTE, origin)).toBe(origin + 15 * MINUTE);
    expect(snapTime(origin + 23 * MINUTE, 15 * MINUTE, origin)).toBe(origin + 30 * MINUTE);
    expect(snapTime(origin + 13 * HOUR, DAY, origin)).toBe(origin + DAY);
  });

  it('uses 15 min / 1 h / 1 h / 1 day by scale', () => {
    expect([snapStep('day'), snapStep('week'), snapStep('month'), snapStep('year')]).toEqual([
      15 * MINUTE,
      HOUR,
      HOUR,
      DAY,
    ]);
  });

  it('move keeps the exact duration and snaps the start', () => {
    const bar = { start: origin + 8 * HOUR + 7 * MINUTE, end: origin + 11 * HOUR + 7 * MINUTE };
    expect(dragResult('move', bar, 2 * HOUR + 20 * MINUTE, HOUR, origin)).toEqual({
      start: origin + 10 * HOUR,
      end: origin + 13 * HOUR,
    });
  });

  it('resizing keeps at least one step', () => {
    const bar = { start: origin + 8 * HOUR, end: origin + 10 * HOUR };
    expect(dragResult('end', bar, -5 * HOUR, HOUR, origin)).toEqual({
      start: bar.start,
      end: origin + 9 * HOUR,
    });
    expect(dragResult('start', bar, 5 * HOUR, HOUR, origin)).toEqual({
      start: origin + 9 * HOUR,
      end: bar.end,
    });
    expect(dragResult('end', bar, 90 * MINUTE, HOUR, origin)).toEqual({
      start: bar.start,
      end: origin + 12 * HOUR,
    });
  });
});

describe('rows', () => {
  it('finds the row under a y offset, clamped', () => {
    expect(rowIndexAt(-10, 44, 5)).toBe(0);
    expect(rowIndexAt(90, 44, 5)).toBe(2);
    expect(rowIndexAt(9999, 44, 5)).toBe(4);
    expect(rowIndexAt(10, 44, 0)).toBe(-1);
  });

  it('drops before or after by the half of the row', () => {
    expect(reorderTarget(50, 44, 5)).toEqual({ index: 1, position: 'before' });
    expect(reorderTarget(70, 44, 5)).toEqual({ index: 1, position: 'after' });
  });
});

describe('autoMonthSpan', () => {
  it('spans the bars and today plus trailing months, capped', () => {
    const now = local(2026, 11, 2);
    expect(autoMonthSpan([local(2026, 9, 15), local(2026, 12, 1)], now)).toEqual({
      start: local(2026, 9, 1),
      months: 4 + 3,
    });
    expect(autoMonthSpan([local(2024, 1, 1)], now, { max: 18 })?.months).toBe(18);
    expect(autoMonthSpan([], now)).toBeNull();
  });
});

describe('labels and helpers', () => {
  it('formats period labels in Turkish', () => {
    expect(periodLabel('month', local(2026, 11, 4))).toBe('Kasım 2026');
    expect(periodLabel('week', local(2026, 11, 4))).toBe('2-8 Kas');
    expect(periodLabel('week', local(2026, 12, 1))).toBe('30 Kas - 6 Ara');
    expect(periodLabel('month', local(2026, 8, 4), 5)).toBe('Ağu – Ara 2026');
    expect(periodLabel('month', local(2026, 11, 4), 3)).toBe('Kas 2026 – Oca 2027');
    expect(periodLabel('year', local(2026, 11, 4))).toBe('2026');
  });

  it('counts days and finds Mondays across month ends', () => {
    expect(dayCount({ start: local(2026, 2, 1), end: local(2026, 3, 1) })).toBe(28);
    expect(startOfWeek(local(2026, 3, 1))).toBe(local(2026, 2, 23));
    expect(addDays(local(2026, 12, 31), 1)).toBe(local(2027, 1, 1));
  });
});
