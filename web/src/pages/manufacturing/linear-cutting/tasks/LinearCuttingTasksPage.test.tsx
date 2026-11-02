import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { LinearCuttingTasksPage } from './LinearCuttingTasksPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const TASKS = [
  {
    key: 'LC-0004-01',
    name: 'Bar 1',
    session: 'LC-0004',
    session_title: 'Korkuluk',
    item_name: 'Boru 40x40',
    bar_index: 1,
    stock_length_mm: 6000,
    machine_fk: 7,
    machine_name: null,
    completion_date: null,
    estimated_hours: 1.5,
    total_hours_spent: 0,
    description: '',
  },
  {
    key: 'LC-0004-02',
    name: 'Bar 2',
    session: 'LC-0004',
    item_code: 'NPU-80',
    bar_index: 2,
    stock_length_mm: 6000,
    machine_fk: null,
    machine_name: 'Testere 2',
    completion_date: '2026-10-30T08:00:00Z',
    estimated_hours: null,
    total_hours_spent: 2,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/linear_cutting/tasks/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/linear-cutting/tasks/') {
  return renderWithProviders(
    <ModalsProvider>
      <LinearCuttingTasksPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/linear_cutting/tasks/') {
      return json({ count: 2, next: null, previous: null, results: TASKS });
    }
    if (method === 'GET' && path === '/linear_cutting/tasks/LC-0004-01/') return json(TASKS[0]);
    if (method === 'GET' && path === '/machines/dropdown/') {
      return json([
        { id: 7, name: 'Testere 1' },
        { id: 8, name: 'Testere 2' },
      ]);
    }
    if (method === 'PATCH') return json(TASKS[0]);
    if (method === 'POST') return json({ ok: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the tasks with the legacy default params and machine names', async () => {
  renderPage();
  expect(screen.getByText('Lineer Kesim Görevler')).toBeInTheDocument();
  expect(await screen.findByText('LC-0004-01')).toBeInTheDocument();
  expect(screen.getByText('LC-0004 — Korkuluk')).toBeInTheDocument();
  expect(screen.getByText('NPU-80')).toBeInTheDocument();
  // machine_name is empty: the name comes from the linear cutting machines.
  expect(await screen.findByText('Testere 1')).toBeInTheDocument();
  expect(screen.getByText('1.5 saat')).toBeInTheDocument();
  expect(screen.getByText('0 saat')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-completion_date',
  });
  const machines = calls().find((c) => c.url.pathname === '/machines/dropdown/')!;
  expect(machines.url.searchParams.get('used_in')).toBe('linear_cutting');
});

it('filters by plan and status through the URL', async () => {
  renderPage();
  await screen.findByText('LC-0004-01');

  fireEvent.change(screen.getByLabelText('Kesim Planı'), { target: { value: ' LC-0004 ' } });
  fireEvent.click(screen.getByRole('button', { name: /Durum/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Tamamlanan' }));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('completed')).toBe('true');
    expect(search.get('session')).toBe(' LC-0004 ');
  });
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toEqual({
      page: '1',
      page_size: '20',
      session: 'LC-0004',
      completed: 'true',
      ordering: '-completion_date',
    }),
  );
});

it('marks a waiting task completed after the confirm, and unmarks a done one at once', async () => {
  renderPage();
  await screen.findByText('LC-0004-01');

  fireEvent.click(screen.getByRole('button', { name: 'Bekliyor' }));
  expect(
    await screen.findByText('Bu görevi tamamlandı olarak işaretlemek istiyor musunuz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Tamamla' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Görev tamamlandı'));
  const mark = calls().find((c) => c.method === 'POST')!;
  expect(mark.url.pathname).toBe('/linear_cutting/tasks/mark-completed/');
  expect(mark.body).toEqual({ key: 'LC-0004-01' });

  fireEvent.click(screen.getByRole('button', { name: 'Tamamlandı' }));
  await waitFor(() =>
    expect(notify.info).toHaveBeenCalledWith('Görev tamamlanmadı olarak işaretlendi'),
  );
  const unmark = calls().filter((c) => c.method === 'POST')[1]!;
  expect(unmark.url.pathname).toBe('/linear_cutting/tasks/unmark-completed/');
  expect(unmark.body).toEqual({ key: 'LC-0004-02' });
});

it('edits machine, hours and description of a loaded task', async () => {
  renderPage();
  await screen.findByText('LC-0004-01');

  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Görev Düzenle - LC-0004-01' });
  expect(within(dialog).getByLabelText('Görev No')).toHaveValue('LC-0004-01');

  fireEvent.change(within(dialog).getByLabelText('Tahmini Süre (saat)'), {
    target: { value: '3' },
  });
  fireEvent.change(within(dialog).getByLabelText('Açıklama'), { target: { value: 'Acil' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Görev güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/linear_cutting/tasks/LC-0004-01/');
  expect(patch.body).toEqual({ machine_fk: 7, estimated_hours: 3, description: 'Acil' });
});

it('shows the bar layout, cut order and cut list in the details', async () => {
  // jsdom has no canvas; the drawing itself is lc-geometry's (legacy-tested).
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const detail = {
    ...TASKS[0],
    is_remnant_bar: true,
    waste_mm: 120,
    kerf_mm: '3',
    layout_json: [
      {
        label: 'P1',
        job_no: '254-01',
        nominal_mm: 2900,
        offset_mm: 0,
        angle_left_deg: 45,
        angle_right_deg: 0,
        flipped: true,
      },
    ],
    passes_json: [
      { seq: 1, kind: 'end', angle_deg: 0, stop_near_mm: 2900, stop_far_mm: 2900, releases: 'P1' },
    ],
  };
  fetchMock.mockImplementation((url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/linear_cutting/tasks/')
      return json({ count: 1, next: null, previous: null, results: [TASKS[0]] });
    if (path === '/linear_cutting/tasks/LC-0004-01/') return json(detail);
    return json([]);
  });
  renderPage();
  await screen.findByText('LC-0004-01');

  fireEvent.click(screen.getByRole('button', { name: 'Detaylar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Görev Detayı - LC-0004-01' });
  expect(within(dialog).getByText('LC-0004 — Korkuluk')).toBeInTheDocument();
  expect(within(dialog).getByText('Artık Bar')).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Bar görseli')).toBeInTheDocument();
  expect(within(dialog).getByText('Parça ayırma')).toBeInTheDocument();
  expect(within(dialog).getByText('Kesim Listesi')).toBeInTheDocument();
  expect(within(dialog).getByText('45° (alt uzun)')).toBeInTheDocument();
  expect(within(dialog).getByText('254-01')).toBeInTheDocument();
});
