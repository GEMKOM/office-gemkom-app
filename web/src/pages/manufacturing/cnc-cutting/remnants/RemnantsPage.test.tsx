import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { parseBulkRemnants } from './parseBulkRemnants';
import { RemnantsPage } from './RemnantsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const REMNANTS = [
  {
    id: 7,
    thickness_mm: '10.00',
    thickness_mm_2: null,
    dimensions: '1200x800',
    quantity: 3,
    material: 'S235JR',
    assigned_to: null,
    task: null,
  },
  {
    id: 8,
    thickness_mm: '5.00',
    thickness_mm_2: '4.00',
    dimensions: '600x400',
    quantity: 2,
    material: 'BAKIR',
    assigned_to: 4,
    task: 'CNC-12',
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/cnc_cutting/remnants/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/cnc-cutting/remnants/') {
  return renderWithProviders(
    <ModalsProvider>
      <RemnantsPage />
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
    if (method === 'GET' && path === '/cnc_cutting/remnants/') {
      return json({ count: 31, next: null, previous: null, results: REMNANTS });
    }
    if (method === 'GET' && path === '/cnc_cutting/remnants/7/')
      return json({ ...REMNANTS[0], heat_number: 'H-1' });
    if (method === 'POST') return json({ id: 99 }, 201);
    if (method === 'PUT') return json({ id: 7 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists unassigned plates by default with the page figures', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Fire Plakalar' })).toBeInTheDocument();
  expect(await screen.findByText('1200x800')).toBeInTheDocument();
  expect(screen.getByText('CNC-12')).toBeInTheDocument();

  expect(
    within(document.getElementById('total-remnants-count')!).getByText('31'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('total-quantity-count')!).getByText('5'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('assigned-remnants-count')!).getByText('1'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('unassigned-remnants-count')!).getByText('1'),
  ).toBeInTheDocument();

  // No unassigned param: the backend's default is the unassigned plates.
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: 'id',
    page: '1',
    page_size: '20',
  });
});

it('filters write the URL and send the legacy params', async () => {
  renderPage('/manufacturing/cnc-cutting/remnants/?page=2&thickness_mm=10');
  await screen.findByText('1200x800');
  expect(listCalls()[0]!.url.searchParams.get('thickness_mm')).toBe('10');

  fireEvent.change(screen.getByLabelText('Malzeme'), { target: { value: ' S235 ' } });
  fireEvent.click(screen.getByRole('button', { name: /Atama Durumu/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Atanmış' }));

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('assigned')).toBe('assigned');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    material: 'S235',
    thickness_mm: '10',
    unassigned: 'false',
    ordering: 'id',
    page: '1',
    page_size: '20',
  });
});

it('the create form validates and posts the legacy body', async () => {
  renderPage();
  await screen.findByText('1200x800');
  fireEvent.click(screen.getByRole('button', { name: 'Plaka Ekle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Fire Plaka Ekle' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Plaka Oluştur' }));
  expect(
    await within(dialog).findByText('Kalınlık geçerli bir sayı olmalıdır'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('Boyutlar gereklidir')).toBeInTheDocument();
  expect(within(dialog).getByText('Adet geçerli bir sayı olmalıdır')).toBeInTheDocument();
  expect(within(dialog).getByText('Malzeme gereklidir')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/^Kalınlık \(mm\)/), {
    target: { value: '12.5' },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Boyutlar/), { target: { value: ' 900x500 ' } });
  fireEvent.change(within(dialog).getByLabelText(/^Adet/), { target: { value: '2' } });
  fireEvent.change(within(dialog).getByLabelText(/^Malzeme/), { target: { value: 'S355' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Plaka Oluştur' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Fire plaka başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/cnc_cutting/remnants/');
  // Empty optional fields are left out on create.
  expect(post.body).toEqual({
    thickness_mm: '12.50',
    dimensions: '900x500',
    quantity: 2,
    material: 'S355',
  });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('edit loads the plate and puts it back, clearing emptied fields with null', async () => {
  renderPage();
  await screen.findByText('1200x800');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Fire Plaka Düzenle' });
  expect(within(dialog).getByLabelText(/^Heat Number/)).toHaveValue('H-1');

  fireEvent.change(within(dialog).getByLabelText(/^Heat Number/), { target: { value: '' } });
  fireEvent.change(within(dialog).getByLabelText(/^Adet/), { target: { value: '4' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Fire plaka başarıyla güncellendi'),
  );
  const put = calls().find((c) => c.method === 'PUT')!;
  expect(put.url.pathname).toBe('/cnc_cutting/remnants/7/');
  expect(put.body).toEqual({
    thickness_mm: '10.00',
    thickness_mm_2: null,
    dimensions: '1200x800',
    quantity: 4,
    material: 'S235JR',
    heat_number: null,
  });
});

it('bulk create previews the pasted rows and posts them', async () => {
  renderPage();
  await screen.findByText('1200x800');
  fireEvent.click(screen.getByRole('button', { name: 'Toplu Plaka Ekle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Toplu Fire Plaka Ekle' });

  fireEvent.change(within(dialog).getByLabelText(/Plaka Verileri/), {
    target: { value: '3\t8\t1500\t660\t5\tGALVANİZ\n2,5\t-\t290x660\t1\tBAKIR' },
  });
  expect(within(dialog).getByTestId('bulk-preview-count')).toHaveTextContent('2 plaka');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Plakaları Oluştur' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('2 adet fire plaka başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/cnc_cutting/remnants/bulk-create/');
  expect(post.body).toEqual([
    {
      thickness_mm: '3.00',
      thickness_mm_2: '8.00',
      dimensions: '1500x660',
      quantity: 5,
      material: 'GALVANİZ',
    },
    { thickness_mm: '2.50', dimensions: '290x660', quantity: 1, material: 'BAKIR' },
  ]);
});

it('deletes a plate only after the confirm', async () => {
  renderPage();
  await screen.findByText('1200x800');
  fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[0]!);
  expect(
    await screen.findByText('Bu plakayı silmek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(screen.getByText('ID: 7 - 1200x800 - S235JR')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Plaka başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe('/cnc_cutting/remnants/7/');
});

describe('parseBulkRemnants', () => {
  it('reads the 4-, 5- and 6-field formats', () => {
    // The old 4-field format only works comma separated: a 4-field tab line falls back to commas (legacy).
    const { valid, invalid } = parseBulkRemnants(
      ['10,1200x800,2,S235', '2,5\t290\t660\t1\tBAKIR', '3\t-\t1500\t660\t5\tGALVANİZ'].join('\n'),
    );
    expect(invalid).toEqual([]);
    expect(valid.map((r) => ({ ...r, lineNumber: undefined }))).toEqual([
      { thickness_mm: '10.00', dimensions: '1200x800', quantity: 2, material: 'S235' },
      // Five fields without "AxB": Kalınlık2 is left out (help text; legacy rejected this line).
      { thickness_mm: '2.50', dimensions: '290x660', quantity: 1, material: 'BAKIR' },
      { thickness_mm: '3.00', dimensions: '1500x660', quantity: 5, material: 'GALVANİZ' },
    ]);
  });

  it('reports bad lines with the legacy messages', () => {
    const { invalid } = parseBulkRemnants(
      '20+8\t-\t100\t200\t1\tX\nabc\t-\t100\t200\t1\tX\nonly\ttwo',
    );
    expect(invalid.map((i) => [i.lineNumber, i.error])).toEqual([
      [1, 'Bileşik kalınlık formatı desteklenmiyor (örn: 20+8)'],
      [2, 'Geçersiz kalınlık değeri'],
      [
        3,
        'Yeterli veri yok (5 veya 6 alan gerekli: Kalınlık, [Kalınlık2], Genişlik, Yükseklik, Adet, Malzeme)',
      ],
    ]);
  });
});
