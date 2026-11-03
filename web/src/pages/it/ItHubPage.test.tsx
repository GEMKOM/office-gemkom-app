import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ItHubPage } from './ItHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, username: 'bt' }, isAdmin: auth.isAdmin }),
}));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

beforeEach(() => {
  auth.isAdmin = true;
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname } = new URL(String(url));
    let body: unknown = { count: 0, next: null, previous: null, results: [] };
    if (pathname === '/users/forgot-password/list/')
      body = [
        { id: 7, username: 'ayse' },
        { id: 8, username: 'mehmet' },
      ];
    else if (pathname === '/feedback/reports/stats/')
      body = {
        open_total: 9,
        awaiting_decision: 3,
        in_pipeline: 2,
        done_30d: 11,
        ai_cost_30d: 1.2,
        by_status: { new: 4 },
      };
    else if (pathname === '/feedback/reports/')
      body = [
        {
          id: 51,
          created_at: '2026-11-02T10:00:00Z',
          reporter_name: 'Can',
          kind: 'bug',
          title: 'Rapor açılmıyor',
          priority: 'high',
          status: 'new',
        },
      ];
    else if (pathname === '/assistant/analytics/summary/')
      body = { questions: 128, active_users: 14 };
    else if (pathname === '/machines/')
      body = { count: 63, next: null, previous: null, results: [] };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
});

it('shows what waits on IT and the new feedback, each linking to its list', async () => {
  renderWithProviders(<ItHubPage />, { route: '/it/' });

  await waitFor(() => expect(document.getElementById('password-resets')).toHaveTextContent('2'));
  await waitFor(() => expect(document.getElementById('feedback-new')).toHaveTextContent('4'));
  expect(document.getElementById('feedback-awaiting')).toHaveTextContent('3');
  await waitFor(() => expect(document.getElementById('neo-questions')).toHaveTextContent('128'));
  expect(within(document.getElementById('neo-questions')!).getByRole('link')).toHaveAttribute(
    'href',
    '/it/neo?days=7',
  );
  const neo = calls().find((url) => url.pathname === '/assistant/analytics/summary/')!;
  expect(neo.searchParams.get('days')).toBe('7');

  const fresh = screen.getByRole('heading', { name: 'Yeni Geri Bildirimler' }).closest('section')!;
  const row = await within(fresh).findByRole('link', { name: /Rapor açılmıyor/ });
  expect(row).toHaveTextContent('Hata · Can');
  expect(row).toHaveTextContent('Yüksek');
  const list = calls().find((url) => url.pathname === '/feedback/reports/')!;
  expect(list.searchParams.get('status')).toBe('new');

  const card = screen.getByRole('heading', { level: 3, name: 'Envanter' }).closest('article')!;
  await waitFor(() => expect(card).toHaveTextContent('63 cihaz'));
});

it('asks for the reset requests only for staff', async () => {
  auth.isAdmin = false;
  renderWithProviders(<ItHubPage />, { route: '/it/' });

  await waitFor(() => expect(document.getElementById('feedback-new')).toHaveTextContent('4'));
  expect(document.getElementById('password-resets')).toBeNull();
  expect(calls().some((url) => url.pathname === '/users/forgot-password/list/')).toBe(false);
});
