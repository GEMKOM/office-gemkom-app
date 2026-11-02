import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { InventoryCardsPage } from './InventoryCardsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

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

  expect(lastListParams()).toEqual({ page: '1', page_size: '20', ordering: 'code' });
});

it('applying filters writes the URL and maps the lookup types to the legacy params', async () => {
  renderPage('/planning/inventory/cards?page=3');
  await screen.findByText('M-001');
  expect(lastListParams().page).toBe('3');

  fireEvent.change(screen.getByLabelText('Ürün Kodu'), { target: { value: 'M-0' } });
  fireEvent.keyDown(screen.getByLabelText('Ürün Kodu'), { key: 'Enter' });
  await waitFor(() =>
    expect(lastListParams()).toEqual({ page: '1', page_size: '20', code: 'M-0', ordering: 'code' }),
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
  renderPage('/planning/inventory/cards?name=vida&name_lookup=startswith&ordering=-stock_quantity');
  await screen.findByText('M-001');
  expect(lastListParams()).toEqual({
    page: '1',
    page_size: '20',
    name__startswith: 'vida',
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
  expect(within(dialog).getByLabelText('Stok Miktarı')).toHaveValue(12.5);

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
    stock_quantity: '12.50',
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Satın Alma Talepleri' })[0]!);
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
