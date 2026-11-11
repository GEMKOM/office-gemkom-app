import type { Occasion } from '@/api/general/specialDays';
import {
  cachedTheme,
  cacheTheme,
  hasSeen,
  markSeen,
  markSeenInPreview,
  occasionIcon,
  pendingWelcomes,
  personDayLabel,
  resetPreviewSeen,
} from './occasionModel';

const occasion = (key: string, extra: Partial<Occasion> = {}): Occasion => ({
  key,
  kind: 'public_holiday',
  theme: 'national',
  name: 'Cumhuriyet Bayramı',
  title: 'Cumhuriyet Bayramı kutlu olsun',
  body: '',
  show_popup: true,
  years: null,
  is_half_day: false,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

it('shows each welcome once per user, and keeps other users apart', () => {
  const days = [
    occasion('birthday:2026', { kind: 'birthday', theme: 'birthday' }),
    occasion('holiday:cumhuriyet-bayrami:2026'),
  ];
  expect(pendingWelcomes(7, days).map((o) => o.key)).toEqual([
    'birthday:2026',
    'holiday:cumhuriyet-bayrami:2026',
  ]);

  markSeen(7, 'birthday:2026');
  expect(pendingWelcomes(7, days).map((o) => o.key)).toEqual(['holiday:cumhuriyet-bayrami:2026']);
  expect(hasSeen(8, 'birthday:2026')).toBe(false);
});

it('skips occasions without a popup, those closed in the tab, and uses the tab list in a preview', () => {
  markSeen(7, 'special:3:2026');
  const days = [
    occasion('special:3:2026', { kind: 'special_day' }),
    occasion('x:2026', { show_popup: false }),
    occasion('y:2026'),
  ];
  expect(pendingWelcomes(7, days, new Set(['y:2026']))).toEqual([]);
  expect(pendingWelcomes(7, days, new Set(), { preview: '2026-10-28' }).map((o) => o.key)).toEqual([
    'special:3:2026',
    'y:2026',
  ]);
});

it('drops keys older than last year when it writes', () => {
  markSeen(7, 'birthday:2023', new Date(2023, 5, 1));
  markSeen(7, 'birthday:2025', new Date(2025, 5, 1));
  markSeen(7, 'birthday:2026', new Date(2026, 5, 1));
  expect(JSON.parse(localStorage.getItem('gk.occasion.seen')!)).toEqual({
    7: ['birthday:2025', 'birthday:2026'],
  });
});

it('labels and icons', () => {
  expect(personDayLabel('birthday', null)).toBe('Doğum günü');
  expect(personDayLabel('work_anniversary', 10)).toBe('10. yıl');
  expect(occasionIcon('public_holiday', 'national')).toBe('fas fa-star-and-crescent');
  expect(occasionIcon('public_holiday', 'religious')).toBe('fas fa-moon');
  expect(occasionIcon('work_anniversary', 'anniversary')).toBe('fas fa-award');
});

it("remembers today's theme for the next page load, and only for today", () => {
  const today = new Date(2026, 10, 11, 9);
  cacheTheme('birthday', today);
  expect(cachedTheme(today)).toBe('birthday');
  expect(cachedTheme(new Date(2026, 10, 12, 9))).toBeNull();
  cacheTheme(null, today);
  expect(cachedTheme(today)).toBeNull();
});

it('remembers welcomes closed in a preview for the tab, until that day is previewed again', () => {
  const days = [occasion('holiday:cumhuriyet-bayrami:2026')];
  markSeenInPreview('2026-10-28', 'holiday:cumhuriyet-bayrami:2026');
  expect(pendingWelcomes(7, days, new Set(), { preview: '2026-10-28' })).toEqual([]);
  expect(pendingWelcomes(7, days, new Set(), { preview: '2026-10-29' })).toHaveLength(1);
  expect(pendingWelcomes(7, days)).toHaveLength(1);
  resetPreviewSeen('2026-10-28');
  expect(pendingWelcomes(7, days, new Set(), { preview: '2026-10-28' })).toHaveLength(1);
});
