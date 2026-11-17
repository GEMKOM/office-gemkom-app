import { authedFetch } from '@/auth/authService';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { WarehouseHubPage } from './WarehouseHubPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const granted = vi.hoisted(() => ({ routes: null as Set<string> | null }));
vi.mock('@/auth/accessControl', () => ({
  hasRouteAccess: (route: string) =>
    granted.routes === null || granted.routes.has(route.replace(/[?#].*$/, '').replace(/\/$/, '')),
}));

const fetchMock = vi.mocked(authedFetch);
const page = (count: number) => ({ count, next: null, previous: null, results: [] });
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const calls = () => fetchMock.mock.calls.map(([u]) => new URL(String(u)));
const card = (title: string) =>
  screen.getByRole('heading', { level: 3, name: title }).closest('article')!;

beforeEach(() => {
  granted.routes = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/procurement/items/') return json(page(1240));
    if (pathname === '/equipment/items/') return json(page(87));
    if (pathname === '/warehouse/stock-counts/') return json(page(2));
    return json(page(0));
  });
});

it('groups Depo into Stoklar, Giriş / Çıkış, Sayım and Raporlar', async () => {
  renderWithProviders(<WarehouseHubPage />, { route: '/warehouse/' });

  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(headings).toEqual(['Stoklar', 'Giriş / Çıkış', 'Sayım', 'Raporlar']);

  const links = (title: string) =>
    within(card(title))
      .getAllByRole('link')
      .map((a) => a.textContent?.trim());
  expect(links('Stoklar')).toEqual(
    expect.arrayContaining([
      'Ana Stok',
      'Sac Stoğu',
      'Boy Stoğu',
      'Ekipman',
      'Mikro Karşılaştırması',
    ]),
  );
  expect(links('Giriş / Çıkış')).toEqual(
    expect.arrayContaining([
      'Mal Kabul',
      'Depo Çekme Talepleri',
      'İmalata Çıkış / İade',
      'Depo Transferi',
    ]),
  );
  expect(links('Sayım')).toEqual(expect.arrayContaining(['Ana Stok Sayımı', 'Sac ve Boy Sayımı']));

  await waitFor(() => expect(card('Stoklar')).toHaveTextContent('1.240 stok kartı'));
  await waitFor(() => expect(card('Sayım')).toHaveTextContent('2 açık sayım'));
  const items = calls().find((url) => url.pathname === '/procurement/items/')!;
  expect(items.searchParams.get('item_type')).toBe('stock');
});

it('shows a planner only the stock pages they can open', async () => {
  // A planner who had Planlama › Stok › Stok Kartları (now Ana Stok).
  granted.routes = new Set(['/warehouse/stock']);
  renderWithProviders(<WarehouseHubPage />, { route: '/warehouse/' });

  const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
  expect(headings).toEqual(['Stoklar']);
  expect(
    within(card('Stoklar'))
      .getAllByRole('link')
      .map((a) => a.textContent?.trim()),
  ).toEqual(['Ana Stok']);
  await waitFor(() => expect(card('Stoklar')).toHaveTextContent('1.240 stok kartı'));
  expect(calls().some((url) => url.pathname === '/warehouse/stock-counts/')).toBe(false);
});
