import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import dayjs from 'dayjs';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { UserReport } from './UserReport';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const USERS = [
  {
    id: 5,
    username: 'ali.k',
    first_name: 'Ali',
    last_name: 'Kaya',
    total_work_hours: 6,
    total_idle_hours: 1.5,
    total_hold_hours: 0.5,
    total_tasks_completed: 2,
    total_tasks_worked_on: 3,
  },
  {
    id: 6,
    username: 'veli',
    total_work_hours: 2,
    total_idle_hours: 6,
    total_tasks_worked_on: 1,
  },
];

const DETAIL = {
  days: [
    {
      date: '2026-10-29',
      tasks: [
        {
          timer_id: 301,
          task_key: 'TI-9',
          task_name: 'Flanş',
          duration_minutes: 125,
          comment: 'Not',
        },
      ],
      idle_periods: [{ start_time: 1, finish_time: 2, duration_minutes: 30 }],
      hold_tasks: [],
    },
    { date: '2026-10-30', tasks: [], idle_periods: [], hold_tasks: [] },
  ],
  task_totals: { 'TI-9': { estimated_hours: 4, total_hours_spent: 3.25 } },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));
const reportCalls = () => calls().filter((u) => u.pathname === '/machining/reports/user-report/');

function renderPage(route = '/manufacturing/reports/user-report/') {
  return renderWithProviders(
    <ModalsProvider>
      <UserReport module="machining" />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/machining/reports/user-report/') return json({ users: USERS });
    if (path === '/machining/reports/user-task-detail/') return json(DETAIL);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('asks for today by default and shows users, figures, warnings and the summary row', async () => {
  renderPage();
  expect(await screen.findByText('Ali Kaya')).toBeInTheDocument();
  const today = dayjs().format('YYYY-MM-DD');
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    start_date: today,
    end_date: today,
  });

  expect(within(document.getElementById('total-users-count')!).getByText('2')).toBeInTheDocument();
  expect(
    within(document.getElementById('total-work-hours')!).getByText('8,00'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('total-idle-hours')!).getByText('7,50'),
  ).toBeInTheDocument();
  // 8 work / 16 office hours.
  expect(within(document.getElementById('avg-efficiency')!).getByText('50,0%')).toBeInTheDocument();

  // veli: 25% efficiency, idle > 1.5 x work.
  expect(screen.getAllByText('Uyarı')).toHaveLength(1);
  const footer = screen.getByText('Özet').closest('tr')!;
  expect(within(footer).getByText('8,00')).toBeInTheDocument();
  // Average of 75,0 and 25,0.
  expect(within(footer).getByText('50,0%')).toBeInTheDocument();
});

it('a picked range in the URL reaches the request', async () => {
  renderPage(
    '/manufacturing/reports/user-report/?date_start=2026-10-01&date_end=2026-10-15',
  );
  await screen.findByText('Ali Kaya');
  expect(Object.fromEntries(reportCalls()[0]!.searchParams)).toEqual({
    start_date: '2026-10-01',
    end_date: '2026-10-15',
  });
});

it('Detaylar loads the task detail for the range and fills the tables', async () => {
  renderPage(
    '/manufacturing/reports/user-report/?date_start=2026-10-29&date_end=2026-10-30',
  );
  await screen.findByText('Ali Kaya');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detaylar' })[0]!);

  const dialog = await screen.findByRole('dialog', { name: 'Ali Kaya (@ali.k)' });
  await waitFor(() => expect(within(dialog).getByText('Görevler')).toBeInTheDocument());
  const detail = calls().find((u) => u.pathname === '/machining/reports/user-task-detail/')!;
  expect(Object.fromEntries(detail.searchParams)).toEqual({
    user_id: '5',
    start_date: '2026-10-29',
    end_date: '2026-10-30',
  });

  fireEvent.click(within(dialog).getByText('Görevler'));
  expect(await within(dialog).findByText('Flanş')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: '#301' })).toHaveAttribute(
    'href',
    '/manufacturing/reports/finished-timers/?module=machining&edit=301',
  );
  // Two days: a Tarih column; totals filled from task_totals.
  expect(within(dialog).getByRole('columnheader', { name: 'Tarih' })).toBeInTheDocument();
  expect(within(dialog).getByText('2s 5dk')).toBeInTheDocument();
  expect(within(dialog).getByText('4,0s')).toBeInTheDocument();
  expect(within(dialog).getByText('3,25s')).toBeInTheDocument();
});
