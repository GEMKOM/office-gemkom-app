import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { SumReportPage } from './SumReportPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const USER_ROWS = [
  { group_val: 'ahmet.y', total_hours: 6.5, timer_count: 4, avg_duration: 1.625 },
  { group_val: 'mehmet', total_hours: 3, timer_count: 2 },
  // Not in the team: dropped, like legacy.
  { group_val: 'eski', total_hours: 1, timer_count: 1 },
];
const USERS = [
  { id: 7, username: 'ahmet.y', display_name: 'Ahmet Yılmaz' },
  { id: 9, username: 'mehmet', display_name: 'Mehmet Kaya' },
  { id: 11, username: 'ali', display_name: 'Ali Veli' },
];
const MACHINE_ROWS = [
  { group_val: 1, total_hours: 8, timer_count: 4, avg_duration: 2 },
  { group_val: 3, total_hours: 1, timer_count: 0 },
];
const MACHINES = [
  { id: 1, name: 'Torna 1' },
  { id: 2, name: 'Freze 2' },
  { id: 3, name: 'Freze 3' },
];
const JOB_ROWS = [
  { group: '254-01', total_hours: 10, timer_count: 5 },
  { group: '254-02', total_hours: 0, timer_count: 0 },
];

let usersStatus = 200;

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const reportCalls = () => urls().filter((u) => u.pathname === '/machining/timer-report/');
const ROUTE = '/manufacturing/machining/reports/sum-report';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 10, 0));
  usersStatus = 200;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/machining/timer-report/') {
      const groupBy = searchParams.get('group_by');
      return json(
        groupBy === 'machine' ? MACHINE_ROWS : groupBy === 'job_no' ? JOB_ROWS : USER_ROWS,
      );
    }
    if (pathname === '/users/')
      return json(usersStatus === 200 ? USERS : { detail: 'x' }, usersStatus);
    if (pathname === '/machines/') return json({ count: 3, results: MACHINES });
    if (pathname === '/machining/timer-report/export/')
      return Promise.resolve(new Response('xlsx', { status: 200 }));
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const groupCells = () =>
  Array.from(document.querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent);

it("sums today's shift per machining user", async () => {
  renderWithProviders(<SumReportPage />, { route: ROUTE });
  expect(await screen.findByText('Ahmet Yılmaz')).toBeInTheDocument();

  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    group_by: 'user',
    start_after: String(new Date(2026, 10, 2, 7, 0).getTime()),
    start_before: String(new Date(2026, 10, 2, 17, 15).getTime()),
  });
  const usersCall = urls().find((u) => u.pathname === '/users/')!;
  expect(Object.fromEntries(usersCall.searchParams)).toEqual({
    group: 'machining_team',
    is_active: 'all',
  });

  expect(groupCells()).toEqual(['Ahmet Yılmaz', 'Mehmet Kaya']);
  expect(screen.getByText('6,50')).toBeInTheDocument();
  expect(screen.getByText('1,63')).toBeInTheDocument();
  // No avg_duration: hours over timers.
  expect(screen.getByText('1,50')).toBeInTheDocument();

  expect(document.getElementById('total-users-count')).toHaveTextContent('2');
  expect(document.getElementById('total-machines-count')).toHaveTextContent('0');
  expect(document.getElementById('total-hours')).toHaveTextContent('9,50');
  expect(document.getElementById('total-jobs')).toHaveTextContent('2');
});

it('labels users by username when the user list fails', async () => {
  usersStatus = 500;
  renderWithProviders(<SumReportPage />, { route: ROUTE });
  expect(await screen.findByText('ahmet.y')).toBeInTheDocument();
  expect(groupCells()).toEqual(['ahmet.y', 'eski', 'mehmet']);
  expect(notify.error).not.toHaveBeenCalled();
});

it('names machine groups from the machining machines', async () => {
  renderWithProviders(<SumReportPage />, { route: `${ROUTE}?group_by=machine` });
  expect(await screen.findByText('Torna 1')).toBeInTheDocument();
  expect(groupCells()).toEqual(['Torna 1']);
  const machinesCall = urls().find((u) => u.pathname === '/machines/')!;
  expect(machinesCall.searchParams.get('used_in')).toBe('machining');
  expect(document.getElementById('total-machines-count')).toHaveTextContent('1');
  expect(document.getElementById('total-users-count')).toHaveTextContent('0');
});

it('lists job groups as the report sends them', async () => {
  renderWithProviders(<SumReportPage />, { route: `${ROUTE}?group_by=job_no` });
  expect(await screen.findByText('254-01')).toBeInTheDocument();
  expect(groupCells()).toEqual(['254-01']);
  expect(urls().some((u) => u.pathname === '/users/' || u.pathname === '/machines/')).toBe(false);
});

it('sends manual-only and a changed start time', async () => {
  renderWithProviders(<SumReportPage />, { route: ROUTE });
  await screen.findByText('Ahmet Yılmaz');

  fireEvent.click(screen.getByRole('checkbox', { name: 'Sadece Manuel Girişler' }));
  await waitFor(() => expect(reportCalls().at(-1)!.searchParams.get('manual_only')).toBe('true'));

  fireEvent.change(screen.getByLabelText('Başlangıç'), { target: { value: '2026-11-01T08:30' } });
  await waitFor(() =>
    expect(reportCalls().at(-1)!.searchParams.get('start_after')).toBe(
      String(new Date(2026, 10, 1, 8, 30).getTime()),
    ),
  );
  expect(reportCalls().at(-1)!.searchParams.get('manual_only')).toBe('true');
});

it('downloads the server export with the same filters', async () => {
  const createObjectURL = vi.fn(() => 'blob:x');
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  renderWithProviders(<SumReportPage />, { route: `${ROUTE}?group_by=job_no&manual_only=true` });
  await screen.findByText('254-01');
  fireEvent.click(screen.getByRole('button', { name: 'Dışa Aktar' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Rapor başarıyla indiriliyor'));

  const exportCall = urls().find((u) => u.pathname === '/machining/timer-report/export/')!;
  expect(exportCall.searchParams.get('group_by')).toBe('job_no');
  expect(exportCall.searchParams.get('manual_only')).toBe('true');
  expect(click).toHaveBeenCalled();
});
