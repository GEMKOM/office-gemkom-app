import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { MachiningDashboardPage } from './MachiningDashboardPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const HOUR = 60 * 60 * 1000;

let timers: Record<string, unknown>[] = [];

const MACHINES = [
  {
    id: 1,
    name: 'Torna 1',
    machine_type_label: 'Torna',
    is_active: true,
    has_active_timer: true,
    total_estimated_hours: 90,
  },
  { id: 2, name: 'Freze 2', machine_type_label: 'Freze', is_active: true, has_active_timer: false },
  { id: 3, name: 'Freze 3', machine_type_label: 'Freze', is_under_maintenance: true },
];

const OPERATION = {
  key: 'OP-1',
  name: 'Kaba torna',
  part_key: 'PRT-9',
  part_name: 'Mil',
  estimated_hours: 4,
  total_hours_spent: 1,
  due_date: '2026-11-30',
  due_source: 'part',
  projected_late: true,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
  }));

beforeEach(() => {
  timers = [
    {
      id: 11,
      username: 'ahmet',
      machine_name: 'Torna 1',
      issue_key: 'OP-1',
      issue_name: 'Kaba torna',
      start_time: Date.now() - HOUR,
      estimated_hours: 4,
      task_total_hours: 1,
      timer_type: 'productive',
    },
    {
      id: 12,
      username: 'mehmet',
      machine_name: 'Freze 2',
      start_time: Date.now() - 2 * HOUR,
      timer_type: 'downtime',
      downtime_reason_name: 'Malzeme bekleniyor',
    },
  ];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/machining/timers/')
      return json({ count: timers.length, results: timers });
    if (method === 'GET' && path === '/machines/') return json({ count: 3, results: MACHINES });
    if (method === 'GET' && path === '/tasks/operations/OP-1/') return json(OPERATION);
    if (method === 'POST' && path === '/machining/timers/stop/') {
      timers = timers.filter((t) => t.id !== 11);
      return json({});
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists running timers and machines with the legacy figures', async () => {
  renderWithProviders(<MachiningDashboardPage />, { route: '/manufacturing/machining/dashboard/' });
  expect(screen.getByText('Talaşlı İmalat Dashboard')).toBeInTheDocument();
  expect(await screen.findByText('OP-1')).toBeInTheDocument();

  // Downtime rows show the reason instead of a task.
  expect(screen.getByText('Malzeme bekleniyor')).toBeInTheDocument();
  // 4h estimated / (1h booked + ~1h running) = ~200%.
  expect(screen.getByText(/^(199|200),\d{3}%$/)).toBeInTheDocument();
  expect(screen.getByText(/^01:00:\d\d$/)).toBeInTheDocument();
  expect(screen.getByText(/^02:00:\d\d$/)).toBeInTheDocument();

  expect(
    within(document.getElementById('active-timers-count')!).getByText('2'),
  ).toBeInTheDocument();
  expect(within(document.getElementById('active-users-count')!).getByText('2')).toBeInTheDocument();

  // Machines: status words and planned weeks (90h / 45).
  expect(await screen.findByText('Bakımda')).toBeInTheDocument();
  expect(screen.getByText('Boşta')).toBeInTheDocument();
  expect(screen.getByText('2,0 hafta')).toBeInTheDocument();

  const timerCall = calls().find((c) => c.url.pathname === '/machining/timers/')!;
  expect(timerCall.url.searchParams.get('is_active')).toBe('true');
  const machineCall = calls().find((c) => c.url.pathname === '/machines/')!;
  expect(machineCall.url.searchParams.get('used_in')).toBe('machining');
});

it('stops a timer and reloads the list', async () => {
  renderWithProviders(<MachiningDashboardPage />, { route: '/manufacturing/machining/dashboard/' });
  await screen.findByText('OP-1');

  fireEvent.click(screen.getAllByRole('button', { name: 'Durdur' })[0]!);

  await waitFor(() => expect(screen.queryByText('OP-1')).not.toBeInTheDocument());
  const stop = calls().find((c) => c.method === 'POST')!;
  expect(stop.url.pathname).toBe('/machining/timers/stop/');
  expect(stop.body).toMatchObject({ timer_id: 11, finish_time: expect.any(Number) });
  expect(notify.success).toHaveBeenCalledWith('Zamanlayıcı durduruldu');
});

it('opens the operation details from the task cell', async () => {
  renderWithProviders(<MachiningDashboardPage />, { route: '/manufacturing/machining/dashboard/' });
  fireEvent.click(await screen.findByRole('button', { name: /OP-1/ }));

  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('Operasyon Bilgileri')).toBeInTheDocument();
  expect(within(dialog).getByText('Mil')).toBeInTheDocument();
  expect(within(dialog).getByText('30.11.2026 (parça)')).toBeInTheDocument();
  expect(within(dialog).getByText('Geç')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: /Görevler Sayfasında Aç/ })).toHaveAttribute(
    'href',
    '/manufacturing/machining/tasks/list/?filter=PRT-9',
  );
  const opCall = calls().find((c) => c.url.pathname === '/tasks/operations/OP-1/')!;
  expect(opCall.url.searchParams.get('view')).toBe('detail');
});
