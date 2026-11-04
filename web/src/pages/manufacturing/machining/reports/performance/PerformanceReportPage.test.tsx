import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { WorkBook } from 'xlsx';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PerformanceReportPage } from './PerformanceReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const writeFile = vi.fn<(book: WorkBook, name: string) => void>();
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: (book: WorkBook, name: string) => writeFile(book, name) };
});

const fetchMock = vi.mocked(authedFetch);

const REPORT = {
  summary: {
    total_users: 2,
    total_hours: 120.25,
    tasks_completed: 5,
    total_tasks_worked: 9,
    avg_efficiency: 92.4,
    on_time_rate: 66.666,
  },
  users: [
    {
      user_id: 7,
      username: 'ahmet.y',
      first_name: 'Ahmet',
      last_name: 'Yılmaz',
      total_hours: 80.5,
      avg_daily_hours: 6.2,
      tasks_worked: 2,
      tasks_completed: 1,
      avg_efficiency: 104,
      on_time_rate: 50,
      tasks: [
        {
          task_key: 'TI-101',
          task_name: 'Flanş',
          job_no: '254-01',
          machine_name: 'Torna 1',
          hours_in_period: 10,
          estimated_hours: 12,
          total_hours_spent: 11,
          efficiency: 109,
          completed_in_period: true,
          on_time: false,
          deadline: '2026-10-20',
        },
        {
          task_key: 'TI-102',
          task_name: 'Mil',
          job_no: '254-02',
          machine_name: 'Torna 1',
          hours_in_period: 4,
          estimated_hours: null,
          total_hours_spent: 4,
          efficiency: null,
          completed_in_period: false,
          on_time: null,
          deadline: null,
        },
      ],
    },
    {
      user_id: 9,
      username: 'mehmet',
      total_hours: 39.75,
      avg_daily_hours: 3.1,
      tasks_completed: 0,
      avg_efficiency: null,
      on_time_rate: null,
      tasks: [{ task_key: 'TI-201', task_name: 'Kama', hours_in_period: 2 }],
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/machining/reports/performance/');

const ROUTE = '/manufacturing/machining/reports/performance';
const groupHeaders = () => document.querySelectorAll('tr[data-group-row="header"]');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 0, 30));
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json(REPORT));
  writeFile.mockReset();
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('asks for the last 30 days and shows the summary', async () => {
  renderWithProviders(<PerformanceReportPage />, { route: ROUTE });
  await waitFor(() => expect(groupHeaders()).toHaveLength(2));
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    start_date: '2026-10-04',
    end_date: '2026-11-02',
  });
  expect(document.getElementById('stat-users')).toHaveTextContent('2');
  expect(document.getElementById('stat-hours')).toHaveTextContent('120,25');
  expect(document.getElementById('stat-completed')).toHaveTextContent('5');
  expect(document.getElementById('stat-worked')).toHaveTextContent('9');
  expect(document.getElementById('stat-efficiency')).toHaveTextContent('92%');
  expect(document.getElementById('stat-ontime')).toHaveTextContent('66,7%');
});

it('starts with the users collapsed and their period figures in the header', async () => {
  renderWithProviders(<PerformanceReportPage />, { route: ROUTE });
  await waitFor(() => expect(groupHeaders()).toHaveLength(2));
  expect(screen.queryByText('TI-101')).not.toBeInTheDocument();

  const ahmet = within(groupHeaders()[0] as HTMLElement);
  expect(ahmet.getByText('Ahmet Yılmaz')).toBeInTheDocument();
  expect(ahmet.getByText('2 görev')).toBeInTheDocument();
  expect(ahmet.getByText('80,50 s')).toBeInTheDocument();
  expect(ahmet.getByText('6,20 s')).toBeInTheDocument();
  expect(ahmet.getByText('104%')).toBeInTheDocument();
  expect(ahmet.getByText('50,0%')).toBeInTheDocument();
  const mehmet = within(groupHeaders()[1] as HTMLElement);
  expect(mehmet.getAllByText('—')).toHaveLength(2);

  fireEvent.click(ahmet.getByRole('button', { name: 'Grubu genişlet' }));
  expect(screen.getByText('TI-101')).toBeInTheDocument();
  expect(screen.getByText('TI-102')).toBeInTheDocument();
  expect(screen.queryByText('TI-201')).not.toBeInTheDocument();
  expect(screen.getByText('2026-10-20')).toBeInTheDocument();
  // Completed: Evet; on time: Hayır in red; unknown on-time: a dash.
  expect(screen.getAllByText('Evet')).toHaveLength(1);
  expect(screen.getAllByText('Hayır')).toHaveLength(2);
});

it('sends the dates from the URL', async () => {
  renderWithProviders(<PerformanceReportPage />, {
    route: `${ROUTE}?start_date=2026-09-01&end_date=2026-09-30`,
  });
  await waitFor(() => expect(reportCalls()).toHaveLength(1));
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    start_date: '2026-09-01',
    end_date: '2026-09-30',
  });
});

it('exports every task with its user first', async () => {
  renderWithProviders(<PerformanceReportPage />, { route: ROUTE });
  await waitFor(() => expect(groupHeaders()).toHaveLength(2));
  fireEvent.click(screen.getByRole('button', { name: 'Dışa Aktar' }));
  await waitFor(() => expect(writeFile).toHaveBeenCalled());
  const [book, name] = writeFile.mock.calls[0]!;
  expect(name).toBe('performance-table-container_2026-11-02.xlsx');
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  expect(sheet.A1?.v).toBe('Kullanıcı');
  expect(sheet.A2?.v).toBe('Ahmet Yılmaz (@ahmet.y)');
  expect(sheet.I2?.v).toBe('109%');
  expect(sheet.J2?.v).toBe('Evet');
  expect(sheet.K2?.v).toBe('Hayır');
  expect(sheet.L2?.v).toBe('2026-10-20');
  expect(sheet.K3?.v).toBe('-');
  expect(sheet.A4?.v).toBe('mehmet');
});

it('says so when the report fails', async () => {
  fetchMock.mockImplementation(() => json({ detail: 'boom' }, 500));
  renderWithProviders(<PerformanceReportPage />, { route: ROUTE });
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Rapor yüklenirken hata oluştu'));
  expect(screen.getByText('Bu dönem için rapor verisi bulunamadı')).toBeInTheDocument();
});
