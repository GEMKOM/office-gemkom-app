import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { OverviewReportPage } from './OverviewReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const META = {
  preset: 'current_month',
  date_from: '2026-11-01',
  date_to: '2026-11-30',
  compare: true,
  prev_date_from: '2026-10-01',
  prev_date_to: '2026-10-31',
};

const SLICES: Record<string, unknown> = {
  'job-orders': {
    meta: META,
    job_orders: {
      total_active: 42,
      total_completed_in_range: 9,
      total_started_in_range: 14,
      overdue: 3,
      avg_completion_pct: '61.35',
      by_status: { active: 8 },
    },
    costs: {
      total_actual_cost_eur: '1000',
      total_labor_cost_eur: '600',
      jobs_with_cost_data: 4,
      avg_margin_pct: '12.5',
    },
  },
  operations: {
    meta: META,
    manufacturing: { welding_hours: '10', welding_active_users: '3', machining_active_users: 2 },
    quality: { qc_reviews_in_range: 10, qc_reviews_approved: 9, ncrs_open_total: 4 },
  },
  procurement: {
    meta: META,
    procurement: {
      requests_submitted_in_range: 12,
      orders_created_in_range: 5,
      payments_overdue: 2,
    },
    previous_period: {
      procurement: { requests_submitted_in_range: 10, orders_created_in_range: 5 },
    },
  },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const overviewCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname.startsWith('/reports/overview/'));

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/management/reports/overview') {
  return renderWithProviders(
    <>
      <OverviewReportPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const slice = new URL(String(url)).pathname.split('/')[3] ?? '';
    return json(SLICES[slice] ?? {});
  });
});

it('loads only the job-orders slice for the first tab, with this month compared', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Genel Bakış' })).toBeInTheDocument();
  expect(await screen.findByText('42')).toBeInTheDocument();
  expect(overviewCalls().map((u) => u.pathname)).toEqual(['/reports/overview/job-orders/']);
  expect(Object.fromEntries(overviewCalls()[0]!.searchParams)).toEqual({
    preset: 'current_month',
    compare: 'true',
  });
  // The band names both periods.
  expect(document.getElementById('ov-period')).toHaveTextContent('1 Kas 2026 – 30 Kas 2026');
  expect(document.getElementById('ov-prev-period')).toHaveTextContent('1 Eki 2026 – 31 Eki 2026');
  expect(screen.getByText('61,35%')).toBeInTheDocument();
  expect(screen.getByText('Gecikme var')).toBeInTheDocument();
  // Diğer = 1000 - 600.
  expect(screen.getByText('€400,00')).toBeInTheDocument();
});

it('switching tabs loads that tab’s slice and keeps the tab in the URL', async () => {
  renderPage();
  await screen.findByText('42');
  fireEvent.click(screen.getByRole('tab', { name: 'Üretim' }));
  expect(await screen.findByText('Aktif Kullanıcılar')).toBeInTheDocument();
  expect(screen.getByTestId('location')).toHaveTextContent('tab=prod');
  expect(overviewCalls().at(-1)!.pathname).toBe('/reports/overview/operations/');
  // Active users add up as numbers ('3' + 2).
  const users = screen.getByText('Aktif Kullanıcılar').closest('section')!;
  expect(within(users).getByText('5')).toBeInTheDocument();

  // Kalite reads the same slice: no new request.
  const before = overviewCalls().length;
  fireEvent.click(screen.getByRole('tab', { name: 'Kalite' }));
  expect(await screen.findByText('90,0%')).toBeInTheDocument();
  expect(overviewCalls()).toHaveLength(before);
});

it('turning comparison off drops compare=true from the request', async () => {
  renderPage('/management/reports/overview?tab=proc');
  expect(await screen.findByText('Satınalma performansı')).toBeInTheDocument();
  expect(screen.getAllByText('Önceki dönem').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Önceki dönemle karşılaştır' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('compare=false'));
  await waitFor(() =>
    expect(Object.fromEntries(overviewCalls().at(-1)!.searchParams)).toEqual({
      preset: 'current_month',
    }),
  );
  expect(screen.getByText(/Gecikmiş ödeme:/)).toBeInTheDocument();
});

it('a custom range from the URL is sent as dates, without the preset', async () => {
  renderPage('/management/reports/overview?preset=&date_from=2026-10-31&date_to=2026-10-01');
  await screen.findByText('42');
  expect(Object.fromEntries(overviewCalls()[0]!.searchParams)).toEqual({
    date_from: '2026-10-01',
    date_to: '2026-10-31',
    compare: 'true',
  });
});

it('a half-open range says so without a request', async () => {
  renderPage('/management/reports/overview?preset=&date_from=2026-10-01');
  expect(await screen.findByText(/date_from ve date_to birlikte/)).toBeInTheDocument();
  expect(overviewCalls()).toHaveLength(0);
});

it('shows the error of a failed slice', async () => {
  fetchMock.mockImplementation(() => json({ detail: 'Rapor hazırlanamadı' }, 500));
  renderPage();
  expect(await screen.findByText('Rapor hazırlanamadı')).toBeInTheDocument();
  expect(document.getElementById('ov-period')).toHaveTextContent('Veri yüklenemedi');
});
