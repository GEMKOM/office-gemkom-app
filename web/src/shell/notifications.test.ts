import { groupByDay, sortUnreadFirst, timeAgo, type AppNotification } from './notifications';

const n = (id: number, created_at: string | null, is_read = false): AppNotification => ({ id, created_at, is_read });

describe('groupByDay', () => {
  // Local dates, so the cases hold in any time zone.
  const now = new Date(2026, 10, 3, 12, 0);
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

  it('splits into today, yesterday and earlier, newest first, without empty groups', () => {
    const groups = groupByDay(
      [n(1, at(3, 8)), n(2, at(2, 22)), n(3, at(3, 11)), n(4, at(1, 9)), n(5, at(2, 1)), n(6, null)],
      now,
    );
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ['today', 'Bugün', [3, 1]],
      ['yesterday', 'Dün', [2, 5]],
      ['earlier', 'Daha önce', [4, 6]],
    ]);
    expect(groupByDay([n(1, at(1, 9))], now).map((g) => g.key)).toEqual(['earlier']);
    expect(groupByDay([], now)).toEqual([]);
  });

  it('counts midnight as the start of today', () => {
    const groups = groupByDay([n(1, at(3, 0, 0)), n(2, at(2, 23, 59))], now);
    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday']);
  });
});

describe('sortUnreadFirst', () => {
  it('puts unread first, newest first within each group', () => {
    const list = [n(1, '2026-01-02T00:00:00Z', true), n(2, '2026-01-01T00:00:00Z'), n(3, '2026-01-03T00:00:00Z')];
    expect(sortUnreadFirst(list).map((i) => i.id)).toEqual([3, 2, 1]);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  it('counts minutes, hours and days, then falls back to a short date', () => {
    expect(timeAgo('2026-11-03T11:59:40Z', now)).toBe('Az önce');
    expect(timeAgo('2026-11-03T11:56:00Z', now)).toBe('4 dakika önce');
    expect(timeAgo('2026-11-03T09:00:00Z', now)).toBe('3 saat önce');
    expect(timeAgo('2026-10-31T12:00:00Z', now)).toBe('3 gün önce');
    expect(timeAgo(null, now)).toBe('-');
  });
});
