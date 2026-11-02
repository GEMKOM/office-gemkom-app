import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { EquipmentPage } from './EquipmentPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ITEMS = [
  {
    id: 1,
    code: 'CALIPER-01',
    name: 'Kumpas',
    asset_type: 'instrument',
    category: 'Measuring',
    location: 'Ambar',
    quantity: 3,
    available_quantity: 2,
    checked_out_quantity: 1,
    is_active: true,
    meta: { serial: 'S-9' },
  },
  {
    id: 2,
    code: null,
    name: 'Matkap',
    asset_type: 'tool',
    category: null,
    location: null,
    quantity: 1,
    available_quantity: 1,
    checked_out_quantity: 0,
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
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/equipment/items/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/inventory/equipment') {
  return renderWithProviders(
    <ModalsProvider>
      <EquipmentPage />
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
    if (method === 'GET' && path === '/equipment/items/') {
      return json({ count: 37, next: null, previous: null, results: ITEMS });
    }
    if (method === 'POST') return json({ id: 99, name: 'Yeni' }, 201);
    if (method === 'PATCH') return json({ ...ITEMS[0], name: 'Dijital Kumpas' });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'error');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the header, stats and the equipment rows', async () => {
  renderPage();
  expect(screen.getByText('Ekipman Yönetimi')).toBeInTheDocument();
  expect(await screen.findByText('Kumpas')).toBeInTheDocument();
  expect(screen.getByText('CALIPER-01')).toBeInTheDocument();
  expect(screen.getByText('Matkap')).toBeInTheDocument();

  // Total from count; the rest from the loaded page (legacy).
  expect(within(document.getElementById('total-equipment')!).getByText('37')).toBeInTheDocument();
  expect(within(document.getElementById('active-equipment')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('equipment-types')!).getByText('2')).toBeInTheDocument();
  expect(within(document.getElementById('page-items')!).getByText('2')).toBeInTheDocument();

  // Unsorted on first load, like legacy.
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
  });
});

it('filters and sorting go to the URL and the request with the legacy param names', async () => {
  renderPage('/planning/inventory/equipment?page=3&is_active=true&asset_type=instrument');
  await screen.findByText('Kumpas');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    asset_type: 'instrument',
    is_active: 'true',
    page: '3',
    page_size: '20',
  });

  fireEvent.change(screen.getByLabelText('Ad'), { target: { value: 'kum' } });
  fireEvent.keyDown(screen.getByLabelText('Ad'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('name')).toBe('kum');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    name: 'kum',
    asset_type: 'instrument',
    is_active: 'true',
    page: '1',
    page_size: '20',
  });

  fireEvent.click(within(screen.getByRole('columnheader', { name: /Adet/ })).getByRole('button'));
  await waitFor(() => expect(listCalls()).toHaveLength(3));
  expect(listCalls()[2]!.url.searchParams.get('ordering')).toBe('quantity');
});

it('the create form validates and posts the legacy payload with merged JSON', async () => {
  renderPage();
  await screen.findByText('Kumpas');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Ekipman' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Ekipman Oluştur' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByRole('textbox', { name: /^Ad(?!et)/ }), {
    target: { value: 'Mikrometre' },
  });
  fireEvent.change(within(dialog).getByLabelText('Tip'), { target: { value: 'instrument' } });
  fireEvent.change(within(dialog).getByLabelText('Adet'), { target: { value: '4' } });
  fireEvent.change(within(dialog).getByLabelText('Ek Alanlar (JSON)'), {
    target: { value: '{"serial":"123"}' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/equipment/items/');
  expect(post.body).toEqual({
    code: null,
    name: 'Mikrometre',
    asset_type: 'instrument',
    category: null,
    location: null,
    is_active: true,
    quantity: 4,
    serial: '123',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('edits a row with PATCH and keeps the modal open on failure', async () => {
  renderPage();
  await screen.findByText('Kumpas');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Ekipman Düzenle' });
  const name = within(dialog).getByRole('textbox', { name: /^Ad(?!et)/ });
  expect(name).toHaveValue('Matkap');

  fetchMock.mockImplementationOnce(() => json({ name: ['Geçersiz.'] }, 400));
  fireEvent.change(name, { target: { value: 'Darbeli Matkap' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const patches = calls().filter((c) => c.method === 'PATCH');
  expect(patches[1]!.url.pathname).toBe('/equipment/items/2/');
  expect(patches[1]!.body).toEqual({
    code: null,
    name: 'Darbeli Matkap',
    asset_type: 'tool',
    category: null,
    location: null,
    is_active: false,
    quantity: 1,
  });
});

it('shows every field in the detail modal and opens edit from it', async () => {
  renderPage();
  await screen.findByText('Kumpas');
  fireEvent.click(screen.getAllByRole('button', { name: 'Görüntüle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Ekipman Detayı' });
  expect(within(dialog).getByText('checked_out_quantity')).toBeInTheDocument();
  expect(within(dialog).getByText('Measuring')).toBeInTheDocument();
  expect(within(dialog).getByText('true')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Düzenle' }));
  expect(await screen.findByRole('dialog', { name: 'Ekipman Düzenle' })).toBeInTheDocument();
});

it('deletes only after the confirm', async () => {
  renderPage();
  await screen.findByText('Kumpas');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('Bu ekipmanı silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(calls().some((c) => c.method === 'DELETE')).toBe(true));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/equipment/items/1/');
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});
