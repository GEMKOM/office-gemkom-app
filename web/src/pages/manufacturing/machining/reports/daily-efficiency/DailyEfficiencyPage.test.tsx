import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import dayjs from 'dayjs';
import type { WorkBook } from 'xlsx';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DailyEfficiencyPage, previousBusinessDay } from './DailyEfficiencyPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const writeFile = vi.fn<(book: WorkBook, name: string) => void>();
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: (book: WorkBook, name: string) => writeFile(book, name) };
});

const fetchMock = vi.mocked(authedFetch);

const REPORT = {
  users: [
    {
      user_id: 7,
      username: 'ahmet.y',
      first_name: 'Ahmet',
      last_name: 'Yılmaz',
      total_daily_hours: 7.5,
      tasks: [
        {
          task_key: 'TI-101',
          task_name: 'Flanş delik delme ve kılavuz çekme operasyonu',
          job_no: '254-01',
          machine_name: 'Torna 1',
          daily_duration_hours: 5,
          estimated_hours: 6,
          total_hours_spent: 5.5,
          efficiency: 109.1,
          completed_on_date: true,
        },
        {
          task_key: 'TI-102',
          task_name: 'Mil tornalama',
          job_no: '254-02',
          machine_name: 'Torna 1',
          daily_duration_hours: 2.5,
          estimated_hours: 2,
          total_hours_spent: 3,
          efficiency: 66.7,
          completed_on_date: false,
        },
      ],
    },
    {
      user_id: 9,
      username: 'mehmet',
      total_daily_hours: 3,
      tasks: [
        {
          task_key: 'TI-201',
          task_name: 'Kama yuvası',
          job_no: '254-03',
          machine_name: 'Freze 2',
          daily_duration_hours: 3,
          estimated_hours: 2.7,
          total_hours_spent: 3,
          efficiency: 90,
        },
      ],
    },
    // No tasks: counted in the figures, no group in the table.
    { user_id: 11, username: 'ali', total_daily_hours: 0, tasks: [] },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/machining/reports/daily-efficiency/');

const ROUTE = '/manufacturing/machining/reports/daily-efficiency';

function renderPage(route = ROUTE) {
  return renderWithProviders(<DailyEfficiencyPage />, { route });
}

const groupHeaders = () => document.querySelectorAll('tr[data-group-row="header"]');

beforeEach(() => {
  // Monday 2 Nov 2026, 00:30 local: the default is Friday, on the local calendar.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 0, 30));
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json(REPORT));
  writeFile.mockReset();
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('defaults to the previous business day', () => {
  expect(previousBusinessDay(dayjs('2026-11-02T00:30'))).toBe('2026-10-30');
  expect(previousBusinessDay(dayjs('2026-11-04T10:00'))).toBe('2026-11-03');
  expect(previousBusinessDay(dayjs('2026-11-01T10:00'))).toBe('2026-10-31');
});

it("groups each user's tasks under a header with the day's total hours", async () => {
  renderPage();
  expect(await screen.findByText('TI-101')).toBeInTheDocument();

  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({ date: '2026-10-30' });

  const headers = groupHeaders();
  expect(headers).toHaveLength(2);
  const first = within(headers[0] as HTMLElement);
  expect(first.getByText('Ahmet Yılmaz')).toBeInTheDocument();
  expect(first.getByText('(@ahmet.y)')).toBeInTheDocument();
  expect(first.getByText('2 görev')).toBeInTheDocument();
  expect(first.getByText(/Toplam: 7,50 saat/)).toBeInTheDocument();
  // No full name: the username alone.
  const second = within(headers[1] as HTMLElement);
  expect(second.getByText('mehmet')).toBeInTheDocument();
  expect(second.queryByText(/@mehmet/)).not.toBeInTheDocument();
  expect(second.getByText(/Toplam: 3,00 saat/)).toBeInTheDocument();

  // Long names are cut with the full text in a tooltip.
  expect(screen.getByTitle('Flanş delik delme ve kılavuz çekme operasyonu')).toHaveTextContent(
    'Flanş delik delme ve kılavuz ç...',
  );
  expect(screen.getByRole('link', { name: 'TI-101' })).toHaveAttribute(
    'href',
    '/manufacturing/machining/tasks/list/?task=TI-101',
  );
  expect(screen.getByText('109%')).toBeInTheDocument();
  // The completion column only comes with include_worked.
  expect(screen.queryByText('Tarihte tamamlandı')).not.toBeInTheDocument();

  // Figures: every user, every task, the plain average of the efficiencies.
  expect(document.getElementById('total-users-count')).toHaveTextContent('3');
  expect(document.getElementById('total-work-hours')).toHaveTextContent('10,50');
  expect(document.getElementById('total-tasks')).toHaveTextContent('3');
  expect(document.getElementById('avg-efficiency')).toHaveTextContent('89%');
});

it('collapses and expands a group', async () => {
  renderPage();
  await screen.findByText('TI-101');
  const toggle = within(groupHeaders()[0] as HTMLElement).getByRole('button', {
    name: 'Grubu daralt',
  });
  fireEvent.click(toggle);
  expect(screen.queryByText('TI-101')).not.toBeInTheDocument();
  expect(screen.queryByText('TI-102')).not.toBeInTheDocument();
  expect(screen.getByText('TI-201')).toBeInTheDocument();
  fireEvent.click(
    within(groupHeaders()[0] as HTMLElement).getByRole('button', { name: 'Grubu genişlet' }),
  );
  expect(screen.getByText('TI-101')).toBeInTheDocument();
});

it('asks for every worked task and shows whether it was completed that day', async () => {
  renderPage();
  await screen.findByText('TI-101');
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'O gün çalışılan tüm görevler (tamamlanmamış dahil)' }),
  );
  expect(await screen.findByText('Tarihte tamamlandı')).toBeInTheDocument();
  expect(Object.fromEntries(reportCalls().at(-1)!.searchParams)).toEqual({
    date: '2026-10-30',
    include_worked: 'true',
  });
  expect(screen.getAllByText('Evet')).toHaveLength(1);
  expect(screen.getAllByText('Hayır')).toHaveLength(1);
});

it('takes the day from the URL', async () => {
  renderPage(`${ROUTE}?date=2026-10-21&include_worked=true`);
  await screen.findByText('TI-101');
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    date: '2026-10-21',
    include_worked: 'true',
  });
});

it('exports the rows with the user in the first column', async () => {
  renderPage();
  await screen.findByText('TI-101');
  fireEvent.click(screen.getByRole('button', { name: 'Dışa Aktar' }));
  await waitFor(() => expect(writeFile).toHaveBeenCalled());
  const [book, name] = writeFile.mock.calls[0]!;
  expect(name).toBe('users-report-table-container_2026-11-02.xlsx');
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  expect(sheet.A1?.v).toBe('Kullanıcı');
  expect(sheet.B1?.v).toBe('TI No');
  expect(sheet.A2?.v).toBe('Ahmet Yılmaz (@ahmet.y)');
  expect(sheet.B2?.v).toBe('TI-101');
  // The whole name, not the cut one.
  expect(sheet.C2?.v).toBe('Flanş delik delme ve kılavuz çekme operasyonu');
  expect(sheet.F2?.v).toBe(5);
  expect(sheet.I2?.v).toBe('109%');
  expect(sheet.A4?.v).toBe('mehmet');
});

it('empties the table and says so when the report fails', async () => {
  fetchMock.mockImplementation(() => json({ detail: 'boom' }, 500));
  renderPage();
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Rapor yüklenirken hata oluştu'));
  expect(screen.getByText('Bu tarih için rapor verisi bulunamadı')).toBeInTheDocument();
});
