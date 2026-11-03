import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { LogisticsHubPage } from './LogisticsHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'lojistik' } }),
}));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);
const page = (count: number, results: unknown[] = []) => ({
  count,
  next: null,
  previous: null,
  results,
});
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

const JOBS = [
  {
    job_no: '254-03',
    title: 'Döküm Hattı',
    customer_short_name: 'Acme',
    status: 'active',
    completion_percentage: 72.4,
    target_completion_date: '2020-01-10',
  },
  {
    job_no: '265-04',
    title: 'Konveyör Hattı',
    customer_name: 'Beta',
    status: 'on_hold',
    target_completion_date: '2099-03-01',
  },
];

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/projects/job-orders/') return json(page(40, JOBS));
    if (pathname === '/projects/job-orders/shipping_pending/') return json(page(3));
    if (pathname === '/projects/department-tasks/') {
      if (searchParams.has('assigned_to')) return json(page(2));
      if (searchParams.has('target_completion_date__lte')) return json(page(1));
      return json(page(11));
    }
    return json(page(0));
  });
});

it('lists the open job orders by termin, overdue first, not the tasks that carry a target date', async () => {
  renderWithProviders(<LogisticsHubPage />, { route: '/logistics/' });

  const deadlines = screen.getByRole('heading', { name: 'Teslim Sırası' }).closest('section')!;
  const late = await within(deadlines).findByRole('link', { name: /254-03/ });
  expect(late).toHaveAttribute('href', '/projects/project-tracking?job_no=254-03');
  expect(late).toHaveTextContent('%72');
  // Past its termin: the date shows in red.
  expect(late.querySelector('[data-alert]')).not.toBeNull();
  const later = within(deadlines).getByRole('link', { name: /265-04/ });
  expect(later).toHaveTextContent('Beklemede');
  expect(later.querySelector('[data-alert]')).toBeNull();
  expect(within(deadlines).getByRole('link', { name: /Tümü/ })).toHaveAttribute(
    'href',
    '/projects/project-tracking?status=active&status=on_hold&ordering=target_completion_date',
  );

  // The termin is the job order's: soonest first, open jobs only, a few rows.
  const list = calls().find(
    (url) => url.pathname === '/projects/job-orders/' && url.searchParams.has('ordering'),
  )!;
  expect(list.searchParams.get('ordering')).toBe('target_completion_date');
  expect(list.searchParams.get('status__in')).toBe('active,on_hold');
  expect(list.searchParams.get('root_only')).toBe('true');
  expect(list.searchParams.get('page_size')).toBe('8');
  // No list of tasks is requested for it.
  expect(
    calls().some(
      (url) =>
        url.pathname === '/projects/department-tasks/' && url.searchParams.get('page_size') !== '1',
    ),
  ).toBe(false);
});

it('without Proje Takibi the rows stay plain and Tümü opens the logistics tasks', async () => {
  granted.routes = new Set(['/logistics/projects']);
  renderWithProviders(<LogisticsHubPage />, { route: '/logistics/' });

  const deadlines = screen.getByRole('heading', { name: 'Teslim Sırası' }).closest('section')!;
  await waitFor(() => expect(within(deadlines).getByText('Döküm Hattı')).toBeInTheDocument());
  expect(within(deadlines).queryByRole('link', { name: /254-03/ })).not.toBeInTheDocument();
  expect(within(deadlines).getByRole('link', { name: /Tümü/ })).toHaveAttribute(
    'href',
    '/logistics/projects',
  );
});
