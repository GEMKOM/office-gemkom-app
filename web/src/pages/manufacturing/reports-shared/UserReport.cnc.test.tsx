import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { UserReport } from './UserReport';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const USERS = [
  {
    id: 8,
    username: 'kesimci',
    total_work_hours: 7,
    total_idle_hours: 1,
    total_hold_hours: 0,
    total_tasks_completed: 4,
    total_tasks_worked_on: 5,
    total_parts_completed: 120,
    total_parts_worked_on: 140,
  },
  {
    id: 9,
    username: 'yardimci',
    total_work_hours: 3,
    total_idle_hours: 0,
    total_parts_worked_on: 10,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

function renderPage(route = '/manufacturing/reports/user-report/') {
  return renderWithProviders(
    <ModalsProvider>
      <UserReport module="cnc_cutting" />
    </ModalsProvider>,
    { route },
  );
}

let detailStatus = 200;

beforeEach(() => {
  detailStatus = 200;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/cnc_cutting/reports/user-report/') return json({ users: USERS });
    if (path === '/cnc_cutting/reports/user-task-detail/') {
      return detailStatus === 200
        ? json({
            days: [
              {
                date: '2026-10-30',
                tasks: [
                  {
                    task_key: 'CNC-77',
                    task_name: 'Sac',
                    nesting_id: 'N-4',
                    material: 'S235',
                    thickness_mm: '12',
                  },
                ],
                idle_periods: [],
                hold_tasks: [],
              },
            ],
            task_totals: { 'CNC-77': { parts_count: 16 } },
          })
        : json({ detail: 'Bulunamadı' }, detailStatus);
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('shows the CNC part columns and sums them in the summary row', async () => {
  renderPage();
  expect(await screen.findByText('kesimci')).toBeInTheDocument();
  expect(screen.getAllByText('CNC Kesim — Kullanıcı Raporu').length).toBeGreaterThan(0);
  expect(calls().some((u) => u.pathname === '/cnc_cutting/reports/user-report/')).toBe(true);
  expect(screen.getByText('Tamamlanan Parça')).toBeInTheDocument();
  expect(screen.getByText('Parça (işlem)')).toBeInTheDocument();

  const footer = screen.getByText('Özet').closest('tr')!;
  expect(within(footer).getByText('120')).toBeInTheDocument();
  expect(within(footer).getByText('150')).toBeInTheDocument();
});

it('the detail lists cuts with their nesting, material and part count', async () => {
  renderPage();
  await screen.findByText('kesimci');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detaylar' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'kesimci' });
  await waitFor(() => expect(within(dialog).getByText('Görevler')).toBeInTheDocument());
  fireEvent.click(within(dialog).getByText('Görevler'));

  expect(await within(dialog).findByRole('link', { name: 'CNC-77' })).toHaveAttribute(
    'href',
    '/planning/cnc-cutting/cuts/?cut=CNC-77',
  );
  expect(within(dialog).getByText('S235')).toBeInTheDocument();
  expect(within(dialog).getByText('12 mm')).toBeInTheDocument();
  expect(within(dialog).getByText('16')).toBeInTheDocument();
  // One day: no Tarih column.
  expect(within(dialog).queryByText('Tarih')).not.toBeInTheDocument();
});

it('a 404 detail says the user is not in the CNC team and closes', async () => {
  detailStatus = 404;
  renderPage();
  await screen.findByText('kesimci');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detaylar' })[0]!);
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Kullanıcı bulunamadı veya CNC kesim ekibinde değil'),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
