import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProjectsHubPage } from './ProjectsHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));
const page = (count: number, results: unknown[] = []) => ({
  count,
  next: null,
  previous: null,
  results,
});
const STATUS: Record<string, number> = { draft: 2, active: 37, on_hold: 4 };

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    let body: unknown = page(0);
    if (pathname === '/projects/job-orders/') {
      if (searchParams.get('page_size') === '6')
        body = page(1, [
          {
            job_no: '254-03',
            title: 'Döküm Hattı',
            customer_short_name: 'Acme',
            status: 'active',
            completion_percentage: 72.4,
            target_completion_date: '2026-10-15',
          },
        ]);
      else if (searchParams.has('target_completion_date__lte')) body = page(6);
      else body = page(STATUS[searchParams.get('status')!] ?? 0);
    } else if (pathname === '/estimator/reference-profiles/summary/') {
      body = { counts: { total: 40, review_status: { unreviewed: 9, verified: 31 } } };
    }
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
});

it('counts top-level job orders by status and the late ones, each linking to Proje Takibi', async () => {
  renderWithProviders(<ProjectsHubPage />, { route: '/projects/' });

  await waitFor(() => expect(document.getElementById('jobs-active')).toHaveTextContent('37'));
  expect(document.getElementById('jobs-late')).toHaveTextContent('6');
  expect(document.getElementById('jobs-on-hold')).toHaveTextContent('4');
  await waitFor(() =>
    expect(document.getElementById('references-unreviewed')).toHaveTextContent('9'),
  );
  expect(within(document.getElementById('jobs-on-hold')!).getByRole('link')).toHaveAttribute(
    'href',
    '/projects/project-tracking?status=on_hold',
  );
  // As Proje Takibi counts them: top-level jobs only.
  const jobs = calls().filter((url) => url.pathname === '/projects/job-orders/');
  expect(jobs.every((url) => url.searchParams.get('root_only') === 'true')).toBe(true);

  const late = screen
    .getByRole('heading', { name: 'Hedef Tarihi Geçen İş Emirleri' })
    .closest('section')!;
  const row = await within(late).findByRole('link', { name: /254-03/ });
  expect(row).toHaveAttribute('href', '/projects/project-tracking?job_no=254-03');
  expect(row).toHaveTextContent('%72');
  const list = jobs.find((url) => url.searchParams.get('page_size') === '6')!;
  expect(list.searchParams.get('status__in')).toBe('active,on_hold');
  expect(list.searchParams.get('ordering')).toBe('target_completion_date');
});

it('fetches nothing for Proje Takibi without access to it', async () => {
  granted.routes = new Set(['/projects/references']);
  renderWithProviders(<ProjectsHubPage />, { route: '/projects/' });

  await waitFor(() =>
    expect(document.getElementById('references-unreviewed')).toHaveTextContent('9'),
  );
  expect(new Set(calls().map((url) => url.pathname))).toEqual(
    new Set(['/estimator/reference-profiles/summary/']),
  );
  expect(screen.queryByRole('heading', { name: 'İş Emirleri' })).not.toBeInTheDocument();
});
