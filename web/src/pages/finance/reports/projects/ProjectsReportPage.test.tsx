import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { ProjectsReportPage } from './ProjectsReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    job_no: '254-01',
    distinct_items: 12,
    ordered_qty_by_unit: { kg: '1500.5', adet: 4 },
    total_pos: 3,
    active_pos: 2,
    committed_net_eur: '12500.00',
    unpaid_eur: '300.50',
    pending_pr_estimate_eur: null,
    forecast_eur: '15000',
    top_suppliers_by_spend: [
      { name: 'Çok Uzun Tedarikçi Adı Ltd', total_eur: '9000' },
      { name: 'Kısa', total_eur: '3500' },
      { name: 'Üçüncü', total_eur: '10' },
    ],
    last_activity_at: '2026-10-01T09:00:00Z',
  },
  { job_no: '254-02', unpaid_eur: '0', top_suppliers_by_spend: [] },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/procurement/reports/projects');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/finance/reports/projects') {
  return renderWithProviders(
    <>
      <ProjectsReportPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json({ results: ROWS }));
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('loads the report ordered by job_no and renders the legacy columns', async () => {
  renderPage();
  expect(screen.getByRole('heading', { name: 'Proje Raporu' })).toBeInTheDocument();
  expect(await screen.findByText('254-01')).toBeInTheDocument();

  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({ ordering: 'job_no' });
  expect(screen.getByText('1.500,5 kg, 4 adet')).toBeInTheDocument();
  expect(screen.getByText('12.500,00 EUR')).toBeInTheDocument();
  // Null money reads 0,00 EUR, as legacy formatCurrency.
  expect(screen.getAllByText('0,00 EUR').length).toBeGreaterThan(0);
  // Two suppliers, long names cut at 15 characters with the full name as title.
  expect(screen.getByTitle('Çok Uzun Tedarikçi Adı Ltd')).toHaveTextContent('Çok Uzun Tedari...');
  expect(screen.queryByText('Üçüncü')).toBeNull();
  expect(within(document.getElementById('projects-count')!).getByText('2')).toBeInTheDocument();
});

it('sends the filters and the sort as the legacy API params', async () => {
  renderPage('/finance/reports/projects?include_empty=true&created_gte=2026-01-01');
  await screen.findByText('254-01');
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    created_gte: '2026-01-01',
    include_empty: 'true',
    ordering: 'job_no',
  });

  fireEvent.change(screen.getByLabelText('İş Numarası'), { target: { value: '254' } });
  await waitFor(() =>
    expect(reportCalls().some((u) => u.searchParams.get('job_no') === '254')).toBe(true),
  );

  fireEvent.click(screen.getByRole('button', { name: /Tahmin \(EUR\)/ }));
  await waitFor(() =>
    expect(
      new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('ordering'),
    ).toBe('forecast_eur'),
  );
  await waitFor(() =>
    expect(Object.fromEntries(reportCalls().at(-1)!.searchParams)).toEqual({
      job_no: '254',
      created_gte: '2026-01-01',
      include_empty: 'true',
      ordering: 'forecast_eur',
    }),
  );
});

it('notifies with the legacy message when the report fails', async () => {
  fetchMock.mockImplementation(() => json({ error: 'Rapor hatası' }, 500));
  renderPage();
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Proje raporu yüklenirken hata oluştu: Rapor hatası'),
  );
  expect(screen.getByText('Proje raporu verisi bulunamadı.')).toBeInTheDocument();
});
