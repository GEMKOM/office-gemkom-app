import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { MachinesPage } from './MachinesPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const MACHINES = [
  {
    id: 1,
    name: 'CNC Torna 1',
    code: 'M-01',
    machine_type: 'lathe',
    machine_type_label: 'Torna',
    used_in: 'machining',
    used_in_label: 'Talaşlı İmalat',
    is_active: true,
    is_under_maintenance: false,
    assigned_users: [{ id: 7, username: 'ahmet', first_name: 'Ahmet', last_name: 'Yıldız' }],
    properties: { kapasite: '1000', güç: '5kW' },
  },
  {
    id: 2,
    name: 'Kaynak Robotu',
    code: '',
    machine_type: 'robot',
    machine_type_label: 'Robot',
    used_in: 'welding',
    used_in_label: 'Kaynak',
    is_active: false,
    is_under_maintenance: true,
    assigned_users: [],
    properties: {},
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/machines/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/machines') {
  return renderWithProviders(
    <ModalsProvider>
      <MachinesPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const { pathname } = new URL(String(url));
    if (method === 'GET') {
      if (pathname === '/machines/')
        return json({ count: 57, next: null, previous: null, results: MACHINES });
      if (pathname === '/machines/types/') {
        return json([
          { value: 'lathe', label: 'Torna' },
          { value: 'robot', label: 'Robot' },
        ]);
      }
      if (pathname === '/machines/used_in/') {
        return json([
          { value: 'machining', label: 'Talaşlı İmalat' },
          { value: 'welding', label: 'Kaynak' },
        ]);
      }
      if (pathname === '/users/dropdown/') {
        return json([{ id: 7, username: 'ahmet', first_name: 'Ahmet', last_name: 'Yıldız' }]);
      }
    }
    if (method === 'POST') return json({ id: 99, name: 'Yeni' }, 201);
    if (method === 'PATCH') return json({ id: 1, name: 'CNC Torna 1' });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the machines with the legacy columns and figures', async () => {
  renderPage();
  expect(await screen.findByText('CNC Torna 1')).toBeInTheDocument();
  expect(screen.getByText('Kaynak Robotu')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Kullanıcılar \(1\)/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Özellikler \(2\)/ })).toBeInTheDocument();
  expect(screen.getByText('Yok')).toBeInTheDocument();

  expect(within(document.getElementById('total-machines')!).getByText('57')).toBeInTheDocument();
  expect(within(document.getElementById('active-machines')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('machine-types')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('usage-areas')!).getByText('2')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
  });
});

it('filters and sorting go to the URL and the request', async () => {
  renderPage('/general/machines?machine_type=lathe&is_active=true&page=2');
  await screen.findByText('CNC Torna 1');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '2',
    page_size: '20',
    machine_type: 'lathe',
    is_active: 'true',
  });

  fireEvent.change(screen.getByLabelText('Makine Adı'), { target: { value: 'torna' } });
  fireEvent.keyDown(screen.getByLabelText('Makine Adı'), { key: 'Enter' });
  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('name')).toBe('torna');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() =>
    expect(Object.fromEntries(listCalls().at(-1)!.url.searchParams)).toEqual({
      page: '1',
      page_size: '20',
      name: 'torna',
      machine_type: 'lathe',
      is_active: 'true',
    }),
  );

  fireEvent.click(
    within(screen.getByRole('columnheader', { name: /Makine Tipi/ })).getByRole('button'),
  );
  // The backend orders by machine_type; machine_type_label would be ignored.
  await waitFor(() =>
    expect(listCalls().at(-1)!.url.searchParams.get('ordering')).toBe('machine_type'),
  );
  // Nor can it order by these, so they offer no sort.
  for (const name of ['Kullanım Alanı', 'Aktif', 'Bakımda']) {
    expect(within(screen.getByRole('columnheader', { name })).queryByRole('button')).toBeNull();
  }
});

it('does not crash on empty responses', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('Makine bulunamadı')).toBeInTheDocument();
});

it('the create form validates, rejects bad JSON and posts the legacy body', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Makine' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Makine Oluştur' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Makine Oluştur' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(3);

  fireEvent.change(within(dialog).getByLabelText(/Makine Adı/), { target: { value: 'Pres 3' } });
  fireEvent.click(within(dialog).getByLabelText(/Makine Tipi/));
  fireEvent.click(await screen.findByRole('option', { name: 'Robot', hidden: true }));
  fireEvent.click(within(dialog).getByLabelText(/Kullanım Alanı/));
  fireEvent.click(await screen.findByRole('option', { name: 'Kaynak', hidden: true }));
  fireEvent.change(within(dialog).getByLabelText('Makine Özellikleri'), {
    target: { value: '{kapasite' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Makine Oluştur' }));
  expect(await within(dialog).findByText('Geçerli bir JSON nesnesi girin')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText('Makine Özellikleri'), {
    target: { value: '{"ton": "200"}' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Makine Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Makine başarıyla oluşturuldu'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/machines/');
  expect(post.body).toEqual({
    name: 'Pres 3',
    code: null,
    machine_type: 'robot',
    used_in: 'welding',
    is_active: true,
    assigned_users: [],
    properties: { ton: '200' },
  });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('edits from the properties modal and patches the machine', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: /Özellikler \(2\)/ }));
  const props = await screen.findByRole('dialog', { name: 'Makine Özellikleri' });
  expect(within(props).getByText('kapasite')).toBeInTheDocument();
  expect(within(props).getByText('5kW')).toBeInTheDocument();
  fireEvent.click(within(props).getByRole('button', { name: 'Düzenle' }));

  const dialog = await screen.findByRole('dialog', { name: 'Makine Düzenle' });
  expect(within(dialog).getByLabelText(/Makine Adı/)).toHaveValue('CNC Torna 1');
  fireEvent.change(within(dialog).getByLabelText(/Makine Kodu/), { target: { value: 'M-01A' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Makine başarıyla güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/machines/1/');
  expect(patch.body).toEqual({
    name: 'CNC Torna 1',
    code: 'M-01A',
    machine_type: 'lathe',
    used_in: 'machining',
    is_active: true,
    assigned_users: [7],
    properties: { kapasite: '1000', güç: '5kW' },
  });
});

it('lists the assigned users', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getByRole('button', { name: /Kullanıcılar \(1\)/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Atanan Kullanıcılar' });
  expect(within(dialog).getByText('Kullanıcı 1')).toBeInTheDocument();
  expect(within(dialog).getByText('Ahmet Yıldız')).toBeInTheDocument();
});

it('deletes a machine only after the confirm', async () => {
  renderPage();
  await screen.findByText('CNC Torna 1');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('Bu makineyi silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Bu işlem geri alınamaz ve makine kalıcı olarak silinecektir.'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Makine silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/machines/1/');
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});
