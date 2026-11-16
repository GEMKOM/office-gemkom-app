import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PiecesPage } from '../pieces/PiecesPage';
import { PieceCountsPage } from './PieceCountsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

let status = 'draft';
const COUNT = () => ({
  id: 3,
  number: 'SBS-2026-0003',
  warehouse: 1,
  warehouse_code: 'HAMMADDE',
  warehouse_name: 'Hammadde Deposu',
  status,
  status_label: status === 'posted' ? 'İşlendi' : 'Taslak',
  counted_on: '2026-11-11',
  note: '',
  created_by_name: 'Depo',
  created_at: '2026-11-11T09:00:00Z',
  posted_by_name: null,
  posted_at: null,
  line_count: 2,
  counted_count: 1,
  difference_count: 0,
  counted_pieces: 3,
  totals: { kg: '1059.750', pieces_without_weight: 2 },
});
const LINES = [
  {
    id: 11,
    item: 10,
    item_code: '0100 0000 0010 000 000',
    item_name: '10 mm ST 37-2 SAC',
    kind: 'plate',
    piece: 1,
    width_mm: '1500.0',
    length_mm: '3000.0',
    job_no: '',
    counted_quantity: 3,
    system_quantity: 4,
    difference: -1,
    unit_kg: '353.250',
    counted_kg: '1059.750',
    heat_number: '',
    certificate_no: '',
    note: '',
    result_piece: null,
  },
  {
    id: 12,
    item: 20,
    item_code: '0008 0080 0050 005 000',
    item_name: 'KUTU PROFİL 80*50*5',
    kind: 'boy',
    piece: null,
    width_mm: null,
    length_mm: '6000.0',
    job_no: '',
    counted_quantity: null,
    system_quantity: 0,
    difference: null,
    unit_kg: null,
    counted_kg: null,
    heat_number: '',
    certificate_no: '',
    note: '',
    result_piece: null,
  },
];
const CARD = {
  id: 20,
  code: '0008 0080 0050 005 000',
  name: 'KUTU PROFİL 80*50*5',
  unit: 'metre',
  is_active: true,
  category_code: '0008',
  category_name: 'Kutu profil',
  kind: 'boy',
  plate_thickness_mm: null,
  kg_per_m: null,
  density_g_cm3: '7.850',
  missing: 'Kartta metre ağırlığı (kg/m) yok.',
  pieces: 0,
  lots: 0,
  kg: '0',
};

function json(body: unknown, code = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: code }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url), 'https://api.test'),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

beforeEach(() => {
  status = 'draft';
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    if (method === 'GET' && u.pathname === '/warehouse/piece-counts/') {
      return json({ count: 1, results: [COUNT()] });
    }
    if (method === 'POST' && u.pathname === '/warehouse/piece-counts/') return json(COUNT(), 201);
    if (method === 'GET' && u.pathname === '/warehouse/piece-counts/3/') return json(COUNT());
    if (method === 'GET' && u.pathname === '/warehouse/piece-counts/3/lines/') {
      return json({ count: 2, results: LINES });
    }
    if (method === 'POST' && u.pathname === '/warehouse/piece-counts/3/lines/')
      return json(COUNT());
    if (method === 'POST' && u.pathname === '/warehouse/piece-counts/3/prefill/') {
      return json({ added: 2 });
    }
    if (method === 'POST' && u.pathname === '/warehouse/piece-counts/3/post/') {
      status = 'posted';
      return json(COUNT());
    }
    if (u.pathname === '/warehouse/pieces/cards/') {
      return json({ count: 1, results: u.searchParams.get('in_stock') ? [] : [CARD] });
    }
    if (u.pathname === '/warehouse/pieces/mikro-comparison/') {
      return json({
        count: 3,
        results: [
          {
            item: 10,
            code: '0100 0000 0010 000 000',
            name: '10 mm ST 37-2 SAC',
            unit: 'kg',
            kind: 'plate',
            category_code: '0100',
            pieces: 4,
            kg: 1413,
            metre: 12,
            basis: 'kg',
            stock: 1413,
            mikro: 1500,
            difference: -87,
            missing: '',
            in_app: true,
          },
          {
            item: 21,
            code: '0100 0000 0012 000 005',
            name: '12 mm ST 44-2 SAC',
            unit: 'kg',
            kind: 'plate',
            category_code: '0100',
            pieces: 1,
            kg: null,
            metre: 1,
            basis: 'kg',
            stock: null,
            mikro: 80,
            difference: null,
            missing: 'Kartta sac kalınlığı yok.',
            in_app: true,
          },
          {
            item: null,
            code: '0100 0000 0030 000 000',
            name: '30 mm SAC',
            unit: '',
            kind: null,
            category_code: '0100',
            pieces: 0,
            kg: null,
            metre: 0,
            basis: '',
            stock: null,
            mikro: 2000,
            difference: null,
            missing: 'Uygulamada kart yok',
            in_app: false,
          },
        ],
      });
    }
    if (u.pathname === '/warehouse/pieces/') return json({ count: 0, results: [] });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

function renderCounts(route = '/warehouse/piece-counts') {
  return renderWithProviders(
    <ModalsProvider>
      <PieceCountsPage />
    </ModalsProvider>,
    { route },
  );
}

it('creates a count and opens it', async () => {
  renderCounts();
  expect(await screen.findByText('SBS-2026-0003')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Sayım' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Sac ve Boy Sayımı' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('SBS-2026-0003 oluşturuldu'));
  expect(await screen.findByText('Sac ve Boy Sayımı SBS-2026-0003')).toBeInTheDocument();
});

it('counts lots, adds pieces the system did not know, and posts', async () => {
  renderCounts('/warehouse/piece-counts?sayim=3');
  expect(await screen.findByText('1500 × 3000 mm')).toBeInTheDocument();
  expect(screen.getByText('Yeni')).toBeInTheDocument(); // the line with no lot
  expect(screen.getAllByText('1.059,75 kg')).toHaveLength(2); // the line and the band's total
  expect(screen.getByText('Ağırlık (2 parça hariç)')).toBeInTheDocument();

  // Count the new bar line.
  const counted = screen.getByLabelText('Sayılan 0008 0080 0050 005 000 6000 mm');
  fireEvent.change(counted, { target: { value: '4' } });
  fireEvent.blur(counted);
  await waitFor(() =>
    expect(
      calls().find((c) => c.method === 'POST' && c.url.pathname.endsWith('/lines/'))?.body,
    ).toEqual([{ id: 12, counted_quantity: 4 }]),
  );

  // Add a bar the system did not know.
  const picker = screen.getByRole('combobox', { name: 'Stok kartı' });
  picker.focus();
  fireEvent.change(picker, { target: { value: 'kutu' } });
  fireEvent.click(
    await screen.findByRole('option', { name: /KUTU PROFİL 80\*50\*5/, hidden: true }),
  );
  expect(await screen.findByText(/Bu kartın parçaları ağırlıksız kalır/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Boy (mm)'), { target: { value: '2500' } });
  fireEvent.change(screen.getByLabelText('Adet'), { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('0008 0080 0050 005 000 sayıma eklendi'),
  );
  const added = calls().filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/lines/'));
  expect(added.at(-1)!.body).toEqual([
    { item: 20, width_mm: null, length_mm: '2500', counted_quantity: 3, heat_number: '' },
  ]);

  fireEvent.click(screen.getByRole('button', { name: 'Sistemdeki Parçalardan Doldur' }));
  const prefill = await screen.findByRole('dialog', { name: 'Sistemdeki Parçalardan Doldur' });
  fireEvent.click(within(prefill).getByRole('button', { name: 'Doldur' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('2 satır eklendi'));

  fireEvent.click(screen.getByRole('button', { name: 'Sayımı İşle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('SBS-2026-0003 işlendi'));
});

it('compares the piece stock with Mikro, each card in its own unit', async () => {
  renderWithProviders(
    <ModalsProvider>
      <PiecesPage />
    </ModalsProvider>,
    { route: '/warehouse/pieces?view=mikro' },
  );
  expect(await screen.findByText('10 mm ST 37-2 SAC')).toBeInTheDocument();
  const [, plate, unweighed, missing] = screen.getAllByRole('row');
  expect(within(plate!).getByText('1.413,00 kg')).toBeInTheDocument();
  expect(within(plate!).getByText('-87,00 kg')).toBeInTheDocument();
  expect(within(unweighed!).getByText('Ağırlık yok')).toBeInTheDocument();
  expect(within(unweighed!).getByText('Kartta sac kalınlığı yok.')).toBeInTheDocument();
  expect(within(missing!).getByText('Uygulamada kart yok')).toBeInTheDocument();
});
