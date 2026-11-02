import { ApiError } from '../client';
import {
  canCancelOvertime,
  canResubmitOvertime,
  formatOvertimeDuration,
  overtimeSaveErrorMessage,
  validateOvertimeRequest,
} from './overtime';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

it('formats durations like legacy', () => {
  expect(formatOvertimeDuration(0)).toBe('0 saat');
  expect(formatOvertimeDuration(null)).toBe('0 saat');
  expect(formatOvertimeDuration('2')).toBe('2 saat');
  expect(formatOvertimeDuration(2.5)).toBe('2 saat 30 dakika');
});

it('cancel / resubmit are for the requester only', () => {
  expect(canCancelOvertime({ id: 1, status: 'submitted', requester: 3 }, 3)).toBe(true);
  expect(canCancelOvertime({ id: 1, status: 'submitted', requester: 3 }, 4)).toBe(false);
  expect(canCancelOvertime({ id: 1, status: 'approved', requester: 3 }, 3)).toBe(false);
  expect(canResubmitOvertime({ id: 1, status: 'rejected', requester: 3 }, 3)).toBe(true);
  expect(canResubmitOvertime({ id: 1, status: 'cancelled', requester: 3 }, 3)).toBe(true);
  expect(canResubmitOvertime({ id: 1, status: 'submitted', requester: 3 }, 3)).toBe(false);
});

it('validates the request window and the entries', () => {
  const now = new Date('2026-11-02T12:00:00Z');
  expect(
    validateOvertimeRequest(
      {
        start_at: '2026-11-03T18:00:00Z',
        end_at: '2026-11-03T15:00:00Z',
        entries: [{ user: 0, job_no: ' ', description: '', operations: [] }],
      },
      now,
    ),
  ).toEqual([
    'Bitiş zamanı başlangıç zamanından sonra olmalıdır',
    'Katılımcı 1: Kullanıcı seçimi gereklidir',
    'Katılımcı 1: İş numarası gereklidir',
  ]);
  expect(
    validateOvertimeRequest(
      { start_at: '2026-11-01T18:00:00Z', end_at: '2026-11-01T20:00:00Z', entries: [] },
      now,
    ),
  ).toEqual(['En az 1 katılımcı eklemelisiniz', 'Başlangıç zamanı geçmiş bir tarih olamaz']);
});

it('save errors read errors / error / detail or a bare list', () => {
  const fallback = 'Mesai talebi oluşturulurken hata oluştu.';
  expect(overtimeSaveErrorMessage(new ApiError(400, ['A', 'B'], 'A'), fallback)).toBe('A, B');
  expect(overtimeSaveErrorMessage(new ApiError(400, { errors: ['Çakışma'] }, 'x'), fallback)).toBe(
    'Çakışma',
  );
  expect(
    overtimeSaveErrorMessage(new ApiError(400, { detail: 'Yetki yok' }, 'Yetki yok'), fallback),
  ).toBe('Yetki yok');
  expect(
    overtimeSaveErrorMessage(
      new ApiError(400, { entries: ['Hatalı'] }, 'entries: Hatalı'),
      fallback,
    ),
  ).toBe('entries: Hatalı');
  expect(overtimeSaveErrorMessage(new ApiError(500, undefined, 'HTTP 500'), fallback)).toBe(
    fallback,
  );
});
