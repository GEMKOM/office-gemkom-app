import { ApiError } from '@/api/client';
import { attendanceModel, isOffNetwork } from './attendance';

describe('attendanceModel', () => {
  it('treats no record as not checked in', () => {
    expect(attendanceModel(null).state).toBe('not_checked_in');
    expect(attendanceModel({}).state).toBe('not_checked_in');
  });

  it('shows the check-in time while active, the check-out time when complete', () => {
    const active = attendanceModel({ status: 'active', first_check_in: '2026-10-30T05:42:00Z' });
    expect(active).toMatchObject({ state: 'active', tone: 'green' });
    expect(active.short).toMatch(/^Giriş \d{2}:\d{2}$/);

    const complete = attendanceModel({
      status: 'complete',
      sessions: [{ check_in_time: '2026-10-30T05:42:00Z', check_out_time: '2026-10-30T14:30:00Z' }],
    });
    expect(complete).toMatchObject({ state: 'complete', tone: 'blue' });
    expect(complete.short).toMatch(/^Çıkış \d{2}:\d{2}$/);
  });

  it("prefers the backend's wording and flags HR states", () => {
    expect(attendanceModel({ status: 'pending_override', status_display: 'İK onayında' })).toMatchObject({
      label: 'İK onayında',
      tone: 'yellow',
    });
    expect(attendanceModel({ status: 'override_rejected' }).tone).toBe('red');
  });

  it('recognises the off-network refusal', () => {
    expect(isOffNetwork(new ApiError(403, { reason: 'not_on_office_network' }, 'x'))).toBe(true);
    expect(isOffNetwork(new ApiError(403, { reason: 'other' }, 'x'))).toBe(false);
    expect(isOffNetwork(new Error('x'))).toBe(false);
  });
});
