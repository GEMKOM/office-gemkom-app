import { hasRouteAccess } from '@/auth/accessControl';
import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { FinishedTimersPage } from './FinishedTimersPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/accessControl', () => ({ hasRouteAccess: vi.fn() }));

const fetchMock = vi.mocked(authedFetch);
const accessMock = vi.mocked(hasRouteAccess);

const CNC = '/manufacturing/cnc-cutting/reports/finished-timers';
const MACHINING = '/manufacturing/machining/reports/finished-timers';

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const timerPaths = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname.endsWith('/timers/'));

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/reports/finished-timers/') {
  return renderWithProviders(
    <ModalsProvider>
      <FinishedTimersPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/timers/')) return json({ count: 0, next: null, previous: null, results: [] });
    if (path === '/machines/') return json({ count: 0, next: null, previous: null, results: [] });
    return json([]);
  });
  accessMock.mockReset();
});

it('shows a user only the shops whose old page they can open, without a switch', async () => {
  accessMock.mockImplementation((route: string) => route === CNC);
  // Asking for machining does not get around the CNC-only grant.
  renderPage('/manufacturing/reports/finished-timers/?module=machining');

  await waitFor(() => expect(timerPaths().length).toBeGreaterThan(0));
  expect(timerPaths().every((u) => u.pathname === '/cnc_cutting/timers/')).toBe(true);
  expect(screen.getByLabelText('Nesting ID')).toBeInTheDocument();
  expect(screen.queryByRole('radiogroup', { name: 'Rapor görünümü' })).not.toBeInTheDocument();
});

it('switches shops, keeping the user and dates and dropping the shop filters', async () => {
  accessMock.mockImplementation((route: string) => route === CNC || route === MACHINING);
  renderPage(
    '/manufacturing/reports/finished-timers/?user=ali&issue_key=TI-1&start_date=2026-10-01&finish_date=2026-10-31',
  );

  await waitFor(() =>
    expect(timerPaths().some((u) => u.pathname === '/machining/timers/')).toBe(true),
  );
  expect(screen.getByLabelText('TI No')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('radio', { name: 'CNC Kesim' }));
  await waitFor(() =>
    expect(timerPaths().some((u) => u.pathname === '/cnc_cutting/timers/')).toBe(true),
  );
  const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
  expect(Object.fromEntries(search)).toEqual({
    user: 'ali',
    start_date: '2026-10-01',
    finish_date: '2026-10-31',
    module: 'cnc_cutting',
  });
  const params = timerPaths().at(-1)!.searchParams;
  expect(params.get('user')).toBe('ali');
  expect(params.has('issue_key')).toBe(false);
  expect(screen.getByLabelText('Nesting ID')).toBeInTheDocument();
});
