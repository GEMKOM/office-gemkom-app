import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { computeTotals, operatorRows, summaryLines } from './machiningReport';
import { MACHINING_DEFAULTS, machiningParams, MachiningReportPage } from './MachiningReportPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
vi.setConfig({ testTimeout: 20_000 });

// One entry-day (talep 7, Ali, 5 Ekim) with two operations, and one more day.
const ROWS = [
  {
    date: '2026-10-05',
    request_id: 7,
    user_id: 1,
    user_full_name: 'Ali Kaya',
    job_no: '272-01',
    operation_key: 'PT-1-OP1',
    operation_name: 'Freze',
    part_name: 'Mil',
    worked: true,
    worked_hours: '2.5',
    overtime_window_hours: '4',
    outside_window_hours: '1',
    timer_hours: '3.5',
    timers: [
      {
        start_at: '2026-10-05T15:00:00',
        finish_at: '2026-10-05T18:30:00',
        total_hours: '3.5',
        in_window_hours: '2.5',
        outside_window_hours: '1',
      },
    ],
  },
  {
    date: '2026-10-05',
    request_id: 7,
    user_id: 1,
    user_full_name: 'Ali Kaya',
    job_no: '272-01',
    operation_key: 'PT-1-OP2',
    operation_name: '',
    part_name: 'Mil',
    worked: false,
    worked_hours: '0',
    overtime_window_hours: '4',
  },
  {
    date: '2026-10-06',
    request_id: 8,
    user_id: 2,
    user_full_name: 'Veli Can',
    job_no: '300',
    operation_key: 'PT-9-OP1',
    operation_name: 'Torna',
    part_name: 'Flanş',
    worked: true,
    worked_hours: '1',
    overtime_window_hours: '2',
  },
];

const SUMMARY = {
  requested_hours: '6',
  worked_hours: '4.5',
  selected_operation_hours: '3.5',
  other_work_hours: '1',
  downtime_hours: '0.5',
  no_timer_hours: '1',
  operator_count: 2,
  request_count: 2,
  entry_count: 2,
  day_count: 2,
  operators: [
    {
      user_id: 1,
      full_name: 'Ali Kaya',
      requested_hours: '4',
      worked_hours: '3',
      no_timer_hours: '1',
    },
    {
      user_id: 2,
      full_name: 'Veli Can',
      requested_hours: '2',
      worked_hours: '1.5',
      no_timer_hours: '0',
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const callsTo = (path: string) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((u) => u.pathname === path);

let summaryResponse: () => Promise<Response> = () => json(SUMMARY);

beforeEach(() => {
  fetchMock.mockReset();
  summaryResponse = () => json(SUMMARY);
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/overtime/requests/machining_report/') return json(ROWS);
    if (path === '/overtime/requests/machining_report_summary/') return summaryResponse();
    if (path === '/overtime/requests/machining_operators/')
      return json([{ id: 1, full_name: 'Ali Kaya' }]);
    if (path === '/projects/job-orders/dropdown/') return json([]);
    return json({ detail: 'not mocked' }, 404);
  });
});

it('counts each (talep, operatör, gün) window once in the totals', () => {
  expect(computeTotals(ROWS)).toEqual({
    rowCount: 3,
    workedCount: 2,
    workedHours: 3.5,
    windowHours: 6,
    operatorCount: 2,
    dayCount: 2,
  });
  const lines = summaryLines(SUMMARY, ROWS);
  expect(lines.map((l) => [l.label, l.value, l.share])).toEqual([
    ['Talep edilen toplam mesai', '6,00 saat', '%100'],
    ['Mesai içinde toplam çalışılan', '4,50 saat', '%75'],
    ['Talepte seçilen operasyonlarda', '3,50 saat', '%58,3'],
    ['Başka işlerde', '1,00 saat', '%16,7'],
    ['Duruş / mola kaydı', '0,50 saat', '%8,3'],
    ['Zamanlayıcı kaydı olmayan süre', '1,00 saat', '%16,7'],
    ['Seçilen operasyonlardan çalışılanlar', '2 / 3', ''],
  ]);
  expect(summaryLines({ ...SUMMARY, requested_hours: '0' }, ROWS)).toEqual([]);
  expect(operatorRows(SUMMARY).map((o) => o.ratio)).toEqual([75, 75]);
});

it('sends only the set filters; several İş No picks go out comma-joined', () => {
  expect(machiningParams(MACHINING_DEFAULTS)).toEqual({});
  expect(
    machiningParams({
      start_date: '2026-10-01',
      end_date: '',
      job_no: ['272', '300-05'],
      user: '3',
    }),
  ).toEqual({ start_date: '2026-10-01', job_no: '272,300-05', user: '3' });
});

it('renders the summary, the operators and the rows with the totals; Detay shows the timers', async () => {
  renderWithProviders(<MachiningReportPage />, {
    route: '/general/overtime/machining-report?start_date=2026-10-01&job_no=272&job_no=300&user=1',
  });
  expect(await screen.findByText('Torna')).toBeInTheDocument();

  for (const path of [
    '/overtime/requests/machining_report/',
    '/overtime/requests/machining_report_summary/',
  ]) {
    const params = callsTo(path)[0]!.searchParams;
    expect(Object.fromEntries(params)).toEqual({
      start_date: '2026-10-01',
      job_no: '272,300',
      user: '1',
    });
  }

  expect(screen.getByText('Talep edilen toplam mesai')).toBeInTheDocument();
  expect(screen.getByText('Operatör Bazında')).toBeInTheDocument();
  // The operation key stands in for a missing name.
  expect(screen.getByText('PT-1-OP2')).toBeInTheDocument();

  // Footer: worked / rows, worked hours, windows counted once.
  const foot = document.querySelector('tfoot') as HTMLElement;
  expect(within(foot).getByText('Toplam')).toBeInTheDocument();
  expect(within(foot).getByText('2 / 3')).toBeInTheDocument();
  expect(within(foot).getByText('3,50 saat')).toBeInTheDocument();
  expect(within(foot).getByText('6,00 saat')).toBeInTheDocument();

  // Newest first by default.
  expect(
    screen.getByText('Torna').compareDocumentPosition(screen.getByText('Freze')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[1]!);
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Freze — 05.10.2026')).toBeInTheDocument();
  expect(within(dialog).getByText('Timer Kayıtları')).toBeInTheDocument();
  expect(within(dialog).getByText(/mesai penceresinin dışında kaldığı/)).toBeInTheDocument();
});

it('a failed summary clears the page like the legacy Promise.all', async () => {
  summaryResponse = () => json({ detail: 'boom' }, 500);
  renderWithProviders(<MachiningReportPage />, { route: '/general/overtime/machining-report' });
  await waitFor(() =>
    expect(
      screen.getByText('Seçilen kriterlerde operasyonlu onaylı mesai bulunamadı'),
    ).toBeInTheDocument(),
  );
  expect(screen.queryByText('Torna')).not.toBeInTheDocument();
  expect(screen.getAllByText('Veri yok')).toHaveLength(2);
});
