import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { InventoryPage } from './InventoryPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const DEVICES = [
  {
    id: 1,
    name: 'Muhasebe PC',
    code: 'IT-001',
    machine_type: 'Laptop',
    machine_type_label: 'Dizüstü',
    used_in: 'it',
    is_active: true,
    is_under_maintenance: false,
    assigned_users: [{ id: 7, username: 'ayse', first_name: 'Ayşe', last_name: 'Yılmaz' }],
    properties: { RAM: '16GB', Garanti: true },
  },
  {
    id: 2,
    name: 'Yazıcı',
    code: null,
    machine_type: 'Printer',
    machine_type_label: 'Yazıcı',
    used_in: 'it',
    is_active: false,
    is_under_maintenance: true,
    assigned_users: [],
    properties: {},
  },
];

const TYPES = [
  { value: 'Laptop', label: 'Dizüstü' },
  { value: 'Printer', label: 'Yazıcı' },
];

const USERS = [
  { id: 7, username: 'ayse', first_name: 'Ayşe', last_name: 'Yılmaz' },
  { id: 9, username: 'mehmet' },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const listCalls = () => calls().filter((c) => c.method === 'GET' && c.url.pathname === '/machines/');
const lastListParams = () => Object.fromEntries(listCalls().at(-1)!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}
const location = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');

function renderPage(route = '/it/inventory') {
  return renderWithProviders(
    <ModalsProvider>
      <InventoryPage />
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
    if (method === 'GET' && path === '/machines/') {
      return json({ count: 42, next: null, previous: null, results: DEVICES });
    }
    if (method === 'GET' && path === '/machines/types/') return json(TYPES);
    if (method === 'GET' && path === '/users/dropdown/') return json(USERS);
    if (method === 'PATCH') return json({ ...DEVICES[0], name: 'Yeni Ad' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the header, stats and rows, and asks for IT devices only', async () => {
  renderPage();
  expect(screen.getByText('IT Envanter')).toBeInTheDocument();
  expect(await screen.findByText('Muhasebe PC')).toBeInTheDocument();
  expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument();
  expect(screen.getByText('IT-001')).toBeInTheDocument();
  expect(screen.getByText('Yok')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Özellikler (2)' })).toBeInTheDocument();

  // Total from count; the rest from the loaded page (legacy).
  expect(within(document.getElementById('total-devices')!).getByText('42')).toBeInTheDocument();
  expect(within(document.getElementById('active-devices')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('laptops')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('desktops')!).getByText('0')).toBeInTheDocument();

  // No ordering until a header is clicked, as legacy.
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({ page: '1', page_size: '20', used_in: 'it' });
});

it('reads the filters, page and sort from the URL', async () => {
  renderPage('/it/inventory?name=pc&code=IT&machine_type=Laptop&is_active=true&page=2&ordering=-name');
  await screen.findByText('Muhasebe PC');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '2',
    page_size: '20',
    name: 'pc',
    code: 'IT',
    machine_type: 'Laptop',
    used_in: 'it',
    is_active: 'true',
    ordering: '-name',
  });
});

it('applying filters writes the URL and refetches with the legacy params', async () => {
  renderPage('/it/inventory?page=3');
  await screen.findByText('Muhasebe PC');

  fireEvent.change(screen.getByLabelText('Cihaz Adı'), { target: { value: 'muh' } });
  // A pill applies at once and takes the typed search with it.
  fireEvent.click(screen.getByRole('button', { name: 'Durum' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Pasif' }));

  await waitFor(() => {
    expect(location().get('name')).toBe('muh');
    expect(location().get('is_active')).toBe('false');
    // Back to page 1, which is the default and so leaves the URL.
    expect(location().has('page')).toBe(false);
  });
  await waitFor(() => expect(lastListParams()).toEqual({
    page: '1',
    page_size: '20',
    name: 'muh',
    used_in: 'it',
    is_active: 'false',
  }));

  // Device type options come from /machines/types/.
  // The pill comes before the column header of the same name.
  fireEvent.click(screen.getAllByRole('button', { name: 'Cihaz Tipi' })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Yazıcı' }));
  await waitFor(() => expect(location().get('machine_type')).toBe('Printer'));
  await waitFor(() => expect(lastListParams().machine_type).toBe('Printer'));
});

it('sorting a column sends the field as ordering', async () => {
  renderPage();
  await screen.findByText('Muhasebe PC');
  fireEvent.click(screen.getByText('Cihaz Tipi', { selector: 'th *' }));
  // The backend orders by machine_type; machine_type_label would be ignored.
  await waitFor(() => expect(location().get('ordering')).toBe('machine_type'));
  await waitFor(() => expect(lastListParams().ordering).toBe('machine_type'));
});

it('shows the properties of a device', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Özellikler (2)' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('Cihaz Özellikleri - Muhasebe PC')).toBeInTheDocument();
  expect(within(dialog).getByText('RAM')).toBeInTheDocument();
  expect(within(dialog).getByText('16GB')).toBeInTheDocument();
  expect(within(dialog).getByText('Garanti')).toBeInTheDocument();
  expect(within(dialog).getByText('Evet')).toBeInTheDocument();
});

it('the edit form validates and then patches the legacy body', async () => {
  renderPage();
  await screen.findByText('Muhasebe PC');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: /Cihaz Düzenle/ });

  const name = within(dialog).getByLabelText(/Cihaz Adı/);
  expect(name).toHaveValue('Muhasebe PC');
  expect(within(dialog).getByLabelText('Özellik adı 1')).toHaveValue('RAM');
  expect(within(dialog).getByLabelText('Değer 2')).toHaveValue('true');

  fireEvent.change(name, { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'PATCH')).toBe(false);

  fireEvent.change(name, { target: { value: 'Yeni Ad' } });
  fireEvent.change(within(dialog).getByLabelText(/Cihaz Kodu/), { target: { value: '' } });
  // Drop "Garanti", add two rows: a number and an empty key (ignored).
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Özelliği kaldır' })[1]!);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Özellik Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Özellik Ekle' }));
  fireEvent.change(within(dialog).getByLabelText('Özellik adı 2'), { target: { value: ' Disk ' } });
  fireEvent.change(within(dialog).getByLabelText('Değer 2'), { target: { value: ' 512 ' } });
  fireEvent.change(within(dialog).getByLabelText('Değer 3'), { target: { value: 'yetim' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Cihaz başarıyla güncellendi'));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/machines/1/');
  expect(patch.body).toEqual({
    name: 'Yeni Ad',
    code: null,
    machine_type: 'Laptop',
    used_in: 'it',
    is_active: true,
    assigned_users: [7],
    properties: { RAM: '16GB', Disk: 512 },
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // The list is invalidated and loaded again.
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('a device without properties starts with one empty row and keeps the modal open on error', async () => {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'PATCH') return json({ name: ['Bu isim zaten kullanılıyor.'] }, 400);
    if (path === '/machines/types/') return json({ results: TYPES });
    if (path === '/users/dropdown/') return json(USERS);
    return json({ count: 2, next: null, previous: null, results: DEVICES });
  });
  renderPage();
  await screen.findByText('Muhasebe PC');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: /Cihaz Düzenle/ });
  expect(within(dialog).getByLabelText('Özellik adı 1')).toHaveValue('');
  expect(within(dialog).queryByLabelText('Özellik adı 2')).toBeNull();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Cihaz güncellenirken hata oluştu: name: Bu isim zaten kullanılıyor.'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/machines/2/');
  expect(patch.body).toMatchObject({ code: null, is_active: false, assigned_users: [], properties: {} });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
