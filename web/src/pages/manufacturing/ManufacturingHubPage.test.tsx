import { authedFetch } from '@legacy/authService.js';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import migratedRoutes from '@/routes/migrated-routes.json';
import { MANUFACTURING_HUBS } from './hubs';
import { ManufacturingHubPage } from './ManufacturingHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: vi.fn() }));

const fetchMock = vi.mocked(authedFetch);
const accessMock = vi.mocked(hasRouteAccess);

// One-row pages, as the backend answers a count request.
const COUNTS: Record<string, number> = {
  '/machining/timers/?is_active=true&page_size=1': 7,
  '/cnc_cutting/timers/?is_active=true&page_size=1': 2,
  '/machines/faults/?unresolved=true&page_size=1': 1284,
  '/machines/faults/?unresolved=true&is_breaking=true&page_size=1': 3,
};

const requested = () =>
  fetchMock.mock.calls.map(([url]) => {
    const { pathname, search } = new URL(String(url));
    return pathname + search;
  });

const cardTitles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  accessMock.mockReset();
  accessMock.mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, search } = new URL(String(url));
    const count = COUNTS[pathname + search] ?? 0;
    return Promise.resolve(
      new Response(JSON.stringify({ count, next: null, previous: null, results: [] }), { status: 200 }),
    );
  });
});

it('has a hub for every migrated manufacturing route', () => {
  const routes = migratedRoutes.filter((route) => route.startsWith('/manufacturing'));
  expect(Object.keys(MANUFACTURING_HUBS).sort()).toEqual(routes.sort());
});

it('renders the section hub with its cards in legacy order and live figures', async () => {
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing/' });

  expect(screen.getByRole('heading', { name: 'İmalat Modülü' })).toBeInTheDocument();
  expect(cardTitles()).toEqual([
    'Projeler',
    'Talaşlı İmalat',
    'CNC Kesim',
    'Lineer Kesim',
    'Bakım',
    'Kaynak',
    'Raporlar',
    'Taşeron',
    'Malzeme Takibi',
    'Depo Çekme Talepleri',
  ]);

  await waitFor(() => expect(document.getElementById('openFaults')).toHaveTextContent('1.284'));
  expect(document.getElementById('machiningTimers')).toHaveTextContent('Talaşlı Aktif Zamanlayıcı');
  expect(document.getElementById('machiningTimers')).toHaveTextContent('7');
  expect(document.getElementById('cncTimers')).toHaveTextContent('2');
  expect(screen.getByRole('heading', { name: 'Bakım' }).closest('article')).toHaveTextContent('1.284 açık arıza');
  expect(requested().sort()).toEqual(
    [
      '/machining/timers/?is_active=true&page_size=1',
      '/cnc_cutting/timers/?is_active=true&page_size=1',
      '/machines/faults/?unresolved=true&page_size=1',
    ].sort(),
  );
});

it('shows the maintenance hub with open and stopped counts', async () => {
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing/maintenance' });

  expect(screen.getByRole('heading', { name: 'Bakım Modülü' })).toBeInTheDocument();
  await waitFor(() => expect(document.getElementById('stoppedMachines')).toHaveTextContent('3'));
  expect(document.getElementById('openFaults')).toHaveTextContent('1.284');
  // Feature links stay, in order.
  const reports = screen.getByRole('heading', { name: 'Raporlar' }).closest('article')!;
  expect([...reports.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'Arızalar Özeti',
    'Kullanıcı Çözüm Raporu',
    'Personel Faaliyet Raporu',
    'Aylık Metrikler',
  ]);
});

it('hides ungranted cards and fetches nothing for figures the user cannot open', () => {
  const granted = ['/manufacturing/welding', '/manufacturing/welding/time-entries'];
  accessMock.mockImplementation((route: string) => granted.includes(route.replace(/\/$/, '')));
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing' });

  expect(cardTitles()).toEqual(['Kaynak']);
  const welding = screen.getByRole('heading', { name: 'Kaynak' }).closest('article')!;
  expect([...welding.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Zaman Kayıtları']);
  expect(document.getElementById('openFaults')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('renders a hub without figures from its path', () => {
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing/welding/reports/' });

  expect(screen.getByRole('heading', { name: 'Kaynak Raporları' })).toBeInTheDocument();
  expect(cardTitles()).toEqual(['Çalışan Çalışma Saatleri Raporu', 'Maliyet Analizi Raporu']);
  expect(screen.getByRole('link', { name: 'Maliyet Analizi Raporu' })).toHaveAttribute(
    'href',
    '/manufacturing/welding/reports/cost-analysis',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
