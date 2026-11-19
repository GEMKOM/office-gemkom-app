import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CncPlateStockPage, WarehouseBarStockPage, WarehousePlateStockPage } from './PiecesPage';

let warehouseUser = true;
// "Page: /route/" grants of the signed-in user (a planner's Kesimler page).
let grantedPages: string[] = [];
vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => warehouseUser && code === 'access_warehouse',
  getGrantedPageRoutes: () => new Set(grantedPages),
  getPermissions: () => ({}),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const LOT_BASE = {
  item_unit: 'kg',
  item_is_active: true,
  category_code: '0100',
  kind: 'plate',
  heat_number: '',
  certificate_no: '',
  warehouse: 1,
  warehouse_code: 'HAMMADDE',
  warehouse_name: 'Hammadde Deposu',
  job_no: '',
  supplier: null,
  supplier_name: null,
  origin: 'remnant',
  origin_label: 'Fire sac',
  parent: null,
  needs_review: false,
  review_note: '',
  note: '',
  created_by_username: null,
  created_at: '2026-11-11T09:00:00Z',
  updated_at: '2026-11-11T09:00:00Z',
};

// A plate card with no thickness yet: its lot has no weight.
const NO_WEIGHT_LOT = {
  ...LOT_BASE,
  id: 1,
  item: 10,
  item_code: '0100 0000 0010 000 000',
  item_name: '10 mm ST 37-2 SAC',
  width_mm: '1500.0',
  length_mm: '3000.0',
  quantity: 2,
  unit_kg: null,
  total_kg: null,
};
const WEIGHED_LOT = {
  ...LOT_BASE,
  id: 2,
  item: 11,
  item_code: '0100 0000 0008 000 005',
  item_name: '8 mm HARDOX 400 SAC',
  width_mm: '1000.0',
  length_mm: '2000.0',
  quantity: 1,
  unit_kg: '125.600',
  total_kg: '125.600',
};

const CARD_BASE = {
  unit: 'kg',
  is_active: true,
  category_code: '0100',
  category_name: 'Sac',
  kind: 'plate',
  kg_per_m: null,
  density_g_cm3: '7.850',
};
const CARDS = [
  {
    ...CARD_BASE,
    id: 10,
    code: NO_WEIGHT_LOT.item_code,
    name: NO_WEIGHT_LOT.item_name,
    plate_thickness_mm: null,
    missing: 'Kartta sac kalınlığı yok.',
    pieces: 2,
    lots: 1,
    kg: null,
  },
  {
    ...CARD_BASE,
    id: 11,
    code: WEIGHED_LOT.item_code,
    name: WEIGHED_LOT.item_name,
    plate_thickness_mm: '8.00',
    missing: '',
    pieces: 1,
    lots: 1,
    kg: '125.600',
  },
];

let lots: unknown[] = [];
const CHANGE = {
  id: 1,
  piece: 2,
  changes: { heat_number: ['', 'H-1'] },
  note: 'sertifikadan',
  created_by_username: 'depo',
  created_at: '2026-11-12T09:00:00Z',
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url), 'https://api.test'),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

function renderPage(route = '/warehouse/plate-stock', page = <WarehousePlateStockPage />) {
  return renderWithProviders(<ModalsProvider>{page}</ModalsProvider>, { route });
}

beforeEach(() => {
  warehouseUser = true;
  grantedPages = [];
  lots = [NO_WEIGHT_LOT, WEIGHED_LOT];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    if (method === 'GET' && u.pathname === '/warehouse/pieces/') {
      return json({ count: lots.length, results: lots });
    }
    if (method === 'GET' && u.pathname === '/warehouse/pieces/cards/') {
      const search = (u.searchParams.get('search') ?? '').toUpperCase();
      return json({ count: 2, results: CARDS.filter((c) => !search || c.name.includes(search)) });
    }
    if (method === 'POST' && u.pathname === '/warehouse/pieces/weight-preview/') {
      return json({
        unit_kg: '125.600',
        total_kg: '251.200',
        density_g_cm3: '7.850',
        plate_thickness_mm: '8.00',
        kg_per_m: null,
        missing: '',
      });
    }
    if (method === 'POST' && u.pathname === '/warehouse/pieces/') {
      return json({ ...WEIGHED_LOT, id: 3, quantity: 2 }, 201);
    }
    if (method === 'GET' && u.pathname === '/warehouse/pieces/2/movements/') {
      return json([
        {
          id: 7,
          piece: 2,
          movement_type: 'migrated',
          movement_type_label: 'Eski kayıttan aktarım',
          quantity: 1,
          unit_kg: '125.600',
          from_warehouse_code: null,
          from_job_no: '',
          from_supplier: null,
          from_supplier_name: null,
          to_warehouse_code: 'HAMMADDE',
          to_job_no: '',
          to_supplier: null,
          to_supplier_name: null,
          related_piece: null,
          note: 'Fire sac #1053',
          created_by_username: null,
          created_at: '2026-11-11T09:00:00Z',
        },
      ]);
    }
    if (method === 'GET' && u.pathname === '/warehouse/pieces/2/changes/') {
      return json([CHANGE]);
    }
    if (method === 'PATCH' && u.pathname === '/warehouse/pieces/2/') {
      return json({ ...WEIGHED_LOT, heat_number: 'D-9', needs_review: false });
    }
    if (method === 'POST' && u.pathname === '/warehouse/pieces/2/move/') {
      return json({
        ...WEIGHED_LOT,
        warehouse: null,
        warehouse_code: null,
        supplier: 5,
        supplier_name: 'Galvaniz A.Ş.',
      });
    }
    if (u.pathname === '/procurement/suppliers/') {
      return json({ count: 1, results: [{ id: 5, name: 'Galvaniz A.Ş.' }] });
    }
    if (u.pathname === '/projects/job-orders/dropdown/') {
      return json([{ job_no: '254-01', title: 'Pres Hattı' }]);
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

it('shows weights from the backend and a clear "ağırlık yok", never 0 kg', async () => {
  renderPage();
  expect(await screen.findByText('10 mm ST 37-2 SAC')).toBeInTheDocument();
  const [, noWeightRow, weighedRow] = screen.getAllByRole('row');
  expect(within(noWeightRow!).getByText('Ağırlık yok')).toBeInTheDocument();
  expect(within(noWeightRow!).getByText('Kartta sac kalınlığı yok')).toBeInTheDocument();
  expect(within(noWeightRow!).queryByText(/0,00 kg/)).not.toBeInTheDocument();
  expect(within(noWeightRow!).getByText('1500 × 3000 mm')).toBeInTheDocument();
  expect(within(weighedRow!).getAllByText('125,60 kg')).toHaveLength(2);

  // The band counts only weighed pieces in the total and says what has none.
  expect(
    await screen.findByText('1 lotun (2 parça) ağırlığı yok', { exact: false }),
  ).toBeInTheDocument();
  expect(screen.getByText('2 parça')).toBeInTheDocument();
});

it('adds plate pieces with the backend weight preview', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Parça Ekle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Parça Ekle' });

  const picker = within(dialog).getByLabelText('Stok kartı');
  picker.focus();
  fireEvent.change(picker, { target: { value: 'hardox' } });
  fireEvent.click(await screen.findByRole('option', { name: /8 mm HARDOX 400 SAC/, hidden: true }));

  fireEvent.change(within(dialog).getByLabelText('En (mm)'), { target: { value: '1000' } });
  fireEvent.change(within(dialog).getByLabelText('Boy (mm)'), { target: { value: '2000' } });
  fireEvent.change(within(dialog).getByLabelText('Adet'), { target: { value: '2' } });
  expect(await within(dialog).findByText('251,20 kg')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('0100 0000 0008 000 005: 2 adet eklendi'),
  );
  const post = calls().find((c) => c.method === 'POST' && c.url.pathname === '/warehouse/pieces/');
  expect(post!.body).toEqual({
    item: 11,
    quantity: 2,
    width_mm: '1000',
    length_mm: '2000',
    heat_number: '',
    certificate_no: '',
    note: '',
    warehouse_code: 'HAMMADDE',
  });
});

it('sends a lot to a supplier (fason) from its detail', async () => {
  renderPage('/warehouse/plate-stock?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Taşı / Fasona Gönder' }));
  const dialog = await screen.findByRole('dialog', { name: /Taşı \/ Fasona Gönder/ });
  // A plate is never put on a job: no İş Emri, Hammadde picked to start with.
  expect(within(dialog).queryByRole('radio', { name: 'İş Emri' })).not.toBeInTheDocument();
  expect(within(dialog).getByRole('radio', { name: 'Hammadde' })).toBeChecked();
  expect(within(dialog).getByText(/Sac İş Emri'ne alınmaz/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('radio', { name: 'Fasona' }));
  const supplier = within(dialog).getByLabelText('Fasoncu');
  supplier.focus();
  fireEvent.change(supplier, { target: { value: 'galv' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Galvaniz A.Ş.', hidden: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalled());
  const move = calls().find((c) => c.url.pathname === '/warehouse/pieces/2/move/');
  expect(move!.body).toEqual({ quantity: 1, note: '', supplier: 5, job_no: '' });
});

it('lists the cards with what each is missing', async () => {
  renderPage('/warehouse/plate-stock?view=cards');
  expect(await screen.findByText('Kartta sac kalınlığı yok.')).toBeInTheDocument();
  expect(screen.getByText('8,00 mm')).toBeInTheDocument();
});

it('is read-only without the warehouse grant', async () => {
  warehouseUser = false;
  renderPage('/warehouse/plate-stock?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Parça Ekle' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Taşı / Fasona Gönder' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument();
});

it('explains the Kartlar "Lot" column: a count of lots, not a lot number', async () => {
  renderPage('/warehouse/plate-stock?view=cards');
  await screen.findByText('8,00 mm');
  expect(screen.getByRole('columnheader', { name: /Lot/ })).toBeInTheDocument();
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Lot nedir?' }));
  expect(
    await screen.findByText(/özdeş parçaların tek kaydı\. Bu sütun kartta kaç lot olduğunu/),
  ).toBeInTheDocument();
});

it('searches on the backend, in Parçalar and in Kartlar', async () => {
  renderPage('/warehouse/plate-stock?search=hardox%201500x3000');
  await waitFor(() =>
    expect(
      calls().some(
        (c) =>
          c.url.pathname === '/warehouse/pieces/' &&
          c.url.searchParams.get('search') === 'hardox 1500x3000',
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Kartlar' }));
  await waitFor(() => {
    const call = calls().find(
      (c) => c.url.pathname === '/warehouse/pieces/cards/' && c.url.searchParams.get('search'),
    );
    expect(call?.url.searchParams.get('search')).toBe('hardox 1500x3000');
    expect(call?.url.searchParams.get('in_stock')).toBe('true');
    expect(call?.url.searchParams.get('kind')).toBe('plate');
  });
});

it('sends the size, origin and kontrol filters', async () => {
  renderPage(
    '/warehouse/plate-stock?thickness=8&min_width=1000&max_width=1500&max_length=3000&origin=converted&review=true',
  );
  await waitFor(() => {
    const call = calls().find(
      (c) => c.url.pathname === '/warehouse/pieces/' && c.url.searchParams.get('thickness_mm'),
    );
    expect(call).toBeDefined();
    const p = call!.url.searchParams;
    expect([
      p.get('thickness_mm'),
      p.get('min_width_mm'),
      p.get('max_width_mm'),
      p.get('max_length_mm'),
      p.get('origin'),
      p.get('needs_review'),
    ]).toEqual(['8', '1000', '1500', '3000', 'converted', 'true']);
    expect(p.has('min_length_mm')).toBe(false);
  });
  expect(screen.getByRole('checkbox', { name: 'Kontrol edilmeli' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

it('edits the heat no of a lot and marks it checked, kept in its history', async () => {
  lots = [
    NO_WEIGHT_LOT,
    { ...WEIGHED_LOT, needs_review: true, review_note: 'Açıklamadan okunan adet' },
  ];
  renderPage('/warehouse/plate-stock?piece=2');
  // The earlier edit shows in the history with who did it.
  expect(await screen.findByText('Döküm no: – → H-1')).toBeInTheDocument();
  expect(screen.getByText('Bilgi düzenlendi')).toBeInTheDocument();
  expect(screen.getByText('sertifikadan')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
  const dialog = await screen.findByRole('dialog', { name: /Lotu Düzenle/ });
  fireEvent.change(within(dialog).getByLabelText('Döküm no'), { target: { value: 'D-9' } });
  fireEvent.click(within(dialog).getByLabelText('Kontrol edildi (işareti kaldır)'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith('Kontrol edildi için açıklama girin'),
  );
  expect(calls().some((c) => c.method === 'PATCH')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Açıklama/), {
    target: { value: 'Sayıldı, doğru' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalled());
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/warehouse/pieces/2/');
  expect(patch.body).toEqual({
    heat_number: 'D-9',
    certificate_no: '',
    note: '',
    needs_review: false,
    change_note: 'Sayıldı, doğru',
  });
});

it('Sac Stoğu asks only for plates: pieces, cards and the card picker', async () => {
  renderPage();
  expect(await screen.findByRole('heading', { name: 'Sac Stoğu' })).toBeInTheDocument();
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/warehouse/pieces/')).toBe(true),
  );
  for (const path of ['/warehouse/pieces/', '/warehouse/pieces/cards/']) {
    const call = calls().find((c) => c.url.pathname === path)!;
    expect(call.url.searchParams.get('kind')).toBe('plate');
  }
  // No Tür filter: the page is one kind.
  expect(screen.queryByLabelText('Tür')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Parça Ekle' }));
  const dialog = await screen.findByRole('dialog', { name: 'Parça Ekle' });
  const picker = within(dialog).getByLabelText('Stok kartı');
  picker.focus();
  fireEvent.change(picker, { target: { value: 'hardox' } });
  await screen.findByRole('option', { name: /8 mm HARDOX 400 SAC/, hidden: true });
  const search = calls().find(
    (c) => c.url.pathname === '/warehouse/pieces/cards/' && c.url.searchParams.get('search'),
  )!;
  expect(search.url.searchParams.get('kind')).toBe('plate');
});

it('Boy Stoğu asks only for bars', async () => {
  renderPage('/warehouse/bar-stock', <WarehouseBarStockPage />);
  expect(await screen.findByRole('heading', { name: 'Boy Stoğu' })).toBeInTheDocument();
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/warehouse/pieces/')).toBe(true),
  );
  for (const path of ['/warehouse/pieces/', '/warehouse/pieces/cards/']) {
    expect(
      calls()
        .find((c) => c.url.pathname === path)!
        .url.searchParams.get('kind'),
    ).toBe('boy');
  }
});

it('the planning Sac Stoğu is the same page, back to CNC Kesim', async () => {
  renderPage('/planning/cnc-cutting/plate-stock', <CncPlateStockPage />);
  expect(await screen.findByRole('heading', { name: 'Sac Stoğu' })).toBeInTheDocument();
  expect(
    screen
      .getAllByRole('link')
      .some((a) => a.getAttribute('href')?.startsWith('/planning/cnc-cutting')),
  ).toBe(true);
});

it('a CNC planner writes plate lots like the warehouse, under Planlama and Depo', async () => {
  warehouseUser = false;
  grantedPages = ['/manufacturing/cnc-cutting/cuts'];
  renderPage('/planning/cnc-cutting/plate-stock?piece=2', <CncPlateStockPage />);
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  for (const name of ['Düzenle', 'Taşı / Fasona Gönder', 'Adedi Düzelt', 'Hurdaya Ayır']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  }
  expect(screen.getByRole('button', { name: 'Parça Ekle' })).toBeInTheDocument();
});

it('a CNC planner adds nothing on Boy Stoğu; a Lineer planner does', async () => {
  warehouseUser = false;
  grantedPages = ['/manufacturing/cnc-cutting/cuts'];
  const first = renderPage('/warehouse/bar-stock', <WarehouseBarStockPage />);
  expect(await screen.findByRole('heading', { name: 'Boy Stoğu' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Parça Ekle' })).not.toBeInTheDocument();
  first.unmount();

  grantedPages = ['/manufacturing/linear-cutting/cuts'];
  renderPage('/warehouse/bar-stock', <WarehouseBarStockPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Parça Ekle' }));
  // The card picker asks for bar cards only.
  const dialog = await screen.findByRole('dialog', { name: 'Parça Ekle' });
  const picker = within(dialog).getByLabelText('Stok kartı');
  picker.focus();
  fireEvent.change(picker, { target: { value: 'boru' } });
  await waitFor(() =>
    expect(
      calls()
        .find(
          (c) => c.url.pathname === '/warehouse/pieces/cards/' && c.url.searchParams.get('search'),
        )
        ?.url.searchParams.get('kind'),
    ).toBe('boy'),
  );
});

it('corrects a lot size with a required note', async () => {
  renderPage('/warehouse/plate-stock?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
  const dialog = await screen.findByRole('dialog', { name: /Lotu Düzenle/ });
  fireEvent.change(within(dialog).getByLabelText('En (mm)'), { target: { value: '1250' } });
  fireEvent.change(within(dialog).getByLabelText('Boy (mm)'), { target: { value: '2500' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith('Ölçü düzeltmesi için açıklama girin'),
  );
  expect(calls().some((c) => c.method === 'PATCH')).toBe(false);
  fireEvent.change(within(dialog).getByLabelText(/Açıklama/), {
    target: { value: 'Ölçüldü' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalled());
  expect(calls().find((c) => c.method === 'PATCH')!.body).toEqual({
    heat_number: '',
    certificate_no: '',
    note: '',
    width_mm: '1250',
    length_mm: '2500',
    change_note: 'Ölçüldü',
  });
});

it('locks the size of a lot a cut has reserved', async () => {
  lots = [
    NO_WEIGHT_LOT,
    { ...WEIGHED_LOT, reserved_quantity: 1, reservations: [{ cnc_task: 'CNC-9', quantity: 1 }] },
  ];
  renderPage('/warehouse/plate-stock?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
  const dialog = await screen.findByRole('dialog', { name: /Lotu Düzenle/ });
  expect(within(dialog).getByLabelText('En (mm)')).toBeDisabled();
  expect(within(dialog).getByText(/Ölçü değiştirilemez: kesime ayrılmış/)).toBeInTheDocument();
});

it('a Lineer Kesim planner may not edit a plate lot', async () => {
  warehouseUser = false;
  grantedPages = ['/manufacturing/linear-cutting/cuts'];
  renderPage('/warehouse/plate-stock?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument();
});
