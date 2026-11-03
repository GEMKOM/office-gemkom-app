import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProjectsHubPage } from '../projects/ProjectsHubPage';
import { ManagementHubPage } from './ManagementHubPage';
import { ManagementReportsHubPage } from './reports/ManagementReportsHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/\/$/, '')),
}));

const cardTitles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

const fetchMock = vi.mocked(authedFetch);
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));

const SNAPSHOT = {
  job_orders: { active: 41, overdue: 7, on_hold_for_revision: 2 },
  approvals_pending: { overtime_requests: 3, purchase_requests: 12, subcontractor_statements: 0 },
  alerts: { tasks_blocked: 5, ncrs_critical_open: 1, payments_overdue: 9 },
};

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    const body =
      pathname === '/reports/snapshot/'
        ? SNAPSHOT
        : {
            count: searchParams.has('is_breaking') ? 1 : 4,
            next: null,
            previous: null,
            results: [],
          };
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
});

it('management hub: the three legacy cards, each linking where it did', () => {
  renderWithProviders(<ManagementHubPage />, { route: '/management/' });

  expect(screen.getByRole('heading', { name: 'Yönetim Modülü' })).toBeInTheDocument();
  expect(cardTitles()).toEqual(['Dashboard', 'Raporlar', 'Analitik']);
  expect(screen.getByRole('link', { name: 'Raporlar' })).toHaveAttribute(
    'href',
    '/management/reports',
  );
});

it('management hub: cards the user cannot open are hidden', () => {
  granted.routes = new Set(['/management/dashboard']);
  renderWithProviders(<ManagementHubPage />, { route: '/management/' });

  expect(cardTitles()).toEqual(['Dashboard']);
});

it('management hub: company-wide figures from one snapshot, linking to the pages behind them', async () => {
  renderWithProviders(<ManagementHubPage />, { route: '/management/' });

  await waitFor(() =>
    expect(document.getElementById('company-active-jobs')).toHaveTextContent('41'),
  );
  expect(document.getElementById('company-late-jobs')).toHaveTextContent('7');
  expect(document.getElementById('company-overdue-payments')).toHaveTextContent('9');
  expect(
    within(document.getElementById('company-critical-ncrs')!).getByRole('link'),
  ).toHaveAttribute('href', '/quality-control/ncrs?severity=critical&assigned_team__in=all');

  const approvals = screen
    .getByRole('heading', { name: 'Onay Sürecindekiler' })
    .closest('section')!;
  const pr = within(approvals).getByRole('link', { name: /Satın alma talepleri/ });
  expect(pr).toHaveTextContent('12');
  expect(pr).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/registry?requestor=&status=submitted',
  );
  const alerts = screen.getByRole('heading', { name: 'Dikkat Gerektirenler' }).closest('section')!;
  await waitFor(() =>
    expect(within(alerts).getByRole('link', { name: /Duruştaki makineler/ })).toHaveTextContent(
      '1',
    ),
  );
  expect(calls().filter((url) => url.pathname === '/reports/snapshot/')).toHaveLength(1);
});

it('management hub: figures behind pages the user cannot open fall back to the dashboard', async () => {
  granted.routes = new Set(['/management/dashboard']);
  renderWithProviders(<ManagementHubPage />, { route: '/management/' });

  await waitFor(() =>
    expect(document.getElementById('company-active-jobs')).toHaveTextContent('41'),
  );
  expect(within(document.getElementById('company-active-jobs')!).getByRole('link')).toHaveAttribute(
    'href',
    '/management/dashboard',
  );
  expect(calls().some((url) => url.pathname === '/machines/faults/')).toBe(false);
});

it('reports and projects hubs keep their cards and order', () => {
  const { unmount } = renderWithProviders(<ManagementReportsHubPage />, {
    route: '/management/reports/',
  });
  expect(cardTitles()).toEqual(['Genel Bakış', 'Nakit Akış Tablosu']);
  unmount();

  renderWithProviders(<ProjectsHubPage />, { route: '/projects/' });
  expect(cardTitles()).toEqual(['Proje Takibi', 'Tahminler', 'Referanslar']);
});
