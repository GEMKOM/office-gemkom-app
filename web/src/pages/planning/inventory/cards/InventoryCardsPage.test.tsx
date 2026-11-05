import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { InventoryCardsPage } from './InventoryCardsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A stock-card manager: edit, delete and "Yeni kart" are shown.
  isSuperuser: () => true,
  hasPerm: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const ITEMS = [
  {
    id: 1,
    code: 'M-001',
    name: 'Cıvata M8',
    unit: 'ADET',
    unit_label: 'Adet',
    item_type: 'stock',
    item_type_label: 'Stok',
    stock_quantity: '12.50',
    latest_unit_price_eur: '3.2',
    latest_unit_price_source: 'po_line',
    category: 18,
    category_code: '0018',
    category_name: 'Civata',
    category_group: 'Bağlantı elemanı',
  },
  {
    id: 2,
    code: 'M-002',
    name: 'Kaynak Teli',
    unit: 'kg',
    unit_label: 'KG',
    item_type: 'expenditure',
    item_type_label: 'Masraf',
    stock_quantity: '0',
    latest_unit_price_eur: null,
    latest_unit_price_source: null,
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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/procurement/items/');
const lastListParams = () => Object.fromEntries(listCalls().at(-1)!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/planning/inventory/cards') {
  return renderWithProviders(
    <ModalsProvider>
      <InventoryCardsPage />
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
    if (method === 'GET' && path === '/procurement/items/') {
      return json({ count: 45, next: null, previous: null, results: ITEMS });
    }
    if (method === 'GET' && path === '/procurement/items/1/purchase-requests/') {
      return json([
        {
          id: 7,
          request_number: 'SAT-123',
          title: 'Cıvata alımı',
          status_label: 'Onaylandı',
          priority: 'normal',
          requestor: 'ahmet',
          created_at: '2026-03-01T10:00:00Z',
          item_details: { quantity: '100.00' },
          total_amount_eur: '320',
        },
      ]);
    }
    if (method === 'GET' && path === '/warehouse/stock-balances/') {
      return json({
        count: 3,
        results: [
          {
            id: 1,
            item: 1,
            warehouse_code: 'HAMMADDE',
            warehouse_name: 'Hammadde',
            job_no: '',
            quantity: '12.500',
            updated_at: '',
          },
          {
            id: 2,
            item: 1,
            warehouse_code: 'IS_EMRI',
            warehouse_name: 'İş Emri',
            job_no: '',
            quantity: '40.000',
            updated_at: '',
          },
          {
            id: 3,
            item: 1,
            warehouse_code: 'IS_EMRI',
            warehouse_name: 'İş Emri',
            job_no: '254-01',
            quantity: '-2.000',
            updated_at: '',
          },
        ],
      });
    }
    if (method === 'GET' && path === '/warehouse/stock-movements/') {
      return json({
        count: 1,
        results: [
          {
            id: 9,
            movement_type: 'issue_to_production',
            movement_type_label: 'İmalata çıkış',
            item: 1,
            quantity: '6.000',
            from_warehouse_code: 'IS_EMRI',
            from_job_no: '254-01',
            to_warehouse_code: null,
            to_job_no: '',
            occurred_at: '2026-11-05T10:00:00Z',
            created_by_name: 'Depo',
            note: 'MPR-2026-0099 → Kaynak 1',
            planning_request_number: 'GR-2026-0010',
            pull_request_number: 'MPR-2026-0099',
            reverses: null,
          },
        ],
      });
    }
    if (method === 'GET' && path === '/procurement/item-categories/') {
      return json([
        {
          id: 18,
          code: '0018',
          name: 'Civata',
          group: 'Bağlantı elemanı',
          default_unit: 'adet',
          material_class: 'normal',
          is_active: true,
        },
        {
          id: 76,
          code: '0076',
          name: 'Çelik halat',
          group: 'Rulman - güç aktarımı',
          default_unit: 'metre',
          material_class: 'normal',
          is_active: true,
        },
      ]);
    }
    if (method === 'POST' && path === '/procurement/items/') {
      const body = JSON.parse(String(init?.body)) as { code: string };
      if (body.code === 'M-001')
        return json({ code: ['item with this code already exists.'] }, 400);
      return json({ id: 99, ...body });
    }
    if (method === 'PUT') return json({ ...ITEMS[0], name: 'Cıvata M10' });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the header and the item rows with the legacy request', async () => {
  renderPage();
  expect(screen.getAllByText('Stok Kartları').length).toBeGreaterThan(0);
  expect(await screen.findByText('M-001')).toBeInTheDocument();
  expect(screen.getByText('Cıvata M8')).toBeInTheDocument();
  expect(screen.getByText('Kaynak Teli')).toBeInTheDocument();
  expect(screen.getByText('12,50')).toBeInTheDocument();
  expect(screen.getByText('PO')).toBeInTheDocument();
  expect(screen.getByText('YOK')).toBeInTheDocument();
  expect(within(document.getElementById('total-items-count')!).getByText('45')).toBeInTheDocument();

  // Active cards by default.
  expect(lastListParams()).toEqual({
    page: '1',
    page_size: '20',
    is_active: 'true',
    ordering: 'code',
  });
});

it('applying filters writes the URL and maps the lookup types to the legacy params', async () => {
  renderPage('/planning/inventory/cards?page=3');
  await screen.findByText('M-001');
  expect(lastListParams().page).toBe('3');

  fireEvent.change(screen.getByLabelText('Ürün Kodu'), { target: { value: 'M-0' } });
  fireEvent.keyDown(screen.getByLabelText('Ürün Kodu'), { key: 'Enter' });
  await waitFor(() =>
    expect(lastListParams()).toEqual({
      page: '1',
      page_size: '20',
      code: 'M-0',
      is_active: 'true',
      ordering: 'code',
    }),
  );

  fireEvent.click(screen.getByRole('button', { name: /Filtre Tipi \(Kod\)/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Tam Eşleşme' }));
  await waitFor(() => expect(lastListParams().code__exact).toBe('M-0'));
  expect(lastListParams()).not.toHaveProperty('code');

  fireEvent.click(screen.getByRole('button', { name: /Ürün Tipi/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Masraf' }));
  await waitFor(() =>
    expect(lastListParams()).toEqual({
      page: '1',
      page_size: '20',
      code__exact: 'M-0',
      item_type: 'expenditure',
      is_active: 'true',
      ordering: 'code',
    }),
  );
  const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
  expect(search.get('code')).toBe('M-0');
  expect(search.get('code_lookup')).toBe('exact');
  expect(search.get('item_type')).toBe('expenditure');
  expect(search.has('page')).toBe(false);
});

it('reads name filters and the sort from the URL', async () => {
  // An old link with name_lookup still works: names are searched by "contains".
  renderPage('/planning/inventory/cards?name=vida&name_lookup=startswith&ordering=-stock_quantity');
  await screen.findByText('M-001');
  expect(lastListParams()).toEqual({
    page: '1',
    page_size: '20',
    name: 'vida',
    is_active: 'true',
    ordering: '-stock_quantity',
  });
});

it('the edit form validates and then PUTs every field', async () => {
  renderPage();
  await screen.findByText('M-001');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Stok Kartı Düzenle' });

  const name = within(dialog).getByLabelText(/Ürün Adı/);
  expect(name).toHaveValue('Cıvata M8');
  expect(within(dialog).getByLabelText(/Ürün Kodu/)).toHaveValue('M-001');
  // Stock comes from the ledger: shown, never typed in.
  expect(within(dialog).getByLabelText(/Hammadde Stoğu/)).toHaveAttribute('readonly');

  fireEvent.change(name, { target: { value: '' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'PUT')).toBe(false);

  fireEvent.change(name, { target: { value: 'Cıvata M10' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Stok kartı başarıyla güncellendi'),
  );
  const put = calls().find((c) => c.method === 'PUT')!;
  expect(put.url.pathname).toBe('/procurement/items/1/');
  // The unit comes lower-cased, as legacy mapped it onto UNIT_CHOICES.
  expect(put.body).toEqual({
    code: 'M-001',
    name: 'Cıvata M10',
    unit: 'adet',
    item_type: 'stock',
    category: 18,
    is_active: true,
    min_stock: null,
  });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Stok Kartı Düzenle' })).toBeNull(),
  );
});

it('shows the backend error when the update fails and keeps the modal open', async () => {
  fetchMock.mockImplementation((_url, init) =>
    init?.method === 'PUT'
      ? json({ error: 'Kod zaten var' }, 400)
      : json({ count: 2, next: null, previous: null, results: ITEMS }),
  );
  renderPage();
  await screen.findByText('M-001');
  fireEvent.click(screen.getAllByRole('button', { name: 'Düzenle' })[0]!);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Stok kartı güncellenirken hata oluştu: Kod zaten var',
    ),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

async function clickRowMenuAction(label: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Diğer işlemler' })[0]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
}

it('deletes an item only after the confirm', async () => {
  renderPage();
  await screen.findByText('M-001');

  await clickRowMenuAction('Sil');
  expect(
    await screen.findByText(
      'Cıvata M8 adlı stok kartını silmek istediğinizden emin misiniz? Bu işlem geri alınamaz!',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Stok Kartını Sil' })).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, Sil' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Stok kartı başarıyla silindi'));
  const del = calls().find((c) => c.method === 'DELETE')!;
  expect(del.url.pathname).toBe('/procurement/items/1/');
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('cancelling the confirm deletes nothing', async () => {
  renderPage();
  await screen.findByText('M-001');
  await clickRowMenuAction('Sil');
  fireEvent.click(await screen.findByRole('button', { name: 'İptal' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Stok Kartını Sil' })).toBeNull(),
  );
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
});

it("lists an item's purchase requests in a modal", async () => {
  renderPage();
  await screen.findByText('M-001');
  // Düzenle and Stok Hareketleri stay on the row; the rest is in the menu.
  await clickRowMenuAction('Satın Alma Talepleri');
  const dialog = await screen.findByRole('dialog', { name: 'Satın Alma Talepleri - Cıvata M8' });
  expect(await within(dialog).findByText('SAT-123')).toBeInTheDocument();
  expect(within(dialog).getByText('Onaylandı')).toBeInTheDocument();
  expect(within(dialog).getByText('100.00')).toBeInTheDocument();
  expect(within(dialog).getByText('320,00 €')).toBeInTheDocument();
});

it('closes the requests modal with the legacy message when loading fails', async () => {
  renderPage();
  await screen.findByText('M-001');
  // Item 2's planning requests are not mocked: a 404.
  fireEvent.click(screen.getAllByRole('button', { name: 'Diğer işlemler' })[1]!);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Planlama Talepleri' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Planlama talepleri yüklenirken hata oluştu: Planlama talepleri yüklenirken hata oluştu',
    ),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: /Planlama Talepleri/ })).toBeNull(),
  );
});

it('opens a new stock card: the family sets the unit, a taken code is refused', async () => {
  renderPage();
  await screen.findByText('M-001');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Stok Kartı' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Stok Kartı' });
  // Stock is never typed on a new card.
  expect(within(dialog).queryByLabelText(/Hammadde Stoğu/)).toBeNull();

  fireEvent.change(within(dialog).getByLabelText(/Ürün Kodu/), { target: { value: 'M-001' } });
  fireEvent.change(within(dialog).getByLabelText(/Ürün Adı/), { target: { value: 'HALAT Ø10' } });
  fireEvent.click(within(dialog).getByLabelText(/^Aile/));
  // Mantine keeps every Select's options mounted; the open one may still count as hidden in jsdom.
  fireEvent.click(await screen.findByRole('option', { name: /0076/, hidden: true }));
  await waitFor(() => expect(within(dialog).getByLabelText(/^Birim/)).toHaveValue('Metre'));

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kartı Aç' }));
  expect(
    await within(dialog).findByText('item with this code already exists.'),
  ).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Ürün Kodu/), {
    target: { value: '0076 0010 0000 000 001' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kartı Aç' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Stok kartı açıldı'));
  const posts = calls().filter((c) => c.method === 'POST');
  expect(posts.at(-1)!.body).toEqual({
    code: '0076 0010 0000 000 001',
    name: 'HALAT Ø10',
    unit: 'metre',
    item_type: 'stock',
    category: 76,
    is_active: true,
    min_stock: null,
  });
});

it("shows a card's balances per warehouse and job and its movements", async () => {
  renderPage();
  await screen.findByText('M-001');
  fireEvent.click(screen.getAllByRole('button', { name: 'Stok Hareketleri' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Stok Hareketleri - Cıvata M8' });

  expect(await within(dialog).findByText('atanmamış')).toBeInTheDocument();
  expect(within(dialog).getByText('254-01')).toBeInTheDocument();
  expect(within(dialog).getByText('-2,00')).toBeInTheDocument();
  expect(await within(dialog).findByText('İmalata çıkış')).toBeInTheDocument();
  expect(within(dialog).getByText('İş Emri · 254-01')).toBeInTheDocument();
  expect(within(dialog).getByText('GR-2026-0010 · MPR-2026-0099')).toBeInTheDocument();
  const movements = calls().find((c) => c.url.pathname === '/warehouse/stock-movements/')!;
  expect(movements.url.searchParams.get('item')).toBe('1');
});

it('every column sorts, sending the backend field (prices, families, stock per warehouse)', async () => {
  renderPage();
  await screen.findByText('M-001');
  const sortBy = async (header: RegExp) => {
    fireEvent.click(within(screen.getByRole('columnheader', { name: header })).getByRole('button'));
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
    return lastListParams().ordering;
  };
  for (const header of [
    /^Ürün Kodu/,
    /^Ürün Adı/,
    /^Aile/,
    /^Durum/,
    /^Birim/,
    /^Tip/,
    /^Hammadde/,
    /^İş Emri/,
    /^Mamul/,
    /^Son Birim Fiyat/,
    /^Fiyat Kaynağı/,
  ]) {
    expect(
      within(screen.getByRole('columnheader', { name: header })).getByRole('button'),
    ).toBeTruthy();
  }
  await waitFor(async () => expect(await sortBy(/^İş Emri/)).toBe('job_area_quantity'));
  await waitFor(async () => expect(await sortBy(/^Mamul/)).toBe('finished_quantity'));
  await waitFor(async () => expect(await sortBy(/^Son Birim Fiyat/)).toBe('last_price_eur'));
  await waitFor(async () => expect(await sortBy(/^Son Birim Fiyat/)).toBe('-last_price_eur'));
  await waitFor(async () => expect(await sortBy(/^Aile/)).toBe('category__code'));
  await waitFor(async () => expect(await sortBy(/^Birim/)).toBe('unit'));
  // The URL keeps the backend field and reads it back on reload.
  const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
  expect(search.get('ordering')).toBe('unit');
});

it('reads a backend sort field from the URL', async () => {
  renderPage('/planning/inventory/cards?ordering=-last_price_eur');
  await screen.findByText('M-001');
  expect(lastListParams().ordering).toBe('-last_price_eur');
  expect(screen.getByRole('columnheader', { name: /^Son Birim Fiyat/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
});

it('typing into the Ürün Adı filter searches by name and does not crash', async () => {
  renderPage();
  await screen.findByText('M-001');
  expect(screen.queryByRole('button', { name: /Filtre Tipi \(Ad\)/ })).toBeNull();
  // The filter chip (the column header's sort button has the same name, later on).
  fireEvent.click(screen.getAllByRole('button', { name: /^Ürün Adı/ })[0]!);
  const input = await screen.findByRole('textbox', { name: 'Ürün Adı' });
  // Regression: the change handler read event.currentTarget inside a state
  // updater, after React had cleared it (TypeError: reading 'value').
  fireEvent.change(input, { target: { value: 'v' } });
  fireEvent.change(input, { target: { value: 'vida' } });
  expect(input).toHaveValue('vida');
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(lastListParams().name).toBe('vida'));
  expect(lastListParams()).not.toHaveProperty('name__startswith');
});

it('the Aile column shows the family name only, the code in the tooltip', async () => {
  renderPage();
  await screen.findByText('M-001');
  const cell = screen.getByText('Civata');
  expect(cell).toHaveAttribute('title', 'Bağlantı elemanı · 0018 · Civata');
  expect(screen.queryByText('0018')).toBeNull();
});
