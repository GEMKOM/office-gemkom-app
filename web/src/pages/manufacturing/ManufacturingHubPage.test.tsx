import { authedFetch } from '@legacy/authService.js';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MOVED_ROUTES } from '@legacy/movedRoutes.js';
import { REPORT_HUBS } from '@legacy/reportCatalog.js';
import { appRoutes } from '@/routes/router';
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
  '/warehouse/pull-requests/?status=pending&page_size=1': 4,
  '/cnc_cutting/tasks/?completion_date__isnull=true&page_size=1': 12,
};

const FAULT = {
  id: 5,
  machine_name: 'Okuma MA-600',
  description: 'Hidrolik kaçak',
  is_breaking: true,
  reported_by_full_name: 'Veli',
  reported_at: '2026-11-02T06:00:00Z',
  open_duration_seconds: 2 * 86400,
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
    let body: unknown = { count, next: null, previous: null, results: [] };
    if (pathname === '/machines/faults/' && search.includes('page_size=6'))
      body = { count: 1, next: null, previous: null, results: [FAULT] };
    if (pathname === '/tasks/parts/stats/')
      body = {
        parts_without_operations: 3,
        parts_with_unassigned_operations: 5,
        parts_with_unplanned_operations: 8,
        incomplete_parts: 40,
      };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});

it('has a hub for every manufacturing hub route', () => {
  // List pages under /manufacturing are their own routes, without the hub handle;
  // the report hubs are views of the Rapor Merkezi (REPORT_HUBS). CNC and linear
  // cutting kept their hubs when they moved under Planlama.
  const moved = Object.values(MOVED_ROUTES);
  const routes = appRoutes
    .filter((route) => route.handle?.access === 'hub')
    .filter((route) => route.path?.startsWith('/manufacturing') || moved.includes(route.path!))
    .map((route) => route.path!)
    .filter((path) => !(path in REPORT_HUBS));
  expect(Object.keys(MANUFACTURING_HUBS).sort()).toEqual(routes.sort());
});

it('renders the section hub with its cards in legacy order and live figures', async () => {
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing/' });

  expect(screen.getByRole('heading', { name: 'İmalat Modülü' })).toBeInTheDocument();
  expect(cardTitles()).toEqual([
    'Projeler',
    'Talaşlı İmalat',
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
  expect(screen.getByRole('heading', { name: 'Bakım' }).closest('article')).toHaveTextContent(
    '1.284 açık arıza',
  );
  for (const count of [
    '/machining/timers/?is_active=true&page_size=1',
    '/cnc_cutting/timers/?is_active=true&page_size=1',
    '/machines/faults/?unresolved=true&page_size=1',
    '/machines/faults/?unresolved=true&is_breaking=true&page_size=1',
  ]) {
    expect(requested()).toContain(count);
  }
  // Each count is asked for once, however many places show it.
  expect(
    requested().filter((url) => url === '/machines/faults/?unresolved=true&page_size=1'),
  ).toHaveLength(1);
});

it('shows the open faults and what waits on the shop under the section cards', async () => {
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing/' });

  const faults = screen.getByRole('heading', { name: 'Açık Arızalar' }).closest('section')!;
  const row = await within(faults).findByRole('link', { name: /Okuma MA-600/ });
  expect(row).toHaveTextContent('Hidrolik kaçak');
  expect(row).toHaveTextContent('Duruşta');
  expect(row).toHaveTextContent('2 gün');

  const queues = screen.getByRole('heading', { name: 'Atölyeyi Bekleyenler' }).closest('section')!;
  const pulls = within(queues).getByRole('link', { name: /Depo çekme talepleri/ });
  await waitFor(() => expect(pulls).toHaveTextContent('4'));
  expect(pulls).toHaveAttribute(
    'href',
    '/manufacturing/material-tracking/pull-requests?status=pending',
  );
  await waitFor(() =>
    expect(within(queues).getByRole('link', { name: /CNC kesimleri/ })).toHaveTextContent('12'),
  );
  const late = requested().find(
    (url) => url.startsWith('/tasks/parts/') && url.includes('finish_time__lte'),
  )!;
  expect(late).toContain('completion_date__isnull=true');
  expect(
    screen.getByRole('heading', { name: 'Depo Çekme Talepleri' }).closest('article'),
  ).toHaveTextContent('4 talep depoda bekliyor');
});

it('shows the machining parts held up before production', async () => {
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing/machining' });

  const backlog = screen.getByRole('heading', { name: 'Parça Hazırlığı' }).closest('section')!;
  await waitFor(() => expect(backlog).toHaveTextContent('Tamamlanmamış parça40'));
  expect(within(backlog).getByRole('link', { name: /Operasyonu olmayan/ })).toHaveAttribute(
    'href',
    '/manufacturing/machining/tasks/list?has_operations=true',
  );
  expect(document.getElementById('incompleteParts')).toBeInTheDocument();
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
    'Personel Faaliyet Raporu',
    'Aylık Metrikler',
  ]);
});

it('hides ungranted cards and fetches nothing for figures the user cannot open', async () => {
  const granted = ['/manufacturing/welding', '/manufacturing/welding/time-entries'];
  accessMock.mockImplementation((route: string) => granted.includes(route.replace(/\/$/, '')));
  renderWithProviders(<ManufacturingHubPage />, { route: '/manufacturing' });

  expect(cardTitles()).toEqual(['Kaynak']);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const welding = screen.getByRole('heading', { name: 'Kaynak' }).closest('article')!;
  expect([...welding.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
    'Zaman Kayıtları',
  ]);
  expect(document.getElementById('openFaults')).toBeNull();
  // Only the figure behind the one page the user can open: today's time entries.
  expect(new Set(requested().map((url) => url.split('?')[0]))).toEqual(
    new Set(['/welding/time-entries/']),
  );
});

