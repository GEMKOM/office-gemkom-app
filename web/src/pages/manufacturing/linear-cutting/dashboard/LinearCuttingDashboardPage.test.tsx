import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { LinearCuttingDashboardPage } from './LinearCuttingDashboardPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

let timers: Record<string, unknown>[] = [];

const MACHINES = [
  { id: 1, name: 'Testere 1', machine_type: 'saw', is_active: true },
  { id: 2, name: 'Testere 2', machine_type: 'saw', is_active: true },
  { id: 3, name: 'Testere 3', machine_type: 'saw', is_active: false },
];

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
      id: 31,
      username: 'ali',
      machine_fk: 1,
      machine_name: 'Testere 1',
      issue_key: 'LC-5',
      issue_name: 'Profil kesim',
      start_time: Date.now() - 5000,
    },
    // A finished timer the server may still return: dropped like legacy.
    { id: 30, username: 'veli', machine_fk: 2, issue_key: 'LC-4', start_time: 1, finish_time: 2 },
  ];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/linear_cutting/timers/')
      return json({ count: timers.length, results: timers });
    if (method === 'GET' && path === '/machines/') return json({ count: 3, results: MACHINES });
    if (method === 'GET' && path === '/linear_cutting/tasks/')
      return json({ count: 57, results: [{}] });
    if (method === 'POST' && path === '/linear_cutting/timers/stop/') {
      timers = [];
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

it('shows running timers, machine status from them and the task count', async () => {
  renderWithProviders(<LinearCuttingDashboardPage />, {
    route: '/planning/linear-cutting/dashboard/',
  });
  expect(await screen.findByText('LC-5')).toBeInTheDocument();
  expect(screen.getByText('Profil kesim')).toBeInTheDocument();
  expect(screen.queryByText('LC-4')).not.toBeInTheDocument();

  await waitFor(() =>
    expect(
      within(document.getElementById('total-tasks-count')!).getByText('57'),
    ).toBeInTheDocument(),
  );
  // Active machines come from the machine list, not from the timers.
  expect(
    within(document.getElementById('active-machines-count')!).getByText('2'),
  ).toBeInTheDocument();
  // Testere 1 has the running timer; Testere 2 is idle, Testere 3 offline.
  expect(screen.getByText('Aktif')).toBeInTheDocument();
  expect(screen.getByText('Boşta')).toBeInTheDocument();
  expect(screen.getByText('Çevrimdışı')).toBeInTheDocument();

  const machineCall = calls().find((c) => c.url.pathname === '/machines/')!;
  expect(machineCall.url.searchParams.get('used_in')).toBe('linear_cutting');
  expect(machineCall.url.searchParams.get('page_size')).toBe('200');
  expect(
    calls()
      .find((c) => c.url.pathname === '/linear_cutting/tasks/')!
      .url.searchParams.get('page_size'),
  ).toBe('1');
});

it('stops a timer with an empty comment', async () => {
  renderWithProviders(<LinearCuttingDashboardPage />, {
    route: '/planning/linear-cutting/dashboard/',
  });
  await screen.findByText('LC-5');
  fireEvent.click(screen.getByRole('button', { name: 'Durdur' }));

  await waitFor(() => expect(screen.getByText('Aktif Zamanlayıcı Yok')).toBeInTheDocument());
  const stop = calls().find((c) => c.method === 'POST')!;
  expect(stop.url.pathname).toBe('/linear_cutting/timers/stop/');
  expect(stop.body).toEqual({ timer_id: 31, finish_time: expect.any(Number), comment: '' });
  expect(notify.success).toHaveBeenCalledWith('Zamanlayıcı durduruldu');
});
