import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { faultsReportParams, FaultsReportPage } from './FaultsReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    id: 1,
    name: 'CNC Torna 1',
    total_faults: 5,
    breaking_faults_count: 2,
    total_breaking_downtime_seconds: 7200,
    total_non_breaking_duration_seconds: 1800,
    total_downtime_seconds: 9000,
  },
  {
    id: 2,
    name: 'Pres 2',
    total_faults: 1,
    breaking_faults_count: 0,
    total_breaking_downtime_seconds: 0,
    total_non_breaking_duration_seconds: 90_000,
    total_downtime_seconds: 90_000,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const lastParams = () =>
  Object.fromEntries(new URL(String(fetchMock.mock.calls.at(-1)![0])).searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json({ count: 2, next: null, previous: null, results: ROWS }));
});

it('lists machines with their durations and sums the page into the figures', async () => {
  renderWithProviders(<FaultsReportPage />, { route: '/manufacturing/maintenance/reports/faults' });
  expect(await screen.findByText('CNC Torna 1')).toBeInTheDocument();
  // Toplam Duruş 2s; Toplam Arıza Süresi = breaking + non-breaking = 2s 30d.
  expect(screen.getByText('2s')).toBeInTheDocument();
  expect(screen.getByText('2s 30d')).toBeInTheDocument();
  expect(screen.getAllByText('1g 1s').length).toBe(2);

  expect(within(document.getElementById('machines-count')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('faults-count')!).getByText('6')).toBeInTheDocument();
  expect(within(document.getElementById('breaking-count')!).getByText('2')).toBeInTheDocument();
  expect(
    within(document.getElementById('downtime-total')!).getByText('1g 3s 30d'),
  ).toBeInTheDocument();

  expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe('/machines/reports/faults/');
  expect(lastParams()).toEqual({ page: '1', page_size: '20' });
});

it('search and the date shortcut go to the API as legacy sent them', async () => {
  renderWithProviders(
    <>
      <FaultsReportPage />
      <LocationProbe />
    </>,
    { route: '/manufacturing/maintenance/reports/faults?page=2' },
  );
  await screen.findByText('CNC Torna 1');
  fireEvent.change(screen.getByLabelText('Ara (Ad/Kod)'), { target: { value: ' torna ' } });
  fireEvent.click(screen.getByRole('button', { name: /^Tarih/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Bugün' }));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('dateRange')).toBe('today');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(lastParams().reported_at__date).toBeDefined());
  expect(lastParams()).toMatchObject({ page: '1', page_size: '20', search: 'torna' });
});

it('maps the date shortcuts to local days', () => {
  const now = new Date(2026, 10, 2, 1, 30); // 2 Nov 2026 01:30 local
  expect(faultsReportParams({ search: '', dateRange: 'today' }, now)).toEqual({
    reported_at__date: '2026-11-02',
  });
  expect(faultsReportParams({ search: '', dateRange: 'week' }, now)).toEqual({
    reported_at__gte: '2026-10-26',
  });
  expect(faultsReportParams({ search: '', dateRange: 'month' }, now)).toEqual({
    reported_at__gte: '2026-10-02',
  });
  expect(faultsReportParams({ search: '  ', dateRange: '' }, now)).toEqual({});
});
