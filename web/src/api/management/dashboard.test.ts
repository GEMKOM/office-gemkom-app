import { authedFetch } from '@/auth/authService';
import { fetchSlowTier, getLatestDailySummary, getReportsDashboard } from './dashboard';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

beforeEach(() => fetchMock.mockReset());
afterEach(() => vi.useRealTimers());

it('sends block and refresh as the legacy API did', async () => {
  fetchMock.mockImplementation(() => json({ sections: {} }));
  await getReportsDashboard();
  await getReportsDashboard({ block: 'live' });
  await getReportsDashboard({ refresh: true });
  expect(urls().map((u) => `${u.pathname}${u.search}`)).toEqual([
    '/reports/dashboard/',
    '/reports/dashboard/?block=live',
    '/reports/dashboard/?refresh=1',
  ]);
});

it('retries the slow tier every 5 s while it builds, refresh only on the first try', async () => {
  vi.useFakeTimers();
  fetchMock
    .mockImplementationOnce(() => json({ status: 'building' }, 202))
    .mockImplementationOnce(() => json({ status: 'building' }, 202))
    .mockImplementationOnce(() => json({ sections: { exceptions: { rows: [] } } }));
  const result = fetchSlowTier({ refresh: true });
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(result).resolves.toEqual({
    status: 'done',
    data: { sections: { exceptions: { rows: [] } } },
  });
  expect(urls().map((u) => u.search)).toEqual([
    '?block=slow&refresh=1',
    '?block=slow',
    '?block=slow',
  ]);
});

it('gives up after six building answers', async () => {
  vi.useFakeTimers();
  fetchMock.mockImplementation(() => json({ status: 'building' }, 202));
  const result = fetchSlowTier();
  await vi.advanceTimersByTimeAsync(30_000);
  await expect(result).resolves.toEqual({ status: 'unavailable' });
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

it('reads the latest daily summary; 403 is "nothing to show"', async () => {
  fetchMock.mockImplementationOnce(() =>
    json({ summary: { id: 3, summary_date: '2026-11-02', status: 'ok' } }),
  );
  await expect(getLatestDailySummary()).resolves.toMatchObject({ id: 3 });
  fetchMock.mockImplementationOnce(() => json({ detail: 'yasak' }, 403));
  await expect(getLatestDailySummary()).resolves.toBeNull();
});
