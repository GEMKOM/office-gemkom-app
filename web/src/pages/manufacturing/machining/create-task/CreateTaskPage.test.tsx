import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CreateTaskPage } from './CreateTaskPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ali' } }) }));

const fetchMock = vi.mocked(authedFetch);
const TASKS = [
  {
    key: 'TI-100',
    name: 'Mil',
    job_no: '254-01',
    quantity: 2,
    total_hours_spent: 1,
    planned_end_ms: Date.UTC(2026, 10, 20),
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/machining/tasks/');

function cell(rowId: string, col: string) {
  return document.querySelector<HTMLElement>(`tr[data-row-id="${rowId}"] td[data-col="${col}"]`)!;
}
const draftIds = () =>
  [...document.querySelectorAll('tr[data-row-id^="draft-"]')].map((tr) =>
    tr.getAttribute('data-row-id')!,
  );

function edit(rowId: string, col: string, value: string) {
  fireEvent.click(cell(rowId, col));
  const input = cell(rowId, col).querySelector('input')!;
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

let createResponse: unknown = [{ key: 'TI-201', name: 'Flanş', job_no: '254-01' }];

beforeEach(() => {
  createResponse = [{ key: 'TI-201', name: 'Flanş', job_no: '254-01' }];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST' && path === '/machining/tasks/bulk-create/')
      return json(createResponse, 201);
    if (path === '/machining/tasks/')
      return json({ count: 1, next: null, previous: null, results: TASKS });
    return json({}, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
});
afterEach(() => vi.restoreAllMocks());

function renderPage(route = '/manufacturing/machining/create-task/') {
  return renderWithProviders(
    <ModalsProvider>
      <CreateTaskPage />
    </ModalsProvider>,
    { route },
  );
}

it("lists the user's own tasks with the legacy params", async () => {
  renderPage('/manufacturing/machining/create-task/?key=12&has_timer=true');
  expect(screen.getByRole('heading', { name: 'Görev Oluştur' })).toBeInTheDocument();
  expect(await screen.findByText('Mil')).toBeInTheDocument();
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    created_by: '7',
    key: 'TI-12',
    has_timer: 'true',
    page: '1',
    page_size: '20',
    ordering: 'key',
  });
  expect(screen.getByText('Çalışıldı')).toBeInTheDocument();
});

it('refuses an incomplete draft with the legacy messages, without a request', async () => {
  renderPage();
  await screen.findByText('Mil');
  fireEvent.click(screen.getByRole('button', { name: /Görevleri Oluştur/ }));
  expect(notify.error).toHaveBeenCalled();
  const message = vi.mocked(notify.error).mock.calls[0]![0];
  renderWithProviders(<div data-testid="msg">{message as React.ReactNode}</div>);
  expect(screen.getByTestId('msg')).toHaveTextContent('Satır 1: Ad');
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
});

it('Kopyala duplicates a row; Sil is off for the last row', async () => {
  renderPage();
  await screen.findByText('Mil');
  const [first] = draftIds();
  edit(first!, 'name', 'Flanş');
  const actions = within(document.querySelector(`tr[data-row-id="${first}"]`)!);
  expect(actions.getByRole('button', { name: 'Sil' })).toBeDisabled();
  fireEvent.click(actions.getByRole('button', { name: 'Kopyala' }));
  await waitFor(() => expect(draftIds()).toHaveLength(2));
  expect(cell(draftIds()[1]!, 'name')).toHaveTextContent('Flanş');
  expect(screen.getByText('Toplam satır sayısı: 2')).toBeInTheDocument();
});

it('creates the drafts, shows the created keys and reloads the list', async () => {
  renderPage();
  await screen.findByText('Mil');
  const [id] = draftIds();
  edit(id!, 'name', 'Flanş');
  edit(id!, 'job_no', '254-01');
  edit(id!, 'quantity', '4');
  edit(id!, 'finish_time', '2026-11-20');
  fireEvent.click(screen.getByRole('button', { name: /Görevleri Oluştur/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Görevler Başarıyla Oluşturuldu' });
  expect(within(dialog).getByText('TI-201')).toBeInTheDocument();
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.body).toEqual([
    {
      name: 'Flanş',
      job_no: '254-01',
      image_no: null,
      position_no: null,
      quantity: 4,
      finish_time: '2026-11-20',
      description: null,
    },
  ]);
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
  // The form is reset to one empty row.
  expect(draftIds()).toHaveLength(1);
  expect(draftIds()[0]).not.toBe(id);
});

it('a non-array answer just says how many were created', async () => {
  createResponse = { ok: true };
  renderPage();
  await screen.findByText('Mil');
  const [id] = draftIds();
  edit(id!, 'name', 'Flanş');
  edit(id!, 'job_no', '254-01');
  edit(id!, 'quantity', '4');
  edit(id!, 'finish_time', '2026-11-20');
  fireEvent.click(screen.getByRole('button', { name: /Görevleri Oluştur/ }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('1 görev başarıyla oluşturuldu!'),
  );
});
