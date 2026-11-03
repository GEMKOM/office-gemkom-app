import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import dayjs from 'dayjs';
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

it('shows the four cards, the band tiles and the band buttons', async () => {
  renderWithProviders(<ProcurementHubPage />, { route: '/procurement/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Satın Alma Talepleri',
    'Ödeme Listeleri',
    'Tedarikçiler',
    'Projeler',
  ]);
  // The band button and the materials panel's link.
  for (const link of screen.getAllByRole('link', { name: 'Talep Oluştur' })) {
    expect(link).toHaveAttribute('href', '/procurement/purchase-requests/create');
  }
  expect(screen.getByRole('link', { name: 'Raporlar' })).toHaveAttribute(
    'href',
    '/procurement/reports',
  );
  await waitFor(() => expect(document.getElementById('pending-requests')).toHaveTextContent('7'));
  expect(document.getElementById('requestable-items')).toHaveTextContent('7');

  // The pending panel's rows and the band's count are one request.
  expect(pendingCalls().map((url) => url.search)).toEqual(['?page_size=5']);
});

it('an approver who can open only the pending list sees only that queue', async () => {
  access.granted = ['/procurement/purchase-requests/pending'];
  renderWithProviders(<ProcurementHubPage />, { route: '/procurement/' });

  expect(screen.getByRole('heading', { name: 'Onayınızı Bekleyen Talepler' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Bu Hafta Ödenecekler' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Talep Oluştur' })).toBeNull();
  await waitFor(() => expect(document.getElementById('pending-requests')).toHaveTextContent('7'));
  expect(new Set(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname))).toEqual(
    new Set(['/procurement/purchase-requests/pending_approval/']),
  );
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

it('lists the first rows of each queue, each row opening its record', async () => {
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/planning/items/' && searchParams.get('available_for_procurement'))
      return json(
        page(27, [
          {
            id: 8,
            planning_request_number: 'GR-2026-0187',
            item_code: 'S235-10',
            item_name: 'S235JR levha 10 mm',
            item_unit: 'kg',
            job_no: '293-03-07',
            quantity_remaining_for_purchase: '2400.00',
            is_critical: true,
          },
        ]),
      );
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
    if (pathname === '/procurement/payment-pool/' && searchParams.get('page_size') === '1')
      return json(page(6));
    if (pathname === '/procurement/payment-pool/')
      return json(
        page(7, [
          {
            schedule_id: 51,
            currency: 'EUR',
            gross_amount: '6240.00',
            due_date: '2020-10-28',
            supplier: { id: 3, name: 'Demir Çelik San. A.Ş.' },
            po: { id: 1182 },
            pr: { id: 9, request_number: 'PR-2026-0390' },
          },
        ]),
      );
    if (pathname === '/procurement/purchase-requests/pending_approval/')
      return json(
        page(3, [
          {
            id: 418,
            request_number: 'PR-2026-0418',
            title: 'Paslanmaz sac 4 mm',
            requestor_username: 'ayse.kaya',
            status: 'submitted',
            priority: 'urgent',
            total_amount_eur: '12480.00',
            needed_date: '2026-11-10',
          },
        ]),
      );
    return json(page(searchParams.has('assigned_to') ? 1 : 0));
  });
  renderWithProviders(<ProcurementHubPage />, { route: '/procurement/' });

  const panel = (name: string) => screen.getByRole('heading', { name }).closest('section')!;

  const request = await within(panel('Onayınızı Bekleyen Talepler')).findByRole('link', {
    name: /PR-2026-0418/,
  });
  expect(request).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/pending?talep=PR-2026-0418',
  );
  expect(request).toHaveTextContent('ayse.kaya · ihtiyaç 10.11.2026');
  expect(request).toHaveTextContent('Acil');
  expect(request).toHaveTextContent('€12.480');
  expect(document.getElementById('pending-requests')).toHaveTextContent('3');

  const material = await within(panel('Talep Bekleyen Malzemeler')).findByRole('link', {
    name: /GR-2026-0187/,
  });
  expect(material).toHaveAttribute('href', '/procurement/purchase-requests/create');
  expect(material).toHaveTextContent('Kritik');
  expect(material).toHaveTextContent('2.400 kg');
  expect(document.getElementById('requestable-items')).toHaveTextContent('27');

  const critical = await within(panel('Teslim Bekleyen Kritik Malzemeler')).findByRole('link', {
    name: /SAC-10/,
  });
  expect(critical).toHaveAttribute('href', '/procurement/critical-items?item_code=SAC-10');
  expect(critical).toHaveTextContent('Talep yok');
  expect(critical).toHaveTextContent('1.200 kg');
  expect(document.getElementById('critical-items')).toHaveTextContent('9');

  const payment = await within(panel('Bu Hafta Ödenecekler')).findByRole('link', {
    name: /Demir Çelik/,
  });
  expect(payment).toHaveAttribute(
    'href',
    '/procurement/payment-lists?view=pool&basis=all&q=PR-2026-0390',
  );
  expect(payment).toHaveTextContent('PO-1182 · PR-2026-0390');
  // Past its due date: the meta turns red.
  expect(payment.querySelector('[data-alert]')).toHaveTextContent('28 Eki');
  const due = calls().find(
    (url) =>
      url.pathname === '/procurement/payment-pool/' && url.searchParams.get('page_size') !== '1',
  )!;
  expect(due.searchParams.get('basis')).toBe('all');
  expect(due.searchParams.get('ordering')).toBe('due_date');
  // Through the coming Sunday.
  expect(dayjs(due.searchParams.get('due_before')).day()).toBe(0);
  await waitFor(() =>
    expect(document.getElementById('overdue-instalments')).toHaveTextContent('6'),
  );

  const queues = panel('Satın Almayı Bekleyenler');
  await waitFor(() =>
    expect(within(queues).getByRole('link', { name: /Ödeme listeleri/ })).toHaveTextContent('2'),
  );
  expect(within(queues).getByRole('link', { name: /Ödeme listeleri/ })).toHaveAttribute(
    'href',
    '/procurement/payment-lists?status=submitted',
  );
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
