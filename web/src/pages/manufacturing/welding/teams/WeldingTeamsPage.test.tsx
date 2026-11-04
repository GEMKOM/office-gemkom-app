import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { WeldingTeamsPage } from './WeldingTeamsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const USERS = [
  { id: 1, username: 'ahmet', first_name: 'Ahmet', last_name: 'Yılmaz' },
  { id: 2, username: 'mehmet', full_name: 'Mehmet Kaya' },
  { id: 3, username: 'ayse', full_name: 'Ayşe Demir' },
  { id: 4, username: 'ali', full_name: 'Ali Çelik' },
];

const TEAMS = [
  // Plain ids: names come from the user list.
  {
    id: 10,
    name: 'Kaynak A',
    foreman: 1,
    members: [2, 3, 4],
    is_active: true,
    updated_at: '2026-10-01T09:30:00',
  },
  // Nested users and a server-side count.
  {
    id: 11,
    name: 'Kaynak B',
    foreman_full_name: 'Veli Usta',
    members_detail: [{ id: 7, full_name: 'Can Ak' }],
    members_count: 1,
    is_active: false,
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
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === '/teams/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/welding/teams') {
  return renderWithProviders(
    <ModalsProvider>
      <WeldingTeamsPage />
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
    if (method === 'GET' && path === '/teams/')
      return json({ count: 2, next: null, previous: null, results: TEAMS });
    if (method === 'GET' && path === '/users/dropdown/') return json(USERS);
    if (method === 'POST') return json({ id: 99, name: 'Yeni' }, 201);
    if (method === 'PATCH') return json({ ...TEAMS[0], name: 'Kaynak A2' });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the teams with foreman and member names from either shape', async () => {
  renderPage();
  expect(screen.getByText('Kaynak Ekipleri')).toBeInTheDocument();
  expect(await screen.findByText('Kaynak A')).toBeInTheDocument();

  // Plain ids resolved through /users/dropdown/ once it arrives.
  expect(await screen.findByText('Ahmet Yılmaz')).toBeInTheDocument();
  expect(screen.getByText('+1')).toBeInTheDocument();
  expect(screen.getByTitle('Mehmet Kaya, Ayşe Demir, Ali Çelik')).toBeInTheDocument();
  expect(screen.getByText('Veli Usta')).toBeInTheDocument();
  expect(screen.getByText('Can Ak')).toBeInTheDocument();
  expect(screen.getByText('Pasif')).toBeInTheDocument();

  expect(within(document.getElementById('total-teams-count')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('active-teams-count')!).getByText('1')).toBeInTheDocument();
  expect(
    within(document.getElementById('foreman-teams-count')!).getByText('1'),
  ).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: 'name',
  });
});

it('sends both text filters as one search and the status as is_active', async () => {
  renderPage('/manufacturing/welding/teams?foreman=veli&is_active=false&page=2');
  await screen.findByText('Kaynak A');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    search: 'veli',
    is_active: 'false',
    page: '2',
    page_size: '20',
    ordering: 'name',
  });

  fireEvent.change(screen.getByLabelText('Ekip Adı'), { target: { value: 'kaynak' } });
  fireEvent.keyDown(screen.getByLabelText('Ekip Adı'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('name')).toBe('kaynak');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toEqual({
      search: 'kaynak veli',
      is_active: 'false',
      page: '1',
      page_size: '20',
      ordering: 'name',
    }),
  );
});

it('the create form requires a name and posts the legacy payload', async () => {
  renderPage();
  await screen.findByText('Ahmet Yılmaz');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Ekip' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Ekip Oluştur' });
  expect(within(dialog).getByLabelText('Aktif')).toBeChecked();

  fireEvent.change(within(dialog).getByLabelText(/Ekip Adı/), { target: { value: '   ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ekip Oluştur' }));
  expect(await within(dialog).findByText('Ekip adı zorunludur')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Ekip Adı/), { target: { value: '  Kaynak C ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ekip Oluştur' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ekip başarıyla oluşturuldu'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/teams/');
  expect(post.body).toEqual({ name: 'Kaynak C', foreman: null, members: [], is_active: true });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('edits a team with its foreman and members preselected and patches it', async () => {
  renderPage();
  await screen.findByText('Ahmet Yılmaz');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Ekibi Düzenle' });
  expect(within(dialog).getByLabelText(/Ekip Adı/)).toHaveValue('Kaynak A');
  expect(within(dialog).getByLabelText('Ustabaşı')).toHaveValue('Ahmet Yılmaz (ahmet)');

  fireEvent.change(within(dialog).getByLabelText(/Ekip Adı/), { target: { value: 'Kaynak A2' } });
  fireEvent.click(within(dialog).getByLabelText('Aktif'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ekip başarıyla güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/teams/10/');
  expect(patch.body).toEqual({
    name: 'Kaynak A2',
    foreman: 1,
    members: [2, 3, 4],
    is_active: false,
  });
});

it('shows the backend message when saving fails', async () => {
  fetchMock.mockImplementation((url, init) => {
    if (init?.method === 'POST') return json({ name: ['Bu isimde bir ekip zaten var.'] }, 400);
    if (new URL(String(url)).pathname === '/users/dropdown/') return json(USERS);
    return json({ count: 0, next: null, previous: null, results: [] });
  });
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Ekip' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Ekip Adı/), { target: { value: 'Kaynak A' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ekip Oluştur' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Bu isimde bir ekip zaten var.'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('deletes a team only after the confirm', async () => {
  renderPage();
  await screen.findByText('Kaynak A');

  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText(
      '"Kaynak A" adlı ekip pasif duruma alınacaktır. Devam etmek istiyor musunuz?',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  const dialog = screen.getByRole('dialog', { name: 'Ekip Silme Onayı' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Ekip başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/teams/10/');
});

it('closing the confirm deletes nothing', async () => {
  renderPage();
  await screen.findByText('Kaynak A');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Ekip Silme Onayı' });
  // The footer button, not the header's close (×) which is also labelled Kapat.
  fireEvent.click(within(dialog).getByText('Kapat'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
});
