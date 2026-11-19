import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { DepartmentRequestsListPage } from './DepartmentRequestsListPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ben' } }) }));
// Planning (its department requests page) may list everyone's requests.
const access = vi.hoisted(() => ({ open: new Set<string>() }));
vi.mock('@/auth/accessControl', () => ({ hasRouteAccess: (route: string) => access.open.has(route) }));
const PLANNING = '/planning/department-requests';

const fetchMock = vi.mocked(authedFetch);

const ROWS = [
  {
    id: 11,
    title: 'Taslak talep',
    department: 'maintenance',
    priority: 'urgent',
    status: 'draft',
    status_label: 'Taslak',
    items_count: 2,
    planning_request_keys: ['GS-10162'],
  },
  {
    id: 12,
    title: 'Gönderilen talep',
    department_label: 'İmalat',
    priority: 'normal',
    status: 'submitted',
    status_label: 'Gönderildi',
    items_count: 1,
  },
  {
    id: 13,
    title: 'Onaylı talep',
    department: 'it',
    priority: 'critical',
    status: 'approved',
    status_label: 'Onaylandı',
    items_count: 0,
  },
];

const DETAIL = {
  ...ROWS[0],
  request_number: 'DR-11',
  requestor_full_name: 'Ali Veli',
  description: 'Bakım için malzeme',
  purchase_request_keys: [],
  items: [
    // Made before cards were picked: code and name typed by hand.
    { item_code: 'K-1', item_name: 'Rulman', quantity: 4, item_unit: 'adet' },
    { item_code: null, item_name: 'Özel conta', quantity: 2, item_unit: 'adet', no_card: true },
  ],
  files: [{ id: 1, file_name: 'uploads/teklif.pdf', file_url: 'https://files.test/teklif.pdf' }],
};

const CARDS = [
  { id: 7, code: 'K-1', name: 'Rulman', unit: 'ADET', is_active: true },
  { id: 31, code: 'F014 0000 0000 000 000', name: 'LAZER KESİM', unit: 'ADET', is_active: true },
];

/** GET /procurement/items/: `code__in` lookups and active-card searches by code or name. */
function cardsFor(params: URLSearchParams) {
  const codes = params.get('code__in');
  if (codes !== null) return CARDS.filter((c) => codes.split(',').includes(c.code));
  if (params.get('is_active') !== 'true') return [];
  const term = (params.get('search') ?? '').toLocaleLowerCase('tr');
  return CARDS.filter((c) => `${c.code} ${c.name}`.toLocaleLowerCase('tr').includes(term));
}

// Mantine's combobox scrolls the active option into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

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
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/planning/department-requests/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/department-requests/list') {
  return renderWithProviders(
    <ModalsProvider>
      <DepartmentRequestsListPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  access.open = new Set();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const { pathname: path, searchParams } = new URL(String(url));
    if (method === 'GET' && path === '/procurement/items/') {
      const results = cardsFor(searchParams);
      return json({ count: results.length, next: null, previous: null, results });
    }
    if (method === 'GET' && path === '/planning/department-requests/') {
      return json({ count: 3, next: null, previous: null, results: ROWS });
    }
    if (method === 'GET' && path === '/planning/department-requests/11/') return json(DETAIL);
    if (method === 'GET' && path === '/users/dropdown/') {
      return json([{ id: 5, username: 'ali', full_name: 'Ali Veli' }]);
    }
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([{ job_no: '254-01', title: 'Vinç' }]);
    }
    if (method === 'POST') return json({ id: 99 }, 201);
    if (method === 'PATCH') return json({ id: 11 });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'info');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("renders the user's own rows with the legacy request and status-dependent actions", async () => {
  renderPage();
  expect(screen.getByText('Departman Taleplerim')).toBeInTheDocument();
  expect(await screen.findByText('Taslak talep')).toBeInTheDocument();
  expect(screen.getByText('GS-10162')).toBeInTheDocument();
  expect(screen.getByText('Bakım')).toBeInTheDocument();
  expect(screen.getByText('İmalat')).toBeInTheDocument();
  expect(screen.getByText('Kritik')).toBeInTheDocument();
  expect(screen.getByText('2 ürün')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-id',
    requestor: '7',
  });
  // Only their own: no switch, no Talep Eden, and no user list asked for.
  expect(screen.queryByRole('radio', { name: 'Tüm Talepler' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Talep Eden/ })).not.toBeInTheDocument();
  expect(calls().some((c) => c.url.pathname === '/users/dropdown/')).toBe(false);

  const row = (title: string) => screen.getByText(title).closest('tr')!;
  // Edit: draft / submitted. Delete: draft / cancelled.
  expect(within(row('Taslak talep')).getByRole('button', { name: 'Düzenle' })).toBeInTheDocument();
  expect(within(row('Taslak talep')).getByRole('button', { name: 'Sil' })).toBeInTheDocument();
  expect(
    within(row('Gönderilen talep')).getByRole('button', { name: 'Düzenle' }),
  ).toBeInTheDocument();
  expect(within(row('Gönderilen talep')).queryByRole('button', { name: 'Sil' })).toBeNull();
  expect(within(row('Onaylı talep')).queryByRole('button', { name: 'Düzenle' })).toBeNull();
  expect(within(row('Onaylı talep')).queryByRole('button', { name: 'Sil' })).toBeNull();
});

it('sends URL filters with the legacy param names and writes typed search to the URL', async () => {
  access.open = new Set([PLANNING]);
  renderPage(
    '/general/department-requests/list?scope=all&status=submitted&department=it&priority=urgent&requestor=5&page=2',
  );
  await screen.findByText('Taslak talep');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '2',
    page_size: '20',
    ordering: '-id',
    status: 'submitted',
    department: 'it',
    priority: 'urgent',
    requestor: '5',
  });

  const search = screen.getByLabelText('Ara');
  fireEvent.change(search, { target: { value: 'GS-10162' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  await waitFor(() => {
    const params = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(params.get('search')).toBe('GS-10162');
    expect(params.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('search')).toBe('GS-10162'));
  expect(listCalls().at(-1)!.url.searchParams.get('page')).toBe('1');
});

it("lets planning switch between their own requests and everyone's", async () => {
  access.open = new Set([PLANNING]);
  renderPage();
  expect(await screen.findByText('Departman Taleplerim')).toBeInTheDocument();
  await screen.findByText('Taslak talep');
  expect(listCalls()[0]!.url.searchParams.get('requestor')).toBe('7');

  fireEvent.click(screen.getByRole('radio', { name: 'Tüm Talepler' }));
  expect(await screen.findByText('Tüm Departman Talepleri')).toBeInTheDocument();
  const params = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');
  expect(params().get('scope')).toBe('all');
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.has('requestor')).toBe(false));
  // Everyone's requests can be narrowed to one requester.
  expect(screen.getAllByRole('button', { name: /^Talep Eden/ }).length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('radio', { name: 'Benim Taleplerim' }));
  expect(await screen.findByText('Departman Taleplerim')).toBeInTheDocument();
  expect(params().has('scope')).toBe(false);
});

it('keeps a requester on their own requests even when the URL asks for all', async () => {
  renderPage('/general/department-requests/list?scope=all&requestor=5');
  await screen.findByText('Taslak talep');
  expect(screen.getByText('Departman Taleplerim')).toBeInTheDocument();
  expect(listCalls().every((c) => c.url.searchParams.get('requestor') === '7')).toBe(true);
});

it('create validates the title, requires an item and posts multipart data', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Talep Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Departman Talebi' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), {
    target: { value: 'Rulman ihtiyacı' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('En az bir ürün eklemelisiniz'));
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  // Every row needs a stock card or "Kart yok"; an empty row is not sent silently.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ürün Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ürün Ekle' }));
  expect(within(dialog).getAllByTestId('item-row')).toHaveLength(2);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(
    await within(dialog).findAllByText('Stok kartı seçin ya da "Kart yok" deyin'),
  ).toHaveLength(2);
  // Name and unit come from the card, not typed.
  expect(within(dialog).getByLabelText('Ürün adı 1')).toHaveAttribute('readonly');
  expect(within(dialog).getByLabelText('Birim 1')).toHaveAttribute('readonly');

  // Row 1: no card fits, so it is described for planning.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kart yok 1' }));
  expect(within(dialog).getByText('Kart yok')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(await within(dialog).findByText('Malzemeyi yazın')).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Ürün adı 1'), {
    target: { value: 'Özel conta' },
  });
  fireEvent.change(within(dialog).getByLabelText('Ürün açıklaması 1'), {
    target: { value: 'Ø40 viton' },
  });

  // Row 2: a card searched by name; code, name and unit fill in from it.
  const code2 = within(dialog).getByLabelText('Ürün kodu 2');
  code2.focus();
  fireEvent.change(code2, { target: { value: 'rulm' } });
  fireEvent.click(await screen.findByRole('option', { name: 'K-1 — Rulman • ADET', hidden: true }));
  expect(within(dialog).getByLabelText('Ürün adı 2')).toHaveValue('Rulman');
  expect(within(dialog).getByLabelText('Birim 2')).toHaveValue('adet');
  fireEvent.change(within(dialog).getByLabelText('Miktar 2'), { target: { value: '3' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/planning/department-requests/');
  const body = post.body as FormData;
  expect(body).toBeInstanceOf(FormData);
  expect(body.get('title')).toBe('Rulman ihtiyacı');
  expect(body.get('priority')).toBe('normal');
  expect(body.has('needed_date')).toBe(false);
  expect(JSON.parse(String(body.get('items')))).toEqual([
    {
      item_code: null,
      item_name: 'Özel conta',
      job_no: null,
      item_unit: 'adet',
      quantity: 1,
      item_description: 'Ø40 viton',
      item_specifications: null,
      no_card: true,
    },
    {
      item_id: 7,
      item_code: 'K-1',
      item_name: 'Rulman',
      job_no: null,
      item_unit: 'adet',
      quantity: 3,
      item_description: null,
      item_specifications: null,
    },
  ]);
  expect(body.has('file_item_mapping')).toBe(false);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Yeni Departman Talebi' })).toBeNull(),
  );
});

it('removing an item row keeps a file mapped to the later row', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Talep Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Departman Talebi' });
  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: 'T' } });
  for (let i = 0; i < 3; i += 1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ürün Ekle' }));
  ['A', 'B', 'C'].forEach((name, i) => {
    fireEvent.click(within(dialog).getByRole('button', { name: `Kart yok ${i + 1}` }));
    fireEvent.change(within(dialog).getByLabelText(`Ürün adı ${i + 1}`), {
      target: { value: name },
    });
  });

  const file = new File(['x'], 'cizim.pdf', { type: 'application/pdf' });
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  expect(await within(dialog).findByText('0.00 KB')).toBeInTheDocument();

  // Map to item C only (the file must keep a target, so check C before unchecking Talep).
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'C' }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Talep' }));
  // Remove item A: C moves from index 2 to 1.
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Ürünü Kaldır' })[0]!);
  expect(within(dialog).getByRole('checkbox', { name: 'C' })).toBeChecked();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  const body = calls().find((c) => c.method === 'POST')!.body as FormData;
  expect(body.getAll('files')).toHaveLength(1);
  expect(JSON.parse(String(body.get('file_item_mapping')))).toEqual({ '0': [1] });
  expect(
    JSON.parse(String(body.get('items'))).map((i: { item_name: string }) => i.item_name),
  ).toEqual(['B', 'C']);
});

it('Hazır Ürün Ekle adds the preset from its stock card, or warns when there is none', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Talep Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Departman Talebi' });

  fireEvent.click(within(dialog).getByLabelText('Hazır Ürün Ekle'));
  fireEvent.click(await screen.findByRole('option', { name: 'LAZER KESİM', hidden: true }));
  await waitFor(() => expect(within(dialog).getAllByTestId('item-row')).toHaveLength(1));
  expect(within(dialog).getByLabelText('Ürün adı 1')).toHaveValue('LAZER KESİM');
  expect(
    calls()
      .find((c) => c.url.searchParams.has('code__in'))!
      .url.searchParams.get('code__in'),
  ).toBe('F014 0000 0000 000 000');

  // No card with BÜKÜM's code in this mock: nothing is added with a guessed code.
  fireEvent.click(within(dialog).getByLabelText('Hazır Ürün Ekle'));
  fireEvent.click(await screen.findByRole('option', { name: 'BÜKÜM', hidden: true }));
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith(
      'BÜKÜM için stok kartı bulunamadı; kod veya ad ile arayın.',
    ),
  );
  expect(within(dialog).getAllByTestId('item-row')).toHaveLength(1);
});

it('edit patches the four basic fields', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(
    within(screen.getByText('Taslak talep').closest('tr')!).getByRole('button', {
      name: 'Düzenle',
    }),
  );
  const dialog = await screen.findByRole('dialog', { name: 'Departman Talebini Düzenle' });
  // Items and files of the full record are shown read-only.
  expect(within(dialog).getByText('Rulman')).toBeInTheDocument();
  expect(within(dialog).getByText('teklif.pdf')).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Başlık/), { target: { value: 'Yeni başlık' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla güncellendi'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/planning/department-requests/11/');
  expect(patch.body).toEqual({
    title: 'Yeni başlık',
    description: 'Bakım için malzeme',
    priority: 'urgent',
    needed_date: null,
  });
});

it('deletes only after the confirm', async () => {
  renderPage();
  await screen.findByText('Taslak talep');
  fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
  expect(
    await screen.findByText(
      'Bu departman talebini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Departman talebi başarıyla silindi'),
  );
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/planning/department-requests/11/',
  );
});

it('?request=<id> opens the details with items and files', async () => {
  renderPage('/general/department-requests/list?request=11');
  const dialog = await screen.findByRole('dialog', { name: 'Departman Talebi Detayları' });
  expect(await within(dialog).findByText('DR-11')).toBeInTheDocument();
  expect(within(dialog).getByText('Ali Veli')).toBeInTheDocument();
  expect(within(dialog).getByText('Rulman')).toBeInTheDocument();
  // The typed code of an older row, and the badge of a "Kart yok" row.
  expect(within(dialog).getByText('K-1')).toBeInTheDocument();
  expect(within(dialog).getByText('Özel conta')).toBeInTheDocument();
  expect(within(dialog).getByText('Kart yok')).toBeInTheDocument();
  expect(within(dialog).getByText('teklif.pdf')).toHaveAttribute(
    'href',
    'https://files.test/teklif.pdf',
  );

  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('request='));
});
