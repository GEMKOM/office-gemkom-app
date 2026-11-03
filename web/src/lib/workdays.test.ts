import { addDaysIso, createWorkdayCalendar } from './workdays';

describe('createWorkdayCalendar', () => {
  // 2026-10-29 (Thu) is Cumhuriyet Bayramı, 2026-10-28 its half-day Arife.
  const cal = createWorkdayCalendar([
    { date: '2026-10-28', is_half_day: true },
    { date: '2026-10-29', is_half_day: false },
  ]);

  it('weighs weekends, holidays and half days', () => {
    expect(cal.dayValue('2026-10-24')).toBe(0); // Saturday
    expect(cal.dayValue('2026-10-28')).toBe(0.5);
    expect(cal.dayValue('2026-10-29')).toBe(0);
    expect(cal.dayValue('2026-10-30')).toBe(1);
    expect(cal.isNonWorkingDay('2026-10-29')).toBe(true);
    expect(cal.isNonWorkingDay('2026-10-28')).toBe(false);
  });

  it('counts a closed interval', () => {
    expect(cal.workingDaysInclusive('2026-10-26', '2026-10-30')).toBe(3.5);
    expect(cal.workingDaysInclusive('2026-10-30', '2026-10-26')).toBeNull();
    expect(cal.workingDaysInclusive(null, '2026-10-26')).toBeNull();
  });

  it('spans forward and backward, the boundary day counting', () => {
    expect(cal.spanEnd('2026-10-26', 1)).toBe('2026-10-26');
    expect(cal.spanEnd('2026-10-26', 3.5)).toBe('2026-10-30');
    // A weekend start rolls forward to the first working day.
    expect(cal.spanEnd('2026-10-24', 1)).toBe('2026-10-26');
    expect(cal.spanStart('2026-10-30', 3.5)).toBe('2026-10-26');
    expect(cal.spanEnd('2026-10-26', 0)).toBe('2026-10-26');
  });

  it('adds calendar days without UTC drift', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });
});
