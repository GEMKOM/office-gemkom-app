import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import dayjs from 'dayjs';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { FinishedTimersReport } from './FinishedTimersReport';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const START = new Date(2026, 9, 30, 8, 0).getTime();
const TIMERS = [
  {
    id: 11,
    username: 'ali.k',
    issue_key: 'TI-501',
    job_no: '254-01',
    image_no: 'R-77',
    position_no: '3',
    quantity: 4,
    machine_fk: 7,
    machine_name: 'Okuma',
    start_time: START,
    finish_time: START + 90 * 60_000,
    comment: 'Takım değişti',
    manual_entry: true,
  },
  {
    id: 12,
    username: 'veli.y',
    issue_key: 'TI-502',
    machine_name: 'Mazak',
    start_time: START,
    finish_time: START + 30 * 60_000,
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/machining/timers/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/reports/finished-timers/') {
  return renderWithProviders(
    <ModalsProvider>
      <FinishedTimersReport module="machining" />
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
    if (method === 'GET' && path === '/machining/timers/') {
      return json({ count: 57, next: null, previous: null, results: TIMERS });
    }
    if (method === 'GET' && path === '/machining/timers/99/') {
      return json({ ...TIMERS[1], id: 99, issue_key: 'TI-999' });
    }
    if (method === 'GET' && path === '/users/dropdown/')
      return json([{ id: 1, username: 'ali.k' }]);
    if (method === 'GET' && path === '/machines/dropdown/') return json([{ id: 7, name: 'Okuma' }]);
    if (method === 'PATCH') return json({ id: 11 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists finished timers from yesterday to today with the legacy params and figures', async () => {
  renderPage();
  expect(screen.getByText('Biten Zamanlayıcılar Raporu')).toBeInTheDocument();
  expect(await screen.findByText('TI-501')).toBeInTheDocument();
  expect(screen.getByText('254-01')).toBeInTheDocument();

  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const today = dayjs().format('YYYY-MM-DD');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    is_active: 'false',
    ordering: '-finish_time',
    page: '1',
    page_size: '20',
    start_after: String(new Date(`${yesterday}T00:00:00`).getTime()),
    start_before: String(new Date(`${today}T23:59:59`).getTime()),
  });
  const machines = calls().find((c) => c.url.pathname === '/machines/dropdown/')!;
  expect(machines.url.searchParams.get('used_in')).toBe('machining');

  // Total from count; hours, users and machines from the page.
  expect(
    within(document.getElementById('total-timers-count')!).getByText('57'),
  ).toBeInTheDocument();
  expect(within(document.getElementById('total-hours')!).getByText('2,00')).toBeInTheDocument();
  expect(within(document.getElementById('active-users-count')!).getByText('2')).toBeInTheDocument();
  expect(
    within(document.getElementById('active-machines-count')!).getByText('2'),
  ).toBeInTheDocument();
  // 90 minutes.
  expect(screen.getByText('1,50')).toBeInTheDocument();
});

it('the TI No search goes to the URL and the request', async () => {
  renderPage('/manufacturing/reports/finished-timers/?page=2');
  await screen.findByText('TI-501');

  fireEvent.change(screen.getByLabelText('TI No'), { target: { value: 'TI-501' } });
  fireEvent.keyDown(screen.getByLabelText('TI No'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('issue_key')).toBe('TI-501');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  const params = listCalls()[1]!.url.searchParams;
  expect(params.get('issue_key')).toBe('TI-501');
  expect(params.get('page')).toBe('1');
});

it('edits a timer: finish time, comment and the read-only part fields go back in the PATCH', async () => {
  renderPage();
  await screen.findByText('TI-501');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);

  const dialog = await screen.findByRole('dialog', { name: 'Zamanlayıcıyı Düzenle' });
  expect(within(dialog).getByLabelText('İş No')).toHaveValue('254-01');
  expect(within(dialog).getByLabelText('Hesaplanan Süre')).toHaveValue('1h 30m');

  fireEvent.change(within(dialog).getByLabelText('Bitiş Zamanı'), {
    target: { value: '2026-10-30T10:15' },
  });
  expect(within(dialog).getByLabelText('Hesaplanan Süre')).toHaveValue('2h 15m');
  fireEvent.change(within(dialog).getByLabelText('Yorum'), { target: { value: 'Düzeltildi' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Zamanlayıcı başarıyla güncellendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/machining/timers/11/');
  expect(patch.body).toEqual({
    comment: 'Düzeltildi',
    manual_entry: true,
    machine_fk: 7,
    finish_time: new Date('2026-10-30T10:15').getTime(),
    job_no: '254-01',
    image_no: 'R-77',
    position_no: '3',
    quantity: 4,
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('opens the edit modal from ?edit= for a timer not on the page', async () => {
  renderPage('/manufacturing/reports/finished-timers/?edit=99');
  const dialog = await screen.findByRole('dialog', { name: 'Zamanlayıcıyı Düzenle' });
  expect(calls().some((c) => c.url.pathname === '/machining/timers/99/')).toBe(true);
  expect(within(dialog).getByLabelText('Kullanıcı')).toHaveValue('veli.y');

  fireEvent.click(within(dialog).getByRole('button', { name: 'İptal' }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('edit='));
});

it('deletes a timer only after the confirm', async () => {
  renderPage();
  await screen.findByText('TI-501');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('Bu zamanlayıcıyı silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Zamanlayıcı başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/machining/timers/11/');
});
