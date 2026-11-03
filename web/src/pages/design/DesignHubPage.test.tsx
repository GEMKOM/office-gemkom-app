import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { DesignHubPage } from './DesignHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: () => true }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'dizayn' } }),
}));

const fetchMock = vi.mocked(authedFetch);
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

const RELEASES = [
  {
    id: 3,
    job_order_no: '265-11',
    job_order_title: 'Kule Vinç Şasesi',
    revision_code: 'B',
    released_by_name: 'Elif',
    approval_state: { approval_count: 1, required_count: 2 },
    released_at: '2026-11-01T08:00:00Z',
    can_approve: true,
  },
  { id: 4, job_order_no: '265-12', job_order_title: 'Platform', can_approve: false },
];

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    const releases = pathname.includes('drawing-releases');
    const count = releases ? 2 : searchParams.has('has_pending_revision') ? 5 : 3;
    const results = releases && !searchParams.has('page_size') ? RELEASES : [];
    return Promise.resolve(
      new Response(JSON.stringify({ count, next: null, previous: null, results })),
    );
  });
});

it("counts pending revision requests and release reviews with the legacy pages' filters", async () => {
  renderWithProviders(<DesignHubPage />, { route: '/design/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Projeler',
    'Revizyon Talepleri',
    'Çizim İncelemesi',
  ]);
  await waitFor(() => expect(document.getElementById('pending-revisions')).toHaveTextContent('5'));
  expect(document.getElementById('pending-releases')).toHaveTextContent('2');

  const urls = calls().map((u) => `${u.pathname}${u.search}`);
  expect(urls).toContain(
    '/projects/department-tasks/?department=design&has_pending_revision=true&page_size=1',
  );
  expect(urls).toContain('/projects/drawing-releases/pending_approvals/?page_size=1');
});

it('lists the releases waiting on the user, and counts only those on the band', async () => {
  renderWithProviders(<DesignHubPage />, { route: '/design/' });

  await waitFor(() => expect(document.getElementById('my-reviews')).toHaveTextContent('1'));
  const panel = screen
    .getByRole('heading', { name: 'İncelemenizi Bekleyen Çizimler' })
    .closest('section')!;
  const row = await within(panel).findByRole('link', { name: /265-11/ });
  expect(row).toHaveAttribute('href', '/design/release-approvals?release_id=3');
  expect(row).toHaveTextContent('Rev. B · Elif');
  expect(row).toHaveTextContent('1/2 onay');
  expect(within(panel).queryByText('265-12')).not.toBeInTheDocument();

  // Design's own tasks, as the Projeler page lists them.
  const tasks = calls().filter(
    (url) =>
      url.pathname === '/projects/department-tasks/' &&
      url.searchParams.get('main_only') === 'true',
  );
  expect(tasks.length).toBeGreaterThan(0);
  expect(tasks.every((url) => url.searchParams.get('department') === 'design')).toBe(true);
});
