import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PERIOD_COMPONENTS, type ComponentAmounts } from '@/api/accounting/periodCost';
import { PeriodCostPage } from './PeriodCostPage';
import { filterRoots, flattenTree, lastClosedMonth } from './periodCostRows';
import dayjs from 'dayjs';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const zero = Object.fromEntries(PERIOD_COMPONENTS.map((c) => [c, '0.00'])) as ComponentAmounts;

const child = {
  job_no: 'PC-01-01',
  title: 'Lid',
  customer_name: 'ACME',
  status: 'active',
  total_weight_kg: null,
  components: { ...zero, qc: '25.00' },
  total: '25.00',
  estimated: '0.00',
  by_month: { '2026-10': '25.00' },
  children: [],
};

const REPORT = {
  start: '2026-10',
  end: '2026-10',
  months: ['2026-10'],
  components: PERIOD_COMPONENTS,
  totals: { ...zero, labor: '18.40', qc: '75.00', total: '93.40' },
  by_month: [],
  rows: [
    {
      job_no: 'PC-01',
      title: 'Ladle',
      customer_name: 'ACME',
      status: 'active',
      total_weight_kg: '10000.00',
      components: { ...zero, labor: '18.40', qc: '75.00' },
      total: '93.40',
      estimated: '10.00',
      by_month: { '2026-10': '93.40' },
      children: [child],
    },
    {
      job_no: 'ZZ-09',
      title: 'Frame',
      customer_name: 'Beta',
      status: 'active',
      total_weight_kg: null,
      components: { ...zero, shipping: '5.00' },
      total: '5.00',
      estimated: '0.00',
      by_month: { '2026-10': '5.00' },
      children: [],
    },
  ],
};

const RECONCILE = {
  job_no: 'PC-01',
  job_nos: ['PC-01', 'PC-01-01'],
  first_month: '2026-07',
  last_month: '2026-10',
  material_not_received: '300.00',
  material_undated: '0.00',
  general_expenses_not_produced: '0.00',
  components: PERIOD_COMPONENTS.map((c) => ({
    component: c,
    lifetime: c === 'material' ? '1000.00' : '0.00',
    dated: c === 'material' ? '700.00' : '0.00',
    estimated: '0.00',
    not_dated: c === 'material' ? '300.00' : '0.00',
    difference: c === 'labor' ? '-2.08' : '0.00',
  })),
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const calls = (path: string) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.pathname === path);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/period_cost_reconcile/')) return json(RECONCILE);
    return json(REPORT);
  });
});

it('flattens expanded rows and keeps children of matching roots', () => {
  const rows = REPORT.rows;
  expect(flattenTree(rows, new Set()).map((r) => r.job_no)).toEqual(['PC-01', 'ZZ-09']);
  expect(flattenTree(rows, 'all').map((r) => [r.job_no, r.level])).toEqual([
    ['PC-01', 0],
    ['PC-01-01', 1],
    ['ZZ-09', 0],
  ]);
  expect(filterRoots(rows, 'lid').map((r) => r.job_no)).toEqual(['PC-01']);
  expect(filterRoots(rows, 'beta').map((r) => r.job_no)).toEqual(['ZZ-09']);
  expect(lastClosedMonth(dayjs('2026-01-15'))).toBe('2025-12');
});

it('loads the month range from the URL and expands children', async () => {
  renderWithProviders(<PeriodCostPage />, {
    route: '/accounting/job-cost-by-period/?start=2026-10&end=2026-10',
  });
  expect(screen.getByRole('heading', { name: 'Dönemsel İş Maliyeti' })).toBeInTheDocument();
  expect(await screen.findByText('Ladle')).toBeInTheDocument();
  const params = calls('/projects/job-orders/period_cost/')[0]!.searchParams;
  expect(params.get('start')).toBe('2026-10');
  expect(params.get('end')).toBe('2026-10');

  expect(screen.queryByText('Lid')).not.toBeInTheDocument();
  expect(screen.getByText('tahmini')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'PC-01 genişlet' }));
  expect(screen.getByText('Lid')).toBeInTheDocument();

  // Footer sums the roots: 93.40 + 5.00.
  expect(within(screen.getByTestId('period-footer')).getByText(/98,40/)).toBeInTheDocument();
});

it('defaults to the month just closed', async () => {
  renderWithProviders(<PeriodCostPage />, { route: '/accounting/job-cost-by-period/' });
  await screen.findByText('Ladle');
  const params = calls('/projects/job-orders/period_cost/')[0]!.searchParams;
  expect(params.get('start')).toBe(lastClosedMonth());
  expect(params.get('end')).toBe(lastClosedMonth());
});

it('opens the reconciliation of a job', async () => {
  renderWithProviders(<PeriodCostPage />, {
    route: '/accounting/job-cost-by-period/?start=2026-10&end=2026-10',
  });
  await screen.findByText('Ladle');
  const row = screen.getByText('Ladle').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Mutabakat' }));
  expect(await screen.findByText('Maliyet Tablosu')).toBeInTheDocument();
  expect(calls('/projects/job-orders/PC-01/period_cost_reconcile/')).toHaveLength(1);
  expect(screen.getByText(/1 alt iş emri dahil/)).toBeInTheDocument();
  // Labor's leftover difference is shown (sign formatting is the locale's).
  expect(screen.getByText(/2,08/)).toBeInTheDocument();
});

it('renders empty when the response leaves fields out', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderWithProviders(<PeriodCostPage />, {
    route: '/accounting/job-cost-by-period/?start=2026-10&end=2026-10',
  });
  expect(await screen.findByText('Bu dönemde maliyet oluşan iş emri yok.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Dönemsel İş Maliyeti' })).toBeInTheDocument();
});
