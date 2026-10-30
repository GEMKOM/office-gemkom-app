import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ProcurementHubPage } from './ProcurementHubPage';
import { PurchaseRequestsHubPage } from './PurchaseRequestsHubPage';

const access = vi.hoisted(() => ({ granted: null as string[] | null }));

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
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
