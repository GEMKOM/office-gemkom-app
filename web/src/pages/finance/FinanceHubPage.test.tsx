import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { AccountingHubPage } from '../accounting/AccountingHubPage';
import { LogisticsHubPage } from '../logistics/LogisticsHubPage';
import { FinanceHubPage } from './FinanceHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'finans' } }),
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

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/procurement/purchase-orders/') {
      if (searchParams.get('page_size') === '1') return json(page(14));
      return json(
        page(14, [
          {
            id: 31,
            purchase_request_number: 'PR-2026-0090',
            supplier_name: 'Demir Çelik AŞ',
            currency: 'EUR',
            total_amount: '4200',
            next_unpaid_due: '2020-05-01',
          },
        ]),
      );
    }
    if (pathname === '/procurement/payment-pool/')
      return json(page(searchParams.has('due_after') ? 5 : 2));
    if (pathname === '/procurement/payment-lists/') return json(page(1));
    if (pathname === '/subcontracting/statements/') {
      const counts: Record<string, number> = { approved: 6, paid: 2, submitted: 3 };
      return json(page(counts[searchParams.get('status')!] ?? 0));
    }
    if (pathname === '/projects/job-orders/shipping_pending/') return json(page(11));
    return json(page(0));
  });
});

it('Finans: orders awaiting payment, overdue and coming instalments, and the next payments', async () => {
  renderWithProviders(<FinanceHubPage />, { route: '/finance/' });

  await waitFor(() => expect(document.getElementById('orders-awaiting')).toHaveTextContent('14'));
  await waitFor(() =>
    expect(document.getElementById('instalments-overdue')).toHaveTextContent('2'),
  );
  expect(document.getElementById('instalments-week')).toHaveTextContent('5');

  const pool = calls().filter((url) => url.pathname === '/procurement/payment-pool/');
  expect(pool.every((url) => url.searchParams.get('basis') === 'all')).toBe(true);
  const week = pool.find((url) => url.searchParams.has('due_after'))!;
  expect(week.searchParams.get('due_before')! > week.searchParams.get('due_after')!).toBe(true);

  const next = screen.getByRole('heading', { name: 'Sıradaki Ödemeler' }).closest('section')!;
  const row = await within(next).findByRole('link', { name: /Demir Çelik AŞ/ });
  expect(row).toHaveAttribute('href', '/finance/purchase-orders?order=31');
  expect(row).toHaveTextContent('€4.200,00');
  expect(row.querySelector('[data-alert]')).not.toBeNull();

  const queues = screen.getByRole('heading', { name: 'Finansı Bekleyenler' }).closest('section')!;
  expect(within(queues).getByRole('link', { name: /ödeme listeleri/ })).toHaveAttribute(
    'href',
    '/procurement/payment-lists?status=sent_to_finance',
  );
});

it('Finans: a user with only the reports fetches nothing', () => {
  granted.routes = new Set(['/finance/reports']);
  renderWithProviders(<FinanceHubPage />, { route: '/finance/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Raporlar',
  ]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("Muhasebe: last month's statements ready for the export and still in approval", async () => {
  renderWithProviders(<AccountingHubPage />, { route: '/accounting/' });

  // Approved and paid statements go into the export.
  await waitFor(() => expect(document.getElementById('statements-ready')).toHaveTextContent('8'));
  expect(document.getElementById('statements-submitted')).toHaveTextContent('3');
  const statement = calls().find((url) => url.pathname === '/subcontracting/statements/')!;
  const month = Number(statement.searchParams.get('month'));
  expect(month).toBeGreaterThanOrEqual(1);
  expect(within(document.getElementById('statements-ready')!).getByRole('link')).toHaveAttribute(
    'href',
    `/accounting/subcontracting-statements?year=${statement.searchParams.get('year')}&month=${month}`,
  );
});

it('Lojistik: missing shipping costs and the logistics tasks', async () => {
  renderWithProviders(<LogisticsHubPage />, { route: '/logistics/' });

  await waitFor(() => expect(document.getElementById('shipping-missing')).toHaveTextContent('11'));
  expect(screen.getByRole('heading', { name: 'Teslim Sırası' })).toBeInTheDocument();
  const tasks = calls().filter((url) => url.pathname === '/projects/department-tasks/');
  expect(tasks.every((url) => url.searchParams.get('department') === 'logistics')).toBe(true);
  expect(within(document.getElementById('logistics-mine')!).getByRole('link')).toHaveAttribute(
    'href',
    '/logistics/projects?assigned_to=42',
  );
});
