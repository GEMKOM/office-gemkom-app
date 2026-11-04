import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { WorkBook } from 'xlsx';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { countWeekdays } from './columns';
import { UserWorkHoursPage } from './UserWorkHoursPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const writeFile = vi.fn<(book: WorkBook, name: string) => void>();
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return { ...actual, writeFile: (book: WorkBook, name: string) => writeFile(book, name) };
});

const fetchMock = vi.mocked(authedFetch);

const REPORT = {
  date_range: { start: '2026-11-01', end: '2026-11-30' },
  users: [
    {
      employee_id: 1,
      employee_username: 'ahmet',
      employee_full_name: 'Ahmet Yılmaz',
      total_hours: '162.5',
      by_overtime_type: {
        regular: { hours: '150', job_nos: ['254-01', '254-02'] },
        after_hours: { hours: '12.5', job_nos: ['254-01'] },
      },
    },
    {
      employee_id: 2,
      employee_username: 'mehmet',
      employee_full_name: 'Mehmet Kaya',
      total_hours: 0,
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const reportCalls = () =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/welding/reports/user-work-hours/');

function renderPage(route = '/manufacturing/welding/reports/user-work-hours') {
  return renderWithProviders(<UserWorkHoursPage />, { route });
}

beforeEach(() => {
  // Only Date is faked, so the default range is a known month (Nov 2026: 21 weekdays).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15, 10, 0));
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => json(REPORT));
  writeFile.mockReset();
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'warning');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('counts weekdays on local days, both ends included', () => {
  expect(countWeekdays('2026-11-01', '2026-11-30')).toBe(21);
  expect(countWeekdays('2026-11-07', '2026-11-08')).toBe(0);
  expect(countWeekdays('2026-11-09', '2026-11-09')).toBe(1);
});

it('loads the current month and compares regular hours with 9 per weekday', async () => {
  renderPage();
  expect(screen.getByText('Çalışan Çalışma Saatleri Raporu')).toBeInTheDocument();
  expect(await screen.findByText('Ahmet Yılmaz')).toBeInTheDocument();

  // Local first and last day of the month (legacy's toISOString could shift them a day).
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    date_after: '2026-11-01',
    date_before: '2026-11-30',
  });

  expect(screen.getByText('150,00/189')).toBeInTheDocument();
  expect(screen.getByText('Eksik')).toBeInTheDocument();
  expect(screen.getByText('12,50 saat')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'İş Numaraları (2)' })).toBeInTheDocument();
  // No regular hours: 0 of the expected.
  expect(screen.getByText('0/189')).toBeInTheDocument();
});

it('takes the range from the URL', async () => {
  renderPage(
    '/manufacturing/welding/reports/user-work-hours?date_after=2026-10-05&date_before=2026-10-09',
  );
  await screen.findByText('Ahmet Yılmaz');
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    date_after: '2026-10-05',
    date_before: '2026-10-09',
  });
});

it('asks for both dates and sends nothing while one is missing', async () => {
  renderPage('/manufacturing/welding/reports/user-work-hours?date_before=');
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith('Lütfen başlangıç ve bitiş tarihlerini seçin'),
  );
  expect(
    screen.getByText('Rapor verisi bulunamadı. Lütfen tarih aralığını kontrol edin.'),
  ).toBeInTheDocument();
  expect(reportCalls()).toHaveLength(0);
});

it('refuses a start after the end', async () => {
  renderPage(
    '/manufacturing/welding/reports/user-work-hours?date_after=2026-11-20&date_before=2026-11-10',
  );
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Başlangıç tarihi bitiş tarihinden sonra olamaz'),
  );
  expect(reportCalls()).toHaveLength(0);
});

it('exports the report named after its date range', async () => {
  renderPage();
  await screen.findByText('Ahmet Yılmaz');
  fireEvent.click(screen.getByRole('button', { name: "Excel'e Aktar" }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Rapor başarıyla dışa aktarıldı'),
  );

  const [book, name] = writeFile.mock.calls[0]!;
  expect(name).toBe('calisan_calisma_saatleri_2026-11-01_2026-11-30.xlsx');
  const sheet = book.Sheets['Çalışan Çalışma Saatleri']!;
  expect(sheet.A1?.v).toBe('Çalışan');
  expect(sheet.A2?.v).toBe('Ahmet Yılmaz');
  expect(sheet.C2?.v).toBe(162.5);
  expect(sheet.E2?.v).toBe('254-01, 254-02');
  expect(sheet.I2?.v).toBe('-');
});

it('warns instead of exporting an empty report', async () => {
  fetchMock.mockImplementation(() => json({ date_range: REPORT.date_range, users: [] }));
  renderPage();
  await waitFor(() => expect(reportCalls()).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: "Excel'e Aktar" }));
  expect(notify.warning).toHaveBeenCalledWith('Dışa aktarılacak veri bulunamadı');
  expect(writeFile).not.toHaveBeenCalled();
});
