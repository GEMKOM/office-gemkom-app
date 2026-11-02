import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { countFlags, decorate, summarize, totals } from './weldingReport';
import { weldingDefaults, weldingParams, WeldingReportPage } from './WeldingReportPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
// Mantine modals and selects are slow in jsdom when the suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

const ROWS = [
  {
    date: '2026-10-05',
    user_id: 1,
    user_full_name: 'Ali Kaya',
    request_ids: [501],
    planned_jobs: ['270-01'],
    worked_jobs: ['270-01'],
    planned_hours: '3.00',
    logged_overtime_hours: '3.00',
    logged_regular_hours: '8.00',
    variance_hours: '0.00',
    flags: [],
    lines: [{ job_no: '270-01', overtime_type: 'after_hours', hours: '3.00' }],
  },
  {
    date: '2026-10-06',
    user_id: 2,
    user_full_name: 'Veli Can',
    request_ids: [502],
    planned_jobs: ['270-02'],
    worked_jobs: [],
    planned_hours: '2.00',
    logged_overtime_hours: '0.00',
    logged_regular_hours: '0.00',
    variance_hours: '-2.00',
    flags: ['no_record'],
    lines: [],
  },
  {
    date: '2026-10-30',
    user_id: 1,
    user_full_name: 'Ali Kaya',
    request_ids: [503],
    planned_jobs: ['270-01'],
    worked_jobs: [],
    planned_hours: '4.00',
    logged_overtime_hours: '0.00',
    logged_regular_hours: '0.00',
    variance_hours: '-4.00',
    flags: ['pending_entry'],
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((u) => u.pathname === '/overtime/requests/welding_report/');

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/overtime/requests/welding_report/') {
      return json({ meta: { welding_data_through: '2026-10-28' }, rows: ROWS });
    }
    if (path === '/overtime/requests/welding_operators/')
      return json([{ id: 1, full_name: 'Ali Kaya' }]);
    return json({ detail: 'not mocked' }, 404);
  });
});

it('figures leave out rows still waiting for welding entries', () => {
  const rows = decorate(ROWS);
  const summary = summarize(rows);
  expect(summary.map((s) => [s.label, s.value])).toEqual([
    ['Talep edilen mesai süresi', '5,00 saat'],
    ['İşlenen mesai saati', '3,00 saat'],
    ['Fark', '-2,00 saat'],
    ['İşlenen normal mesai', '8,00 saat'],
    ['Sapmalı kayıt', '1 / 2'],
    ['Veri bekleyen kayıt', '1'],
  ]);
  expect(countFlags(rows).map((f) => [f.flag, f.count, f.share])).toEqual([
    ['no_record', 1, 50],
    ['pending_entry', 1, (1 / 3) * 100],
  ]);
  expect(totals(rows)).toMatchObject({
    label: 'Toplam (veri bekleyenler hariç)',
    planned_hours: '5,00 saat',
    variance_hours: '-2,00 saat',
    flags_label: '1 / 2 sapmalı',
  });
});

it('sends this month and the 0,5 tolerance by default; a cleared tolerance stays the default', () => {
  const defaults = weldingDefaults(new Date(2026, 10, 17));
  expect(weldingParams(defaults)).toEqual({
    start_date: '2026-11-01',
    end_date: '2026-11-17',
    tolerance: '0.5',
  });
  expect(
    weldingParams({ ...defaults, tolerance: '0', only_outliers: '1', user: '4', job_no: '270' }),
  ).toEqual({
    start_date: '2026-11-01',
    end_date: '2026-11-17',
    tolerance: '0',
    only_outliers: '1',
    user: '4',
    job_no: '270',
  });
  expect(weldingParams({ ...defaults, tolerance: '' }).tolerance).toBe('0.5');
});

it('renders the notice, the summary, the flags and the rows; Detay opens the day', async () => {
  renderWithProviders(<WeldingReportPage />, {
    route: '/general/overtime/welding-report?start_date=2026-10-01&end_date=2026-10-31',
  });
  expect(await screen.findByText('Veli Can')).toBeInTheDocument();
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    tolerance: '0.5',
  });

  expect(screen.getByText(/Kaynak zaman kayıtları en son/)).toBeInTheDocument();
  expect(screen.getByText('Talep edilen mesai süresi')).toBeInTheDocument();
  expect(screen.getByText('Toplam (veri bekleyenler hariç)')).toBeInTheDocument();
  expect(screen.getByText('1 / 2 sapmalı')).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Kaynak Zaman Kayıtları')).toBeInTheDocument();
});

it('the outlier pill reaches the request', async () => {
  renderWithProviders(<WeldingReportPage />, {
    route: '/general/overtime/welding-report?only_outliers=1&user=1',
  });
  await screen.findByText('Veli Can');
  expect(reportCalls()[0]!.searchParams.get('only_outliers')).toBe('1');
  expect(reportCalls()[0]!.searchParams.get('user')).toBe('1');
});

it('survives an empty response', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderWithProviders(<WeldingReportPage />, { route: '/general/overtime/welding-report' });
  await waitFor(() =>
    expect(
      screen.getByText('Seçilen kriterlerde kaynak mesai kaydı bulunamadı'),
    ).toBeInTheDocument(),
  );
  expect(screen.getByText('Veri yok')).toBeInTheDocument();
});
