import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { parseBulkRemnants } from './parseBulkRemnants';
import { RemnantsPage } from './RemnantsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const REMNANTS = [
  {
    id: 7,
    thickness_mm: '10.00',
    thickness_mm_2: null,
    dimensions: '1200x800',
    quantity: 3,
    available_quantity: 3,
    material: 'S235JR',
    task: null,
  },
  {
    id: 8,
    thickness_mm: '5.00',
    thickness_mm_2: '4.00',
    dimensions: '600x400',
    quantity: 2,
    // A cut used one of the two.
    available_quantity: 1,
    material: 'BAKIR',
    task: 'CNC-12',
  },
];

// Every matching plate (page_size=1000): the page above plus two whose
// dimensions are not "1200x800"-style, one fixable and one not.
const ALL_REMNANTS = [
  ...REMNANTS,
  {
    id: 10,
    thickness_mm: '8.00',
    thickness_mm_2: null,
    dimensions: '1500 X 600',
    quantity: 1,
    available_quantity: 1,
    material: 'S355',
  },
  {
    id: 11,
    thickness_mm: '6.00',
    thickness_mm_2: null,
    dimensions: 'L 300',
    quantity: 2,
    available_quantity: 2,
    material: 'S235JR',
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
const isAll = (c: Call) => c.url.searchParams.get('page_size') === '1000';
const remnantGets = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/cnc_cutting/remnants/');
/** The table's page requests. */
const listCalls = () => remnantGets().filter((c) => !isAll(c));
/** The every-plate requests behind the figures. */
const allCalls = () => remnantGets().filter(isAll);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/cnc-cutting/remnants/') {
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
    const parsed = new URL(String(url));
    const path = parsed.pathname;
    if (method === 'GET' && path === '/cnc_cutting/remnants/') {
      if (parsed.searchParams.get('page_size') === '1000') {
        return json({ count: 4, next: null, previous: null, results: ALL_REMNANTS });
      }
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

const figureOf = (id: string) => document.getElementById(id)!.textContent;

it('lists the plates in stock by default, with figures over every matching plate', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: 'Fire Plakalar' })).toBeInTheDocument();
  expect(await screen.findByText('1200x800')).toBeInTheDocument();
  expect(screen.getByText('CNC-12')).toBeInTheDocument();

  // Over all four plates, not the page of two: 4 records, 3+1+1+2 pieces left,
  // one of them used from (#8), so 3 + 1 = 4.
  await waitFor(() => expect(figureOf('total-remnants-count')).toContain('4'));
  expect(figureOf('total-remnants-count')).toBe('Plaka Kaydı4');
  expect(figureOf('total-quantity-count')).toBe('Kalan Adet7');
  expect(figureOf('unassigned-remnants-count')).toBe('Atanmamış3');
  expect(figureOf('assigned-remnants-count')).toBe('Atanmış1');
  // 1200×800×10 mm × 3 + 600×400×5 × 1 + 1500×600×8 × 1 at 7.85 g/cm³ = 292.02 kg;
  // "L 300" cannot be read and is left out.
  expect(figureOf('estimated-weight')).toBe('Tahmini Ağırlık · 1 plaka hariç≈ 292 kg');

  // No unassigned param: the backend's default is the plates with pieces left.
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: 'id',
    page: '1',
    page_size: '20',
  });
  expect(Object.fromEntries(allCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '1000',
  });
});

it('flags malformed dimensions and filters to them', async () => {
  renderPage();
  await screen.findByText('1200x800');
  const alert = await screen.findByTestId('malformed-dimensions');
  expect(alert).toHaveTextContent('2 plakanın boyutu 1200x800');

  fireEvent.click(within(alert).getByRole('button', { name: 'Hatalı kayıtları göster' }));
  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('format')).toBe('invalid');
  });
  // Only the two, from the every-plate list; no page request is made for them.
  expect(await screen.findByText('1500 X 600')).toBeInTheDocument();
  expect(screen.getByText('L 300')).toBeInTheDocument();
  expect(screen.queryByText('1200x800')).not.toBeInTheDocument();
  expect(screen.getAllByTestId('dimensions-flag')).toHaveLength(2);
  expect(listCalls()).toHaveLength(1);
});

it('filters write the URL and send the legacy params', async () => {
  renderPage('/planning/cnc-cutting/remnants/?page=2&thickness_mm=10');
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
  fireEvent.change(within(dialog).getByLabelText(/^Boyutlar/), { target: { value: '900-500' } });
  fireEvent.change(within(dialog).getByLabelText(/^Adet/), { target: { value: '2' } });
  fireEvent.change(within(dialog).getByLabelText(/^Malzeme/), { target: { value: 'S355' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Plaka Oluştur' }));
  expect(
    await within(dialog).findByText(
      'Boyutlar Genişlik x Yükseklik (mm) biçiminde olmalıdır, örn. 1200x800',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  // Spacing and case are fixed on save.
  fireEvent.change(within(dialog).getByLabelText(/^Boyutlar/), {
    target: { value: ' 900 X 500 ' },
  });
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

  it('writes and checks dimensions the way the single-plate form does', () => {
    const { valid, invalid } = parseBulkRemnants(
      [
        '10,1200 X 800,2,S235',
        '3\t-\t1500,5\t660\t5\tGALVANİZ',
        '3\t-\t1500 × 660\t5\tS235',
        '10,1200x800x10,2,S235',
        '3\t-\t1.200\t660\t5\tS235',
      ].join('\n'),
    );
    expect(valid.map((r) => r.dimensions)).toEqual(['1200x800', '1500.5x660', '1500x660']);
    const error = 'Boyutlar Genişlik x Yükseklik (mm) biçiminde olmalıdır, örn. 1200x800';
    expect(invalid.map((i) => [i.lineNumber, i.error])).toEqual([
      [4, error],
      [5, error],
    ]);
  });
});
