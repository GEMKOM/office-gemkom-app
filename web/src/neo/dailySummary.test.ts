import { istanbulDate } from '@/neo/dailySummaryRender';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailySummary, getLatestDailySummary, type DailySummaryDetail } from '@/api/assistant';
import {
  noteSummaryRead,
  runDailySummaryCheck,
  snoozeSummary,
  SHOWN_KEY,
  CHECK_TTL_MS,
  liteOf,
} from './dailySummary';
import { bindNeoUser, getNeoState, resetNeoStore, setUnreadSummary } from './neoStore';

vi.mock('@/api/assistant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/assistant')>()),
  getLatestDailySummary: vi.fn(),
  getDailySummary: vi.fn(),
}));
vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const latest = vi.mocked(getLatestDailySummary);
const detail = vi.mocked(getDailySummary);

const UID = 7;
const row = (patch: Partial<DailySummaryDetail> = {}): DailySummaryDetail => ({
  id: 61,
  summary_date: istanbulDate(),
  status: 'ok',
  is_read: false,
  generated_at: '2026-11-03T05:20:00Z',
  ...patch,
});

const open = { uid: UID, quiet: false, firstPage: true, dialogOpen: () => false };

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  resetNeoStore();
  bindNeoUser(UID);
  latest.mockReset();
  detail.mockReset();
});

describe('the morning check', () => {
  it('opens the popup on the first page of the visit for an unread summary', async () => {
    latest.mockResolvedValue(row());
    const onDetail = vi.fn();
    await runDailySummaryCheck({ ...open, onDetail });
    expect(getNeoState().summaryPrompt).toEqual({
      kind: 'modal',
      summary: { id: 61, summary_date: istanbulDate(), generated_at: '2026-11-03T05:20:00Z' },
    });
    expect(getNeoState().unreadSummary?.id).toBe(61);
    expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 61 }));
  });

  it('shows a banner instead on any later load, and not again after two snoozes', async () => {
    latest.mockResolvedValue(row());
    await runDailySummaryCheck({ ...open, firstPage: false });
    expect(getNeoState().summaryPrompt?.kind).toBe('banner');

    snoozeSummary(UID, liteOf(row()));
    expect(getNeoState().summaryPrompt).toBeNull();
    expect(getNeoState().unreadSummary?.id).toBe(61); // the dot stays

    localStorage.removeItem(`ds:check:${UID}`);
    await runDailySummaryCheck({ ...open, firstPage: false });
    expect(getNeoState().summaryPrompt?.kind).toBe('banner');
    snoozeSummary(UID, liteOf(row()));

    localStorage.removeItem(`ds:check:${UID}`);
    await runDailySummaryCheck({ ...open, firstPage: false });
    expect(getNeoState().summaryPrompt).toBeNull();
    expect(getNeoState().unreadSummary?.id).toBe(61);
  });

  it('after one snooze today the popup is gone for the first page too (banner instead)', async () => {
    latest.mockResolvedValue(row());
    snoozeSummary(UID, liteOf(row()));
    await runDailySummaryCheck(open);
    expect(getNeoState().summaryPrompt?.kind).toBe('banner');
  });

  it('opens the popup once per tab session', async () => {
    latest.mockResolvedValue(row());
    sessionStorage.setItem(SHOWN_KEY, '61');
    await runDailySummaryCheck(open);
    expect(getNeoState().summaryPrompt?.kind).toBe('banner');
  });

  it('only raises the dot when a deep link owns the screen', async () => {
    latest.mockResolvedValue(row());
    await runDailySummaryCheck({ ...open, quiet: true });
    expect(getNeoState().summaryPrompt).toBeNull();
    expect(getNeoState().unreadSummary?.id).toBe(61);
  });

  it('shows nothing for a summary the server says is read, and remembers it', async () => {
    latest.mockResolvedValue(row({ is_read: true }));
    await runDailySummaryCheck(open);
    expect(getNeoState().summaryPrompt).toBeNull();
    expect(getNeoState().unreadSummary).toBeNull();
    latest.mockClear();
    // Within 30 minutes the cached "nothing unread" answers without a GET.
    await runDailySummaryCheck(open);
    expect(latest).not.toHaveBeenCalled();
  });

  it('shows nothing for a summary older than three days or without one', async () => {
    latest.mockResolvedValue(row({ summary_date: '2020-01-01' }));
    await runDailySummaryCheck(open);
    expect(getNeoState().unreadSummary).toBeNull();

    localStorage.clear();
    latest.mockResolvedValue(null);
    await runDailySummaryCheck(open);
    expect(getNeoState().summaryPrompt).toBeNull();
  });

  it('asks again after the 30-minute throttle, and reuses the cached candidate before it', async () => {
    latest.mockResolvedValue(row());
    detail.mockResolvedValue(row());
    await runDailySummaryCheck({ ...open, firstPage: false });
    expect(latest).toHaveBeenCalledTimes(1);

    // A later page: no second GET, the banner comes from the cache.
    const store = getNeoState();
    expect(store.summaryPrompt?.kind).toBe('banner');
    setUnreadSummary(null);
    await runDailySummaryCheck({ ...open, firstPage: false });
    expect(latest).toHaveBeenCalledTimes(1);
    expect(getNeoState().unreadSummary?.id).toBe(61);

    const record = JSON.parse(localStorage.getItem(`ds:check:${UID}`)!) as { at: number };
    localStorage.setItem(
      `ds:check:${UID}`,
      JSON.stringify({ ...record, at: Date.now() - CHECK_TTL_MS - 1 }),
    );
    await runDailySummaryCheck({ ...open, firstPage: false });
    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('does not stack on another dialog, and tries again next time', async () => {
    latest.mockResolvedValue(row());
    await runDailySummaryCheck({ ...open, dialogOpen: () => true });
    expect(getNeoState().summaryPrompt).toBeNull();
    expect(localStorage.getItem(`ds:check:${UID}`)).toBeNull();
  });

  it('swallows API failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    latest.mockRejectedValue(new Error('boom'));
    await expect(runDailySummaryCheck(open)).resolves.toBeUndefined();
    expect(getNeoState().summaryPrompt).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('reading', () => {
  it('clears the dot, the prompt and the cached candidate; the next check is quiet', async () => {
    latest.mockResolvedValue(row());
    await runDailySummaryCheck({ ...open, firstPage: false });
    noteSummaryRead(UID, row(), { latest: true });
    expect(getNeoState().unreadSummary).toBeNull();
    expect(getNeoState().summaryPrompt).toBeNull();
    latest.mockClear();
    await runDailySummaryCheck(open);
    expect(latest).not.toHaveBeenCalled();
    expect(getNeoState().summaryPrompt).toBeNull();
  });

  it('leaves the dot alone when an older summary is read', () => {
    setUnreadSummary(liteOf(row({ id: 61 })));
    noteSummaryRead(UID, row({ id: 50 }), { latest: false });
    expect(getNeoState().unreadSummary?.id).toBe(61);
  });
});
