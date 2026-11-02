import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CncDashboardPage } from './CncDashboardPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TIMERS = [
  {
    id: 21,
    username: 'ayse',
    machine_name: 'Plazma 1',
    issue_key: 'CNC-7',
    nesting_id: 'NST-100',
    thickness_mm: 12,
    start_time: Date.now() - 30 * 60 * 1000,
  },
];

const TASK = {
  key: 'CNC-7',
  name: 'Sac kesim',
  nesting_id: 'NST-100',
  material: 'S355',
  thickness_mm: 12,
  files: [{ id: 1, file_url: 'https://files.test/a/plan.pdf', file_name: 'cnc/plan.pdf' }],
  parts: [{ id: 1, job_no: '254-01', image_no: 'R-1', position_no: 'P-3', weight_kg: 14.5 }],
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
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/cnc_cutting/timers/')
      return json({ count: 1, results: TIMERS });
    if (method === 'GET' && path === '/machines/') {
      return json({
        count: 1,
        results: [
          {
            id: 5,
            name: 'Plazma 1',
            machine_type_label: 'Plazma',
            is_active: true,
            has_active_timer: true,
          },
        ],
      });
    }
    if (method === 'GET' && path === '/cnc_cutting/tasks/CNC-7/') return json(TASK);
    if (method === 'POST') return json({ detail: 'Zamanlayıcı bulunamadı' }, 400);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the cutting timers and machines', async () => {
  renderWithProviders(<CncDashboardPage />, { route: '/manufacturing/cnc-cutting/dashboard/' });
  expect(await screen.findByText('NST-100')).toBeInTheDocument();
  expect(screen.getByText('12 mm')).toBeInTheDocument();
  expect(screen.getByText(/^00:30:\d\d$/)).toBeInTheDocument();
  expect(await screen.findByText('Aktif')).toBeInTheDocument();

  const timerCall = calls().find((c) => c.url.pathname === '/cnc_cutting/timers/')!;
  expect(timerCall.url.searchParams.get('is_active')).toBe('true');
  expect(
    calls()
      .find((c) => c.url.pathname === '/machines/')!
      .url.searchParams.get('used_in'),
  ).toBe('cutting');
});

it('shows the stop error instead of failing silently', async () => {
  renderWithProviders(<CncDashboardPage />, { route: '/manufacturing/cnc-cutting/dashboard/' });
  await screen.findByText('NST-100');
  fireEvent.click(screen.getByRole('button', { name: 'Durdur' }));

  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  const stop = calls().find((c) => c.method === 'POST')!;
  expect(stop.url.pathname).toBe('/cnc_cutting/timers/stop/');
  expect(stop.body).toMatchObject({ timer_id: 21 });
  expect(notify.success).not.toHaveBeenCalled();
});

it('opens the cut details with files and parts', async () => {
  renderWithProviders(<CncDashboardPage />, { route: '/manufacturing/cnc-cutting/dashboard/' });
  fireEvent.click(await screen.findByRole('button', { name: /NST-100/ }));

  const dialog = await screen.findByRole('dialog');
  expect(await within(dialog).findByText('S355')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: /plan\.pdf/ })).toHaveAttribute(
    'href',
    'https://files.test/a/plan.pdf',
  );
  expect(within(dialog).getByText('254-01')).toBeInTheDocument();
  expect(within(dialog).getByText('14.5 kg')).toBeInTheDocument();
  expect(within(dialog).getByRole('link', { name: /Kesimler Sayfasında Aç/ })).toHaveAttribute(
    'href',
    '/manufacturing/cnc-cutting/cuts/?filter=CNC-7',
  );
});
