import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { MonthlyMetricsPage } from './MonthlyMetricsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const REPORT = {
  monthly: [
    {
      period: '2026-09',
      total_faults: 4,
      breaking_faults: 2,
      resolved_faults: 4,
      unresolved_faults: 0,
      resolve_rate_pct: 100,
      avg_resolution_seconds: 3600,
      min_resolution_seconds: 600,
      max_resolution_seconds: 7200,
      total_breaking_downtime_seconds: 5400,
      unique_machines_affected: 3,
      unique_resolvers: 2,
    },
    {
      period: '2026-10',
      total_faults: 8,
      breaking_faults: 2,
      resolved_faults: 3,
      unresolved_faults: 5,
      resolve_rate_pct: 37.5,
      avg_resolution_seconds: null,
      min_resolution_seconds: null,
      max_resolution_seconds: null,
      total_breaking_downtime_seconds: null,
      unique_machines_affected: 6,
      unique_resolvers: 1,
    },
  ],
  summary: {
    total_faults_all_time: 1284,
    total_resolved_all_time: 1200,
    overall_avg_resolution_seconds: 5400,
    total_breaking_downtime_all_time: 90_000,
    overall_avg_faults_per_month: 6,
    overall_avg_breaking_per_month: 1.25,
    busiest_month: '2026-10',
    fastest_month: '2026-09',
  },
};

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(REPORT), { status: 200 })),
  );
});

const periods = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]!.textContent);

it('shows the summary, the highlights and the months newest first', async () => {
  renderWithProviders(<MonthlyMetricsPage />);
  // The first render of the full table can be slow on a busy test run.
  await screen.findAllByText('Eylül 2026', undefined, { timeout: 5000 });
  await waitFor(() => expect(periods()).toEqual(['Ekim 2026', 'Eylül 2026']));
  expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe(
    '/machines/reports/monthly-metrics/',
  );

  expect(within(document.getElementById('total-faults')!).getByText('1.284')).toBeInTheDocument();
  expect(
    within(document.getElementById('avg-resolution')!).getByText('1s 30d'),
  ).toBeInTheDocument();
  expect(within(document.getElementById('total-downtime')!).getByText('1g 1s')).toBeInTheDocument();
  expect(
    within(document.getElementById('avg-faults-per-month')!).getByText('6,0'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('avg-breaking-per-month')!).getByText('1,3'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('busiest-month')!).getByText('Ekim 2026'),
  ).toBeInTheDocument();

  // Breaking share, resolve rate, and '-' for a month without resolutions.
  expect(screen.getByText('25%')).toBeInTheDocument();
  expect(screen.getByText('50%')).toBeInTheDocument();
  expect(screen.getByText('37.5%')).toBeInTheDocument();
  expect(screen.getByText('10d')).toBeInTheDocument();
});

it('sorts the loaded months by a column', async () => {
  renderWithProviders(<MonthlyMetricsPage />);
  // The first render of the full table can be slow on a busy test run.
  await screen.findAllByText('Eylül 2026', undefined, { timeout: 5000 });
  await waitFor(() => expect(periods()).toEqual(['Ekim 2026', 'Eylül 2026']));
  fireEvent.click(screen.getByText('Dönem'));
  await waitFor(() => expect(periods()).toEqual(['Eylül 2026', 'Ekim 2026']));
});
