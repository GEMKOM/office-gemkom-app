import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProcurementHubPage } from './ProcurementHubPage';
import { PurchaseRequestsHubPage } from './PurchaseRequestsHubPage';
import { SuppliersHubPage } from './SuppliersHubPage';

const access = vi.hoisted(() => ({ granted: null as string[] | null }));

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'satinalma' } }),
}));
// null grants everything (admin); a list grants exactly those routes.
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => access.granted === null || access.granted.includes(route),
}));

const fetchMock = vi.mocked(authedFetch);

const pendingCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/procurement/purchase-requests/pending_approval/');

beforeEach(() => {
  access.granted = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ count: 7, next: null, previous: null, results: [] }), {
        status: 200,
      }),
    ),
  );
});

it('shows the requests awaiting the user on the band and on the Satın Alma Talepleri card', async () => {
  renderWithProviders(<ProcurementHubPage />, { route: '/procurement/' });

  for (const title of [
    'Projeler',
    'Tedarikçiler',
    'Kritik Malzemeler',
    'Ödeme Listeleri',
    'Satın Alma Talepleri',
    'Raporlar',
  ]) {
    expect(screen.getByRole('link', { name: title })).toBeInTheDocument();
  }
  await waitFor(() => expect(document.getElementById('pending-requests')).toHaveTextContent('7'));
  expect(screen.getByText('talep onayınızı bekliyor').parentElement).toHaveTextContent(
    '7 talep onayınızı bekliyor',
  );

  expect(pendingCalls().map((url) => url.search)).toEqual(['?page_size=1']);
});

it('hides what the user cannot open and fetches nothing for it', () => {
  access.granted = ['/procurement/suppliers', '/procurement/suppliers/list'];
  renderWithProviders(<ProcurementHubPage />, { route: '/procurement/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Tedarikçiler',
  ]);
  expect(screen.getByRole('link', { name: 'Tedarikçi Listesi' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ödeme Koşulları' })).not.toBeInTheDocument();
  expect(document.getElementById('pending-requests')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('puts the count on the Bekleyen Talepler card of the purchase requests hub', async () => {
  renderWithProviders(<PurchaseRequestsHubPage />, { route: '/procurement/purchase-requests/' });

  expect(screen.getByRole('link', { name: 'Talep Oluştur' })).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/create',
  );
  const card = screen.getByRole('link', { name: 'Bekleyen Talepler' }).closest('article')!;
  await waitFor(() => expect(card).toHaveTextContent('7 talep onayınızı bekliyor'));
});

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const page = (count: number, results: unknown[] = []) => ({
  count,
  next: null,
  previous: null,
  results,
});

it('counts critical material, payment lists in approval and overdue instalments, each linked', async () => {
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/planning/items/')
      return json(
        page(9, [
          {
            id: 4,
            item_code: 'SAC-10',
            item_name: 'Sac 10 mm',
            item_unit: 'kg',
            job_no: '265-02',
            quantity_to_purchase: 1200,
            purchase_request_number: null,
          },
        ]),
      );
    if (pathname === '/procurement/payment-lists/') return json(page(2));
    if (pathname === '/procurement/payment-pool/') return json(page(6));
    if (pathname === '/procurement/purchase-requests/pending_approval/') return json(page(7));
    return json(page(searchParams.has('assigned_to') ? 1 : 0));
  });
  renderWithProviders(<ProcurementHubPage />, { route: '/procurement/' });

  await waitFor(() => expect(document.getElementById('critical-items')).toHaveTextContent('9'));
  await waitFor(() =>
    expect(document.getElementById('overdue-instalments')).toHaveTextContent('6'),
  );
  const pool = calls().find((url) => url.pathname === '/procurement/payment-pool/')!;
  expect(pool.searchParams.get('basis')).toBe('all');
  expect(pool.searchParams.get('due_before')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const lists = calls().find((url) => url.pathname === '/procurement/payment-lists/')!;
  expect(lists.searchParams.get('status')).toBe('submitted');

  const queues = screen
    .getByRole('heading', { name: 'Satın Almayı Bekleyenler' })
    .closest('section')!;
  await waitFor(() =>
    expect(within(queues).getByRole('link', { name: /Ödeme listeleri/ })).toHaveTextContent('2'),
  );
  expect(within(queues).getByRole('link', { name: /Ödeme listeleri/ })).toHaveAttribute(
    'href',
    '/procurement/payment-lists?status=submitted',
  );

  const critical = screen
    .getByRole('heading', { name: 'Teslim Bekleyen Kritik Malzemeler' })
    .closest('section')!;
  const row = await within(critical).findByRole('link', { name: /SAC-10/ });
  expect(row).toHaveAttribute('href', '/procurement/critical-items?item_code=SAC-10');
  expect(row).toHaveTextContent('Talep yok');
  expect(row).toHaveTextContent('1.200 kg');
});

it("purchase requests hub: the user's own requests, newest first and by status", async () => {
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/procurement/purchase-requests/' && searchParams.get('page_size') !== '1')
      return json(
        page(1, [
          {
            id: 3,
            request_number: 'PR-2026-0103',
            title: 'Rulman',
            status: 'submitted',
            status_label: 'Onay Bekliyor',
            total_amount_eur: '1520.5',
            created_at: '2026-11-01T10:00:00Z',
          },
        ]),
      );
    if (pathname === '/procurement/purchase-requests/')
      return json(page(searchParams.get('status') === 'submitted' ? 3 : 1));
    return json(page(7));
  });
  renderWithProviders(<PurchaseRequestsHubPage />, { route: '/procurement/purchase-requests/' });

  const mine = screen.getByRole('heading', { name: 'Son Taleplerim' }).closest('section')!;
  const row = await within(mine).findByRole('link', { name: /PR-2026-0103/ });
  expect(row).toHaveAttribute('href', '/procurement/purchase-requests/registry?talep=PR-2026-0103');
  expect(row).toHaveTextContent('€1.520,50');
  await waitFor(() => expect(document.getElementById('my-submitted')).toHaveTextContent('3'));
  expect(within(document.getElementById('my-submitted')!).getByRole('link')).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/registry?requestor=42&status=submitted',
  );
  const list = calls().find((url) => url.searchParams.get('ordering') === '-created_at')!;
  expect(list.searchParams.get('requestor')).toBe('42');
});

it('suppliers hub: active, watched and blacklisted suppliers, each opening the filtered list', async () => {
  fetchMock.mockImplementation((url) => {
    const status = new URL(String(url)).searchParams.get('supplier_status');
    return json(page(status === 'watch' ? 4 : status === 'blacklisted' ? 1 : 212));
  });
  renderWithProviders(<SuppliersHubPage />, { route: '/procurement/suppliers/' });

  await waitFor(() => expect(document.getElementById('suppliers-all')).toHaveTextContent('212'));
  expect(document.getElementById('suppliers-watch')).toHaveTextContent('4');
  expect(
    within(document.getElementById('suppliers-blacklisted')!).getByRole('link'),
  ).toHaveAttribute('href', '/procurement/suppliers/list?supplier_status=blacklisted');
});
