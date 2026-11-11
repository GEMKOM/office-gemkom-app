import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PiecesPage } from './PiecesPage';

let warehouseUser = true;
vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => warehouseUser && code === 'access_warehouse',
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

function renderPage(route = '/warehouse/pieces') {
  return renderWithProviders(
    <ModalsProvider>
      <PiecesPage />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  warehouseUser = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    if (method === 'GET' && u.pathname === '/warehouse/pieces/') {
      return json({ count: 2, results: [NO_WEIGHT_LOT, WEIGHED_LOT] });
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
  renderPage('/warehouse/pieces?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Taşı / Fasona Gönder' }));
  const dialog = await screen.findByRole('dialog', { name: /Taşı \/ Fasona Gönder/ });

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
  renderPage('/warehouse/pieces?view=cards');
  expect(await screen.findByText('Kartta sac kalınlığı yok.')).toBeInTheDocument();
  expect(screen.getByText('8,00 mm')).toBeInTheDocument();
});

it('is read-only without the warehouse grant', async () => {
  warehouseUser = false;
  renderPage('/warehouse/pieces?piece=2');
  expect(await screen.findByText('Fire sac #1053')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Parça Ekle' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Taşı / Fasona Gönder' })).not.toBeInTheDocument();
});
