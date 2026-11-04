import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { shiftMonth, StaffReportPage } from './StaffReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const STAFF = [
  {
    user_id: 20,
    username: 'usta',
    full_name: 'Usta Bey',
    faults_resolved_count: 4,
    timers_count: 6,
    total_timer_seconds: 5400,
  },
  {
    user_id: 21,
    username: 'cirak',
    full_name: '',
    faults_resolved_count: 1,
    timers_count: 2,
    total_timer_seconds: 600,
  },
];

const DETAIL = {
  user: { id: 20, username: 'usta', full_name: 'Usta Bey' },
  resolved_faults: [
    {
      id: 101,
      machine_name: 'CNC Torna 1',
      description: 'Mil sesi',
      is_breaking: true,
      reported_at: '2026-10-01T08:00:00Z',
      resolved_at: '2026-10-01T09:00:00Z',
      resolution_duration_seconds: 3600,
    },
  ],
  timers: [
    {
      id: 7,
      fault_id: 101,
      fault_machine: 'CNC Torna 1',
      start_time_ms: 1,
      finish_time_ms: 2,
      duration_seconds: 3600,
      is_active: false,
    },
    {
      id: 8,
      fault_id: 102,
      fault_machine: 'Pres 2',
      start_time_ms: 3,
      finish_time_ms: null,
      duration_seconds: null,
      is_active: true,
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const requests = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const staffParams = () =>
  requests()
    .filter((u) => u.pathname === '/machines/reports/staff/')
    .map((u) => Object.fromEntries(u.searchParams));

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/maintenance/reports/staff-report') {
  return renderWithProviders(
    <>
      <StaffReportPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/machines/reports/staff/') return json(STAFF);
    if (path === '/machines/reports/staff/20/') return json(DETAIL);
    return json({ detail: 'not mocked' }, 404);
  });
});

it('opens on the current month and sums the rows into the figures', async () => {
  renderPage();
  expect(await screen.findByText('Usta Bey')).toBeInTheDocument();
  // No full name: the username stands in.
  expect(screen.getAllByText('cirak').length).toBeGreaterThan(0);
  const now = new Date();
  expect(staffParams()[0]).toEqual({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  });

  expect(within(document.getElementById('staff-count')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('faults-resolved')!).getByText('5')).toBeInTheDocument();
  expect(within(document.getElementById('timers-count')!).getByText('8')).toBeInTheDocument();
  expect(within(document.getElementById('work-total')!).getByText('1s 40d')).toBeInTheDocument();
});

it('the month navigator steps months and goes to all time', async () => {
  renderPage('/manufacturing/maintenance/reports/staff-report?period=2026-01');
  await screen.findByText('Usta Bey');
  expect(staffParams().at(-1)).toEqual({ year: '2026', month: '1' });

  fireEvent.click(screen.getByRole('button', { name: 'Önceki ay' }));
  await waitFor(() => expect(staffParams().at(-1)).toEqual({ year: '2025', month: '12' }));
  expect(screen.getByTestId('location').textContent).toContain('period=2025-12');

  fireEvent.click(screen.getByRole('button', { name: 'Tüm zamanlar' }));
  await waitFor(() => expect(staffParams().at(-1)).toEqual({}));
  expect(screen.getByTestId('location').textContent).toBe('?period=');
});

it('Detay opens the person’s faults and timers for the same period', async () => {
  renderPage('/manufacturing/maintenance/reports/staff-report?period=2026-10');
  await screen.findByText('Usta Bey');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);

  const dialog = await screen.findByRole('dialog', { name: 'Usta Bey' });
  const detail = requests().find((u) => u.pathname === '/machines/reports/staff/20/')!;
  expect(Object.fromEntries(detail.searchParams)).toEqual({ year: '2026', month: '10' });

  expect(within(dialog).getByText('Ekim 2026')).toBeInTheDocument();
  expect(within(dialog).getByText('1 arıza çözüldü')).toBeInTheDocument();
  expect(within(dialog).getByText('2 zamanlayıcı')).toBeInTheDocument();
  expect(within(dialog).getByText('1 aktif')).toBeInTheDocument();
  expect(within(dialog).getByText('Mil sesi')).toBeInTheDocument();
  expect(within(dialog).getByText('Duruş')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('tab', { name: /Zamanlayıcılar/ }));
  expect(await within(dialog).findByText('Devam Ediyor')).toBeInTheDocument();
  expect(within(dialog).getByText('Arıza #102')).toBeInTheDocument();
});

it('shiftMonth wraps the year and starts from this month on all time', () => {
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  expect(shiftMonth('', 1)).toBe(
    `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`,
  );
});
