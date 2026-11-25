import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { StockCheckPage } from './StockCheckPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const REQUEST = {
  id: 41,
  request_number: 'GS-10380',
  title: '304-01 bağlantı malzemesi',
  priority: 'urgent',
  needed_date: '2026-11-30',
  status: 'pending_inventory',
  status_label: 'Depo Kontrolü Bekliyor',
  check_inventory: true,
  created_by_full_name: 'Ayşe Planlama',
  items_count: 3,
  items: [
    {
      id: 1,
      item_code: 'BOLT',
      item_name: 'CIVATA M12x40',
      item_unit: 'adet',
      item_material_class: 'normal',
      job_no: '304-01',
      quantity: '20.00',
      quantity_from_inventory: '0.00',
    },
    {
      id: 2,
      item_code: 'NUT',
      item_name: 'SOMUN M12',
      item_unit: 'adet',
      item_material_class: 'normal',
      job_no: '304-01',
      quantity: '10.00',
      quantity_from_inventory: '0.00',
    },
    {
      id: 3,
      item_code: 'PLATE',
      item_name: '10 MM SAC',
      item_unit: 'kg',
      item_material_class: 'plate',
      job_no: '304-01',
      quantity: '400.00',
      quantity_from_inventory: '0.00',
    },
    {
      id: 4,
      // As the API sends it: the card is `item` (item_id is write-only).
      item: 9,
      item_code: 'PIPE',
      item_name: '114,3*15 BORU',
      item_unit: 'metre',
      item_material_class: 'boy',
      job_no: '304-01',
      quantity: '10.00',
      quantity_from_inventory: '0.00',
    },
  ],
};

const BAR_LOT = {
  id: 50,
  item: 9,
  item_code: 'PIPE',
  length_mm: '6000.0',
  width_mm: null,
  quantity: 3,
  available_quantity: 3,
  unit_kg: '240.00',
  warehouse_code: 'HAMMADDE',
};

// What Hammadde holds for the bar card; "Depoda buldum" adds to it.
let hammaddeLots: object[] = [BAR_LOT];

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));

beforeEach(() => {
  hammaddeLots = [BAR_LOT];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, init) => {
    const u = new URL(String(url));
    if (init?.method === 'POST' && u.pathname === '/warehouse/pieces/') {
      const body = JSON.parse(String(init.body));
      const lot = {
        ...BAR_LOT,
        id: 60,
        length_mm: `${body.length_mm}.0`,
        quantity: body.quantity,
        available_quantity: body.quantity,
        needs_review: body.needs_review,
      };
      hammaddeLots = [lot];
      return json(lot);
    }
    if (
      init?.method === 'POST' &&
      u.pathname === '/planning/requests/41/update_inventory_quantities/'
    )
      return json({ planning_request: { ...REQUEST, status: 'pending_erp_entry' } });
    if (u.pathname === '/planning/requests/warehouse_requests/')
      return json({ count: 1, next: null, previous: null, results: [REQUEST] });
    if (u.pathname === '/planning/requests/41/') return json(REQUEST);
    if (u.pathname === '/warehouse/pieces/')
      return json({
        count: hammaddeLots.length,
        next: null,
        previous: null,
        results: hammaddeLots,
      });
    if (u.pathname === '/procurement/items/')
      return json({
        count: 2,
        results: [
          { id: 7, code: 'BOLT', stock_quantity: '12.00' },
          { id: 8, code: 'NUT', stock_quantity: '50.00' },
        ],
      });
    return json({});
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

function renderPage(route = '/warehouse/stock-check') {
  return renderWithProviders(
    <ModalsProvider>
      <StockCheckPage />
    </ModalsProvider>,
    { route },
  );
}

it('lists the requests waiting for the warehouse', async () => {
  renderPage();
  expect(await screen.findByText('GS-10380')).toBeInTheDocument();
  expect(screen.getByText('Acil')).toBeInTheDocument();
  expect(screen.getByText('Depo kontrolü bekliyor')).toBeInTheDocument();
  const list = calls().find((c) => c.url.pathname === '/planning/requests/warehouse_requests/')!;
  expect(list.url.searchParams.get('status')).toBe('pending_inventory');
});

it('shows Hammadde per line, fills what is in stock and finishes the check', async () => {
  renderPage('/warehouse/stock-check?request=41');
  const dialog = await screen.findByRole('dialog', { name: /Stok Kontrolü · GS-10380/ });
  await waitFor(() =>
    expect(within(dialog).getByTestId('hammadde-1')).toHaveTextContent('12,00 adet'),
  );
  expect(within(dialog).getByTestId('hammadde-2')).toHaveTextContent('50,00 adet');
  // Plate lines are stocked as pieces: not filled from stock here.
  expect(within(dialog).getByText('Sac stoktan karşılanmaz')).toBeInTheDocument();

  // Bars are given by picking Hammadde lots: 2 × 6 m of the 10 m line.
  const bars = await within(dialog).findByTestId('bars-4');
  expect(bars).toHaveTextContent('6 m');
  expect(bars).toHaveTextContent('(3 boy)');
  const lots = calls().find((c) => c.url.pathname === '/warehouse/pieces/')!;
  expect(lots.url.searchParams.get('item')).toBe('9');
  expect(lots.url.searchParams.get('warehouse')).toBe('HAMMADDE');
  fireEvent.change(within(dialog).getByLabelText('Boy 4 6 m'), { target: { value: '2' } });
  expect(within(dialog).getByTestId('bars-total-4')).toHaveTextContent(
    '= 10,00 metre (talebin tamamı)',
  );

  // Fill takes what Hammadde has, never more than requested.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stokta Olanı Doldur' }));
  expect(within(dialog).getByLabelText('Bulunan 1')).toHaveValue('12');
  expect(within(dialog).getByLabelText('Bulunan 2')).toHaveValue('10');
  // The warehouse corrects one line by hand.
  fireEvent.change(within(dialog).getByLabelText('Bulunan 2'), { target: { value: '6' } });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kontrolü Tamamla' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tamamla' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Stok kontrolü tamamlandı: stokta olmayanlar satınalmaya gidiyor',
    ),
  );
  const post = calls().find(
    (c) => c.url.pathname === '/planning/requests/41/update_inventory_quantities/',
  )!;
  expect(post.body).toEqual({
    items: [
      { planning_request_item_id: 1, quantity_found: '12.00' },
      { planning_request_item_id: 2, quantity_found: '6.00' },
      { planning_request_item_id: 3, quantity_found: '0.00' },
      {
        planning_request_item_id: 4,
        quantity_found: '0.00',
        pieces: [{ piece: 50, quantity: 2 }],
      },
    ],
  });
});

it('books bars found on the rack into Hammadde (Kontrol) and picks what the line needs', async () => {
  hammaddeLots = [];
  renderPage('/warehouse/stock-check?request=41');
  const dialog = await screen.findByRole('dialog', { name: /Stok Kontrolü · GS-10380/ });
  const bars = await within(dialog).findByTestId('bars-4');
  expect(bars).toHaveTextContent('Hammadde’de bu karttan boy yok');
  fireEvent.click(within(bars).getByRole('button', { name: 'Depoda buldum' }));
  const found = await screen.findByRole('dialog', { name: /Depoda buldum/ });
  fireEvent.change(within(found).getByLabelText('Boy (m)'), { target: { value: '6' } });
  fireEvent.change(within(found).getByLabelText('Adet (boy)'), { target: { value: '4' } });
  fireEvent.click(within(found).getByRole('button', { name: 'Hammadde’ye ekle' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('PIPE: 4 boy Hammadde’ye eklendi (Kontrol)'),
  );
  const created = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/pieces/',
  )!;
  expect(created.body).toEqual({
    item: 9,
    quantity: 4,
    length_mm: '6000',
    warehouse_code: 'HAMMADDE',
    needs_review: true,
    review_note: 'Stok kontrolünde depoda bulundu (GS-10380)',
  });
  // The 10 m line takes 2 of the 4 bars; the other 2 stay in Hammadde.
  expect(await within(dialog).findByLabelText('Boy 4 6 m')).toHaveValue('2');
  expect(within(dialog).getByTestId('bars-4')).toHaveTextContent('(4 boy)');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kontrolü Tamamla' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tamamla' }));
  await waitFor(() =>
    expect(
      calls().some((c) => c.url.pathname === '/planning/requests/41/update_inventory_quantities/'),
    ).toBe(true),
  );
  const post = calls().find(
    (c) => c.url.pathname === '/planning/requests/41/update_inventory_quantities/',
  )!;
  expect(post.body.items[3]).toEqual({
    planning_request_item_id: 4,
    quantity_found: '0.00',
    pieces: [{ piece: 60, quantity: 2 }],
  });
});

it('refuses more than requested', async () => {
  renderPage('/warehouse/stock-check?request=41');
  const dialog = await screen.findByRole('dialog', { name: /Stok Kontrolü · GS-10380/ });
  fireEvent.change(await within(dialog).findByLabelText('Bulunan 1'), { target: { value: '25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kontrolü Tamamla' }));
  expect(notify.warning).toHaveBeenCalledWith('BOLT: bulunan miktar talep edilenden fazla olamaz');
  expect(screen.queryByRole('button', { name: 'Tamamla' })).not.toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
});
