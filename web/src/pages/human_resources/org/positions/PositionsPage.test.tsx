import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PositionsPage } from './PositionsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const POSITIONS = [
  {
    id: 1,
    title: 'Genel Müdür',
    level: 1,
    parent: null,
    department_code: 'management',
    is_active: true,
    holder_count: 1,
    permission_count: 12,
  },
  {
    id: 2,
    title: 'Kaynak Ustası',
    level: 4,
    parent: 1,
    parent_title: 'Genel Müdür',
    department_code: 'welding',
    is_active: true,
    holder_count: 0,
    permission_count: 3,
  },
  {
    id: 3,
    title: 'Eski Pozisyon',
    level: 5,
    parent: null,
    department_code: '',
    is_active: false,
    holder_count: 0,
    permission_count: 0,
  },
];
const USERS = [
  { id: 10, username: 'ayilmaz', first_name: 'Ali', last_name: 'Yılmaz', is_active: true },
  { id: 11, username: 'bdemir', first_name: 'Berk', last_name: 'Demir', is_active: true },
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/organization/positions/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/human_resources/org/positions/') {
  return renderWithProviders(
    <ModalsProvider>
      <PositionsPage />
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
    if (method === 'GET' && path === '/organization/positions/') return json(POSITIONS);
    if (method === 'GET' && path === '/organization/positions/2/') return json(POSITIONS[1]);
    if (method === 'GET' && path === '/organization/positions/2/holders/') {
      return json([{ id: 10, username: 'ayilmaz', full_name: 'Ali Yılmaz' }]);
    }
    if (method === 'GET' && path === '/users/dropdown/') return json(USERS);
    if (method === 'POST' && path === '/organization/positions/')
      return json({ id: 99, title: 'Yeni' }, 201);
    if (method === 'PATCH') return json({});
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the positions with the band figures', async () => {
  renderPage();
  expect(screen.getByText('Pozisyon Yönetimi')).toBeInTheDocument();
  expect(await screen.findByText('Kaynak Ustası')).toBeInTheDocument();
  expect(screen.getByText('Kaynaklı İmalat')).toBeInTheDocument();

  const figure = (id: string) => within(document.getElementById(id)!);
  expect(figure('stat-total').getByText('3')).toBeInTheDocument();
  expect(figure('stat-active').getByText('2')).toBeInTheDocument();
  expect(figure('stat-holders').getByText('1')).toBeInTheDocument();
  // Vacant counts active positions only.
  expect(figure('stat-vacant').getByText('1')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({});
  // Only active users are offered for assignment.
  const usersCall = calls().find((c) => c.url.pathname === '/users/dropdown/')!;
  expect(usersCall.url.searchParams.get('is_active')).toBe('true');
});

it('sends the legacy URL filters and writes a picked department to the URL', async () => {
  renderPage('/human_resources/org/positions/?level=4');
  await screen.findByText('Kaynak Ustası');
  expect(listCalls()[0]!.url.searchParams.get('level')).toBe('4');

  // The pill comes before the column header of the same name.
  fireEvent.click(screen.getAllByRole('button', { name: /Departman/ })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Kaynaklı İmalat' }));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('department')).toBe('welding');
    expect(search.get('level')).toBe('4');
  });
  // The URL keeps legacy's `department`; the request uses the backend's department_code.
  await waitFor(() =>
    expect(
      listCalls().some(
        (c) =>
          c.url.searchParams.get('department_code') === 'welding' &&
          !c.url.searchParams.has('department') &&
          c.url.searchParams.get('level') === '4',
      ),
    ).toBe(true),
  );
});

it('the create form needs a title and then posts the payload', async () => {
  renderPage();
  await screen.findByText('Kaynak Ustası');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Pozisyon' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Pozisyon' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Pozisyon başlığı zorunludur.')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), {
    target: { value: '  Planlama Şefi ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Pozisyon oluşturuldu.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.body).toEqual({
    title: 'Planlama Şefi',
    level: 5,
    parent: null,
    department_code: '',
    is_active: true,
  });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Yeni Pozisyon' })).toBeNull());
});

it('opens the detail panel and assigns a user to the position', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaynak Ustası'));

  expect(await screen.findByText('Ali Yılmaz')).toBeInTheDocument();
  expect(screen.getByTestId('position-holder-count')).toHaveTextContent('1');

  // Ata without a pick only warns.
  fireEvent.click(screen.getByRole('button', { name: 'Ata' }));
  expect(notify.warning).toHaveBeenCalledWith('Önce en az bir kullanıcı seçin.');

  fireEvent.click(screen.getByPlaceholderText('Kullanıcı seçin...'));
  // The current holder is not offered again.
  // (The dropdown is still mid-transition in jsdom, hence hidden: true.)
  fireEvent.click(await screen.findByRole('option', { name: 'Berk Demir', hidden: true }));
  expect(screen.queryByRole('option', { name: 'Ali Yılmaz', hidden: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ata' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kullanıcı pozisyona atandı.'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/users/11/');
  expect(patch.body).toEqual({ position: 2 });
});

it('removes a holder only after the confirm', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Kaynak Ustası'));
  fireEvent.click(await screen.findByRole('button', { name: 'Pozisyonu Kaldır' }));
  expect(
    await screen.findByText('"Ali Yılmaz" kullanıcısının pozisyonu kaldırılacak.'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'PATCH')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Kaldır' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Kullanıcının pozisyonu kaldırıldı.'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/users/10/');
  expect(patch.body).toEqual({ position: null });
});

it('toggles a position after the confirm', async () => {
  renderPage();
  await screen.findByText('Kaynak Ustası');
  fireEvent.click(screen.getAllByRole('button', { name: 'Durumu Değiştir' })[1]!);
  expect(
    await screen.findByText('"Kaynak Ustası" pozisyonu pasifleştirilecek.'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pasifleştir' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Pozisyon durumu güncellendi.'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/organization/positions/2/');
  expect(patch.body).toEqual({ is_active: false });
});
