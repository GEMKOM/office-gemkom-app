import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CncFinishedTimersPage } from './CncFinishedTimersPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const START = new Date(2026, 9, 30, 8, 0).getTime();
const TIMERS = [
  {
    id: 21,
    username: 'kesimci',
    nesting_id: 'E9035',
    issue_key: 'CNC-12',
    thickness_mm: '10',
    machine_fk: 3,
    machine_name: 'Plazma 1',
    start_time: START,
    finish_time: START + 45 * 60_000,
    comment: '',
    manual_entry: false,
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/cnc_cutting/timers/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/cnc-cutting/reports/finished-timers/') {
  return renderWithProviders(
    <ModalsProvider>
      <CncFinishedTimersPage />
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
    if (method === 'GET' && path === '/cnc_cutting/timers/') {
      return json({ count: 1, next: null, previous: null, results: TIMERS });
    }
    if (method === 'GET' && path === '/users/dropdown/') return json([]);
    if (method === 'GET' && path === '/machines/') {
      return json({ count: 1, next: null, previous: null, results: [{ id: 3, name: 'Plazma 1' }] });
    }
    if (method === 'PATCH') return json({ id: 21 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('links the nesting to its cut and filters by Nesting ID', async () => {
  renderPage();
  const link = await screen.findByRole('link', { name: 'E9035' });
  expect(link).toHaveAttribute('href', '/manufacturing/cnc-cutting/cuts?cut=CNC-12');
  expect(screen.getByText('10 mm')).toBeInTheDocument();
  const machines = calls().find((c) => c.url.pathname === '/machines/')!;
  expect(machines.url.searchParams.get('used_in')).toBe('cnc_cutting');

  fireEvent.change(screen.getByLabelText('Nesting ID'), { target: { value: 'E90' } });
  fireEvent.keyDown(screen.getByLabelText('Nesting ID'), { key: 'Enter' });
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toContain('nesting_id=E90'),
  );
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  const params = listCalls()[1]!.url.searchParams;
  expect(params.get('nesting_id')).toBe('E90');
  expect(params.get('is_active')).toBe('false');
});

it('Temizle empties every filter, the default dates included', async () => {
  renderPage('/manufacturing/cnc-cutting/reports/finished-timers/?nesting_id=E90');
  await screen.findByText('Plazma 1');
  fireEvent.click(screen.getByRole('button', { name: 'Temizle' }));
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
  const params = listCalls().at(-1)!.url.searchParams;
  expect(params.has('nesting_id')).toBe(false);
  expect(params.has('start_after')).toBe(false);
  expect(params.has('start_before')).toBe(false);
});

it('edits a CNC timer without the machining part fields', async () => {
  renderPage();
  await screen.findByText('Plazma 1');
  fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Zamanlayıcıyı Düzenle' });
  expect(within(dialog).getByLabelText('Nesting ID')).toHaveValue('E9035');
  expect(within(dialog).getByLabelText('Kalınlık (mm)')).toHaveValue('10 mm');

  fireEvent.click(within(dialog).getByLabelText('Manuel Giriş'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Zamanlayıcı başarıyla güncellendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/cnc_cutting/timers/21/');
  expect(patch.body).toEqual({
    comment: '',
    manual_entry: true,
    machine_fk: 3,
    finish_time: START + 45 * 60_000,
  });
});

it('deletes a timer after the confirm', async () => {
  renderPage();
  await screen.findByText('Plazma 1');
  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Zamanlayıcı başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/cnc_cutting/timers/21/');
});
