import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { QualityControlHubPage } from './QualityControlHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => granted.routes === null || granted.routes.has(route.replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname } = new URL(String(url));
    const count = pathname === '/quality-control/qc-reviews/' ? 7 : 1284;
    return Promise.resolve(new Response(JSON.stringify({ count, next: null, previous: null, results: [] })));
  });
});

it('shows the four cards in legacy order with pending reviews and open NCRs', async () => {
  renderWithProviders(<QualityControlHubPage />, { route: '/quality-control/' });

  expect(screen.getByRole('heading', { name: 'Kalite Kontrol Modülü' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'KK İncelemeleri',
    'Uygunsuzluk Raporları',
    'Maliyet Satırları',
    'Kalite Evrakları',
  ]);

  await waitFor(() => expect(document.getElementById('pending-reviews')).toHaveTextContent('7'));
  expect(document.getElementById('open-ncrs')).toHaveTextContent('1.284');
  expect(screen.getByText('inceleme bekliyor').parentElement).toHaveTextContent('7 inceleme bekliyor');

  expect(calls().map((url) => `${url.pathname}${url.search}`).sort()).toEqual([
    '/quality-control/ncrs/?status__in=draft%2Csubmitted%2Capproved%2Crejected&page_size=1',
    '/quality-control/qc-reviews/?status=pending&page_size=1',
  ]);
});

it('fetches nothing for areas the user cannot open', async () => {
  granted.routes = new Set(['/quality-control/documents']);
  renderWithProviders(<QualityControlHubPage />, { route: '/quality-control/' });

  expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Kalite Evrakları']);
  expect(document.getElementById('pending-reviews')).toBeNull();
  expect(document.getElementById('open-ncrs')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
