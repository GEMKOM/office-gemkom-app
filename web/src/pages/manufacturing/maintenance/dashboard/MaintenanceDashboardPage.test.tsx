import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { maintenanceKeys } from '@/api/maintenance/faults';
import { renderWithProviders } from '@/test/render';
import { localDay } from '../shared';
import { clock, startMs } from './dashboardRows';
import { MaintenanceDashboardPage } from './MaintenanceDashboardPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TIMERS = [
  {
    id: 1,
    username: 'ali',
    machine_name: 'CNC Torna 1',
    fault_description: 'Mil sesi',
    start_time: Date.now() - 65_000,
  },
  {
    id: 2,
    username: 'ali',
    machine_name: 'Pres 2',
    fault_id: 55,
    start_time: Date.now() - 3_600_000,
  },
  {
    id: 3,
    username: 'veli',
    machine: { name: 'CNC Torna 1' },
    description: 'Yağ',
    start_time: Date.now() - 1000,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/machines/faults/timers/') return json(TIMERS);
    if (path === '/machines/faults/') {
      return json({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 9,
            resolved_by_username: 'usta',
            asset_name: 'Kompresör',
            description: 'Basınç',
            resolved_at: '2026-11-02T09:15:00Z',
          },
        ],
      });
    }
    return json({ detail: 'not mocked' }, 404);
  });
});

it('shows the running fault timers, today’s resolved faults and the figures', async () => {
  renderWithProviders(<MaintenanceDashboardPage />);
  expect(screen.getByText('Bakım Dashboard')).toBeInTheDocument();
  expect(await screen.findByText('Mil sesi')).toBeInTheDocument();
  // No description: the fault id stands in.
  expect(screen.getByText('#55')).toBeInTheDocument();
  expect(screen.getByText('Yağ')).toBeInTheDocument();
  expect(await screen.findByText('Kompresör')).toBeInTheDocument();
  expect(screen.getByText('usta')).toBeInTheDocument();

  expect(
    within(document.getElementById('active-fault-timers')!).getByText('3'),
  ).toBeInTheDocument();
  // Two distinct machines and two distinct users.
  expect(
    within(document.getElementById('active-fault-machines')!).getByText('2'),
  ).toBeInTheDocument();
  expect(within(document.getElementById('active-fault-users')!).getByText('2')).toBeInTheDocument();

  const timersCall = urls().find((u) => u.pathname === '/machines/faults/timers/')!;
  expect(Object.fromEntries(timersCall.searchParams)).toEqual({ is_active: 'true' });
  const faultsCall = urls().find((u) => u.pathname === '/machines/faults/')!;
  expect(Object.fromEntries(faultsCall.searchParams)).toEqual({
    resolved_date: localDay(),
    page_size: '100',
  });
});

it('polls every two minutes and Yenile reloads both tables', async () => {
  const { queryClient } = renderWithProviders(<MaintenanceDashboardPage />);
  await screen.findByText('Mil sesi');
  const query = queryClient.getQueryCache().find({ queryKey: maintenanceKeys.faultTimers(true) })!;
  expect(query.observers[0]!.options.refetchInterval).toBe(120_000);

  const before = fetchMock.mock.calls.length;
  fireEvent.click(screen.getAllByRole('button', { name: 'Yenile' })[0]!);
  await waitFor(() => expect(fetchMock.mock.calls.length).toBe(before + 2));
});

it('shows the empty messages when nothing runs', async () => {
  fetchMock.mockImplementation(() => json([]));
  renderWithProviders(<MaintenanceDashboardPage />);
  expect(await screen.findByText('Aktif arıza zamanlayıcısı yok')).toBeInTheDocument();
  expect(await screen.findByText('Bugün çözülen arıza yok')).toBeInTheDocument();
});

it('reads start times the way legacy did', () => {
  // A number is taken as milliseconds; a numeric string may be seconds.
  expect(startMs({ start_time: 1_700_000_000_000 })).toBe(1_700_000_000_000);
  expect(startMs({ started_at: '1700000000' })).toBe(1_700_000_000_000);
  expect(startMs({ started_at: '1700000000000' })).toBe(1_700_000_000_000);
  expect(startMs({ reported_at: '2026-01-01T00:00:00Z' })).toBe(Date.parse('2026-01-01T00:00:00Z'));
  expect(startMs({})).toBeNull();
  expect(clock(3_725_000)).toBe('01:02:05');
});
