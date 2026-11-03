import { authedFetch } from '@legacy/authService.js';
import { hasRouteAccess } from '@legacy/apis/accessControl.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { ManufacturingSectionHubPage } from './ManufacturingSectionHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@legacy/apis/accessControl.js', () => ({ hasRouteAccess: vi.fn() }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'imalat' } }),
}));

const fetchMock = vi.mocked(authedFetch);
const accessMock = vi.mocked(hasRouteAccess);

// One-row pages, as the backend answers a count request.
const COUNTS: Record<string, number> = {
  '/machines/faults/?unresolved=true&page_size=1': 1284,
  '/machines/faults/?unresolved=true&is_breaking=true&page_size=1': 3,
  '/warehouse/pull-requests/?status=pending&page_size=1': 4,
  '/subcontracting/statements/?status=submitted&page_size=1': 2,
};

const SUMMARY = {
  today: '2026-11-03',
  month_start: '2026-11-01',
  open_tasks: 15,
  open_kg: 57600,
  overdue_tasks: 3,
  overdue_kg: 18400,
  month_welded_kg: 42600,
  resources: [
    {
      resource_type: 'subcontractor',
      id: 4,
      name: 'Demir Çelik Ltd. Şti.',
      short_name: 'Demir Çelik',
      open_tasks: 6,
      overdue_tasks: 2,
      open_kg: 31200,
      overdue_kg: 12000,
      month_kg: 20000,
    },
    {
      resource_type: 'team',
      id: 9,
      name: 'Usta Kaynak',
      open_tasks: 4,
      overdue_tasks: 1,
      open_kg: 12500,
      overdue_kg: 6400,
      month_kg: 9000,
    },
    {
      resource_type: 'team',
      id: 2,
      name: 'Ekip Yılmaz',
      open_tasks: 2,
      overdue_tasks: 0,
      open_kg: 4100,
      overdue_kg: 0,
      month_kg: 3000,
    },
    {
      resource_type: 'subcontractor',
      id: 7,
      name: 'Kaya Metal',
      open_tasks: 2,
      overdue_tasks: 0,
      open_kg: 6000,
      overdue_kg: 0,
      month_kg: 600,
    },
    {
      resource_type: 'team',
      id: 3,
      name: 'Ekip Ahmet',
      open_tasks: 1,
      overdue_tasks: 0,
      open_kg: 3800,
      overdue_kg: 0,
      month_kg: 0,
    },
  ],
};

const TIMER = {
  id: 11,
  username: 'mehmet.k',
  machine_name: 'Torna 1',
  issue_key: 'TI-254-01',
  issue_name: 'Flanş',
  start_time: Date.now() - 3600_000,
  timer_type: 'productive',
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

const page = (results: unknown[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

let summaryStatus = 200;

const requested = () =>
  fetchMock.mock.calls.map(([url]) => {
    const { pathname, search } = new URL(String(url));
    return pathname + search;
  });

const lane = (name: string) => screen.getByRole('region', { name });

beforeEach(() => {
  summaryStatus = 200;
  accessMock.mockReset();
  accessMock.mockReturnValue(true);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, search } = new URL(String(url));
    let body: unknown = {
      count: COUNTS[pathname + search] ?? 0,
      next: null,
      previous: null,
      results: [],
    };
    if (pathname === '/welding/hub-summary/') {
      return Promise.resolve(
        summaryStatus === 200
          ? new Response(JSON.stringify(SUMMARY), { status: 200 })
          : new Response(JSON.stringify({ detail: 'Not found.' }), { status: summaryStatus }),
      );
    }
    if (pathname === '/machining/timers/') body = page([TIMER]);
    if (pathname === '/machines/faults/' && search.includes('page_size=4')) body = page([FAULT]);
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
});

it('shows a lane per area, in menu order', () => {
  renderWithProviders(<ManufacturingSectionHubPage />, { route: '/manufacturing' });

  expect(screen.getByRole('heading', { level: 1, name: 'İmalat' })).toBeInTheDocument();
  expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
    'Kaynaklı İmalat',
    'Talaşlı İmalat',
    'Bakım',
    'Taşeron',
    'Malzeme',
    'Projeler',
  ]);
  // CNC and linear cutting moved to Planlama.
  expect(screen.queryByText(/CNC/)).toBeNull();
});

it('shows late welding work, this month’s tonnage and every team and subcontractor with work', async () => {
  renderWithProviders(<ManufacturingSectionHubPage />, { route: '/manufacturing' });

  const welding = lane('Kaynaklı İmalat');
  await waitFor(() => expect(welding).toHaveTextContent('Termini geçen iş'));
  await waitFor(() => expect(welding).toHaveTextContent('42,6 t'));
  expect(welding).toHaveTextContent('3Termini geçen iş18,4 t');
  expect(welding).toHaveTextContent('57,6 t açık işte');

  const subcontractor = within(welding).getByRole('link', { name: /Demir Çelik/ });
  expect(subcontractor).toHaveTextContent('6 iş');
  expect(subcontractor).toHaveTextContent('2 gecikmiş');
  expect(subcontractor).toHaveTextContent('31,2 t');
  expect(subcontractor).toHaveAttribute('href', '/manufacturing/subcontracting/subcontractors');
  expect(within(welding).getByRole('link', { name: /Usta Kaynak/ })).toHaveAttribute(
    'href',
    '/manufacturing/welding/teams',
  );
  // Four rows, then how many more.
  expect(within(welding).queryByText('Ekip Ahmet')).toBeNull();
  expect(welding).toHaveTextContent('+1 ekip / taşeron daha');

  // The band counts the same late work; one request serves both.
  await waitFor(() => expect(document.getElementById('lateWelding')).toHaveTextContent('3'));
  expect(requested().filter((url) => url === '/welding/hub-summary/')).toHaveLength(1);
});

it('shows what runs on the machines and the open faults', async () => {
  renderWithProviders(<ManufacturingSectionHubPage />, { route: '/manufacturing' });

  const machining = lane('Talaşlı İmalat');
  const running = await within(machining).findByText('TI-254-01 · Flanş');
  expect(running.closest('li')).toHaveTextContent('Torna 1');
  expect(running.closest('li')).toHaveTextContent('mehmet.k');
  expect(machining).toHaveTextContent('1 makinede');

  const maintenance = lane('Bakım');
  const fault = await within(maintenance).findByRole('link', { name: /Okuma MA-600/ });
  expect(fault).toHaveTextContent('Duruşta');
  expect(fault).toHaveTextContent('2 gün');
  await waitFor(() => expect(maintenance).toHaveTextContent('1.284Açık arıza'));
  await waitFor(() => expect(document.getElementById('stopped')).toHaveTextContent('3'));
  // A count shared by the band and the lane is asked for once.
  expect(
    requested().filter(
      (url) => url === '/machines/faults/?unresolved=true&is_breaking=true&page_size=1',
    ),
  ).toHaveLength(1);
});

it('says the welding figures could not load when the summary fails', async () => {
  summaryStatus = 404;
  renderWithProviders(<ManufacturingSectionHubPage />, { route: '/manufacturing' });

  const welding = lane('Kaynaklı İmalat');
  await within(welding).findByText('Yüklenemedi.');
  expect(welding).toHaveTextContent('-Termini geçen iş');
});

it('shows only the lanes, links and figures the user can open, and fetches nothing else', async () => {
  const granted = ['/manufacturing/welding/time-entries'];
  accessMock.mockImplementation((route: string) =>
    granted.includes(route.split('?')[0]!.replace(/\/$/, '')),
  );
  renderWithProviders(<ManufacturingSectionHubPage />, { route: '/manufacturing' });

  expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
    'Kaynaklı İmalat',
  ]);
  const welding = lane('Kaynaklı İmalat');
  expect(within(welding).getByRole('navigation').textContent).toBe('Zaman Kayıtları');
  expect(welding).not.toHaveTextContent('Puantaj onayda');
  expect(screen.queryByRole('link', { name: /Arıza Bildir/ })).toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(new Set(requested().map((url) => url.split('?')[0]))).toEqual(
    new Set(['/welding/hub-summary/']),
  );
});
