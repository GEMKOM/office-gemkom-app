import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { IsgHubPage } from './IsgHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: () => true }));

const fetchMock = vi.mocked(authedFetch);

const SUMMARY = {
  total: 30,
  open: 7,
  in_progress: 4,
  resolved: 1,
  closed: 18,
  overdue: 2,
  critical_open: 5,
  mine_open: 3,
};

const MY_ISSUES = [
  {
    id: 9,
    issue_number: 'ISG-2026-009',
    title: 'Korkuluk eksik',
    location: 'Hol 2',
    category_display: 'Yüksekte Çalışma',
    severity: 'critical',
    status: 'open',
    due_date: '2026-10-30',
    is_overdue: true,
  },
];

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) =>
    new URL(String(url)).pathname === '/isg/issues/summary/'
      ? json(SUMMARY)
      : json({ count: 1, next: null, previous: null, results: MY_ISSUES }),
  );
});

it('shows the assigned, overdue, critical and open counters from one summary request, each linking to its list', async () => {
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  expect(
    screen.getByRole('heading', { level: 1, name: 'İş Sağlığı ve Güvenliği' }),
  ).toBeInTheDocument();
  // Open as the list counts it: open, in progress and resolved.
  await waitFor(() => expect(document.getElementById('isg-open')).toHaveTextContent('12'));
  expect(document.getElementById('isg-overdue')).toHaveTextContent('2');
  expect(document.getElementById('isg-mine')).toHaveTextContent('3');
  expect(document.getElementById('isg-critical')).toHaveTextContent('5');
  expect(within(document.getElementById('isg-critical')!).getByRole('link')).toHaveAttribute(
    'href',
    '/isg/issues?severity__in=high,critical',
  );
  expect(within(document.getElementById('isg-overdue')!).getByRole('link')).toHaveAttribute(
    'href',
    '/isg/issues?overdue=true',
  );
  expect(within(document.getElementById('isg-mine')!).getByRole('link')).toHaveAttribute(
    'href',
    '/isg/issues?mine=true',
  );

  const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
  expect(paths.filter((path) => path === '/isg/issues/summary/')).toHaveLength(1);
});

it("lists the user's open actions, soonest due first, and the issues by status", async () => {
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  const panel = (await screen.findByRole('heading', { name: 'Bana Atanan Aksiyonlar' })).closest(
    'section',
  )!;
  const row = await within(panel).findByRole('link', { name: /ISG-2026-009/ });
  expect(row).toHaveAttribute('href', '/isg/issues?issue=ISG-2026-009');
  expect(row).toHaveTextContent('Kritik');
  expect(row).toHaveTextContent('Hol 2 · Yüksekte Çalışma');
  const list = fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .find((url) => url.pathname === '/isg/issues/')!;
  expect(Object.fromEntries(list.searchParams)).toEqual({
    mine: 'true',
    status__in: 'open,in_progress',
    ordering: 'due_date',
    page_size: '6',
  });

  const status = screen.getByRole('heading', { name: 'Bildirim Durumu' }).closest('section')!;
  await waitFor(() => expect(status).toHaveTextContent('Kapatılan18'));
  expect(within(status).getByRole('link', { name: /Devam Ediyor/ })).toHaveAttribute(
    'href',
    '/isg/issues?status__in=in_progress',
  );
});

it('keeps the legacy cards, Bana Atananlar with its count', async () => {
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(titles).toEqual(['İSG Bildirimleri', 'Bana Atananlar']);
  const mine = screen
    .getByRole('heading', { level: 3, name: 'Bana Atananlar' })
    .closest('article')!;
  expect(within(mine).getByRole('link')).toHaveAttribute('href', '/isg/issues?mine=true');
  await waitFor(() => expect(mine).toHaveTextContent('3 açık aksiyon'));
});

it('shows "-" when the counters cannot be loaded', async () => {
  fetchMock.mockImplementation(() => json({}, 500));
  renderWithProviders(<IsgHubPage />, { route: '/isg/' });

  await waitFor(() => expect(document.getElementById('isg-open')).toHaveTextContent('-'));
});
