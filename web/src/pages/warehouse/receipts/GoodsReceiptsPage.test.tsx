import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { GoodsReceiptsPage } from './GoodsReceiptsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A warehouse user: may receive and cancel.
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const RECEIPT = {
  id: 2,
  number: 'MK-2026-0002',
  purchase_order: 41,
  supplier_name: 'Tedarikçi A',
  pr_number: 'PR-2026-0100',
  irsaliye_no: 'IRS-77',
  irsaliye_date: '2026-11-09',
  note: '',
  status: 'posted',
  status_label: 'İşlendi',
  created_by_name: 'Depo',
  created_at: '2026-11-09T08:00:00Z',
  cancelled_by_name: null,
  cancelled_at: null,
  lines: [
    {
      id: 5,
      po_line: 301,
      item_code: '0018 0012 0040 000 001',
      item_name: 'CİVATA M12x40',
      item_unit: 'adet',
      quantity: '4.00',
      job_no: '254-01',
      delivery: 9,
      note: '',
    },
  ],
};

const PENDING = [
  {
    po_line: 301,
    purchase_order: 41,
    supplier: 7,
    supplier_name: 'Tedarikçi A',
    pr_number: 'PR-2026-0100',
    ordered_at: '2026-11-01',
    item: 11,
    item_code: '0018 0012 0040 000 001',
    item_name: 'CİVATA M12x40',
    item_unit: 'adet',
    ordered: '10.00',
    received: '4.00',
    remaining: '6.00',
    delivery_days: 5,
    expected_date: '2026-11-06',
    overdue: true,
    job_no: '254-01',
    destination: 'İş Emri · 254-01',
    piece_kind: null,
  },
  {
    po_line: 302,
    purchase_order: 41,
    supplier: 7,
    supplier_name: 'Tedarikçi A',
    pr_number: 'PR-2026-0100',
    ordered_at: '2026-11-01',
    item: 12,
    item_code: '0003 0012 0000 000 001',
    item_name: 'SOMUN M12',
    item_unit: 'adet',
    ordered: '20.00',
    received: '0.00',
    remaining: '20.00',
    delivery_days: null,
    expected_date: null,
    overdue: false,
    job_no: '',
    destination: 'Hammadde',
    piece_kind: null,
  },
];

const ORDER_LINES = [
  {
    po_line: 301,
    item: 7,
    item_code: '0018 0012 0040 000 001',
    item_name: 'CİVATA M12x40',
    item_unit: 'adet',
    ordered: '10.00',
    received: '4.00',
    outstanding: '6.00',
    receivable: '6.00',
    planning_item: 88,
    job_no: '254-01',
    destination: 'İş Emri · 254-01',
    reason: '',
  },
  {
    po_line: 302,
    item: 8,
    item_code: '0003 0012 0000 000 001',
    item_name: 'SOMUN M12',
    item_unit: 'adet',
    ordered: '20.00',
    received: '0.00',
    outstanding: '20.00',
    receivable: '20.00',
    planning_item: null,
    job_no: '1000',
    destination: 'Hammadde',
    reason: '',
  },
  {
    po_line: 303,
    item: 9,
    item_code: '0024 0012 0000 000 001',
    item_name: 'PUL M12',
    item_unit: 'adet',
    ordered: '5.00',
    received: '0.00',
    outstanding: '5.00',
    receivable: '0.00',
    planning_item: 90,
    job_no: '254-01',
    destination: 'İş Emri · 254-01',
    reason: 'Planlama kalemi zaten tamamen karşılanmış.',
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

function renderPage(route = '/warehouse/goods-receipts') {
  return renderWithProviders(
    <ModalsProvider>
      <GoodsReceiptsPage />
    </ModalsProvider>,
    { route },
  );
}

let cancelled = false;
let plateOrder = false;

// A plate line: received with its pieces.
const PLATE_LINE = {
  po_line: 401,
  item: 12,
  item_code: '0100 0000 0010 000 000',
  item_name: '10 mm ST 37-2 SAC',
  item_unit: 'kg',
  ordered: '1000.00',
  received: '0.00',
  outstanding: '1000.00',
  receivable: '1000.00',
  planning_item: 91,
  job_no: '254-01',
  destination: 'İş Emri · 254-01',
  reason: '',
  piece_kind: 'plate',
  plate_thickness_mm: '10.00',
  kg_per_m: null,
  weight_missing: '',
};
const PLATE_RECEIPT = {
  ...RECEIPT,
  id: 3,
  number: 'MK-2026-0003',
  lines: [
    {
      id: 6,
      po_line: 401,
      item_code: PLATE_LINE.item_code,
      item_name: PLATE_LINE.item_name,
      item_unit: 'kg',
      quantity: '706.50',
      job_no: '254-01',
      delivery: 10,
      note: '',
      pieces: [
        {
          id: 70,
          width_mm: '1500.0',
          length_mm: '3000.0',
          quantity: 2,
          in_stock: 2,
          unit_kg: '353.250',
          heat_number: 'H-1',
          certificate_no: '',
        },
      ],
      pieces_kg: '706.500',
    },
  ],
};

beforeEach(() => {
  cancelled = false;
  plateOrder = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    const current = cancelled
      ? { ...RECEIPT, status: 'cancelled', status_label: 'İptal Edildi' }
      : RECEIPT;
    if (method === 'GET' && u.pathname === '/warehouse/goods-receipts/') {
      return json({ count: 1, results: [current] });
    }
    if (method === 'POST' && u.pathname === '/warehouse/goods-receipts/') {
      return json(plateOrder ? PLATE_RECEIPT : RECEIPT, 201);
    }
    if (u.pathname === '/warehouse/goods-receipts/pending-lines/') {
      return json({
        count: 2,
        overdue_count: 1,
        suppliers: [{ id: 7, name: 'Tedarikçi A', lines: 2 }],
        results: PENDING,
      });
    }
    if (u.pathname === '/warehouse/goods-receipts/orders/') {
      return json({
        count: 1,
        results: [
          {
            id: 41,
            supplier_name: 'Tedarikçi A',
            pr_number: 'PR-2026-0100',
            pr_title: 'Bağlantı elemanları',
            status: 'awaiting_payment',
            status_label: 'Ödeme Bekliyor',
            created_at: '2026-11-01T08:00:00Z',
            line_count: 3,
          },
        ],
      });
    }
    if (u.pathname === '/warehouse/goods-receipts/order-lines/') {
      return json(plateOrder ? [PLATE_LINE] : ORDER_LINES);
    }
    if (method === 'POST' && u.pathname === '/warehouse/pieces/weight-preview/') {
      return json({
        unit_kg: '353.250',
        total_kg: '353.250',
        density_g_cm3: '7.850',
        plate_thickness_mm: '10.00',
        kg_per_m: null,
        missing: '',
      });
    }
    if (method === 'GET' && u.pathname === '/warehouse/goods-receipts/3/')
      return json(PLATE_RECEIPT);
    if (method === 'POST' && u.pathname === '/warehouse/goods-receipts/2/cancel/') {
      cancelled = true;
      return json({ ...RECEIPT, status: 'cancelled' });
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

it('opens on Bekleyen Siparişler and receives one line from it', async () => {
  renderPage();
  expect(await screen.findByText('0003 0012 0000 000 001')).toBeInTheDocument();
  expect(screen.getByText('2 satır · 1 geciken')).toBeInTheDocument();
  expect(screen.getByText(/gün gecikti/)).toBeInTheDocument();
  expect(screen.getByText('Teslim süresi yok')).toBeInTheDocument();
  // The default shows the last 3 months' orders.
  const pending = calls().find(
    (c) => c.url.pathname === '/warehouse/goods-receipts/pending-lines/',
  )!;
  expect(pending.url.searchParams.get('ordered_since')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  fireEvent.click(screen.getAllByRole('button', { name: 'Kabul Et' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Mal Kabul' });
  // The order is chosen; only that line starts filled.
  expect(await within(dialog).findByLabelText('Bu teslimat 0003 0012 0000 000 001')).toHaveValue(
    '20.00',
  );
  expect(within(dialog).getByLabelText('Bu teslimat 0018 0012 0040 000 001')).toHaveValue('0');
  fireEvent.change(within(dialog).getByLabelText(/İrsaliye No/), { target: { value: 'IRS-80' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalled());
  const create = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/goods-receipts/',
  )!;
  expect(create.body).toMatchObject({
    purchase_order: 41,
    lines: [{ po_line: 302, quantity: '20' }],
  });
});

it('switches to the posted receipts', async () => {
  renderPage();
  fireEvent.click(await screen.findByText('Mal Kabuller'));
  expect(await screen.findByText('MK-2026-0002')).toBeInTheDocument();
});

it('dates: days since, days late', async () => {
  const { sinceDate, daysLate } = await import('./GoodsReceiptsPage');
  const now = new Date(2026, 10, 17);
  expect(sinceDate('30', now)).toBe('2026-10-18');
  expect(sinceDate('all', now)).toBeUndefined();
  expect(daysLate('2026-11-10', now)).toBe(7);
  expect(daysLate('2026-11-20', now)).toBe(0);
  expect(daysLate(null, now)).toBe(0);
});

it('receives a purchase order with the irsaliye, line by line', async () => {
  renderPage('/warehouse/goods-receipts?view=kabuller');
  expect(await screen.findByText('MK-2026-0002')).toBeInTheDocument();
  expect(screen.getByText('IRS-77 · 09.11.2026')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Yeni Mal Kabul' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Mal Kabul' });

  const order = within(dialog).getByLabelText(/Sipariş/);
  order.focus();
  fireEvent.change(order, { target: { value: 'Tedarik' } });
  fireEvent.click(await screen.findByRole('option', { name: /#41 · Tedarikçi A/, hidden: true }));

  // The open lines are pre-filled; a fully covered planning line says why.
  expect(
    await within(dialog).findByText('Planlama kalemi zaten tamamen karşılanmış.'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('Hammadde')).toBeInTheDocument();
  expect(within(dialog).getByText('Planlama kalemi yok')).toBeInTheDocument();

  // No irsaliye number, no receipt.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(notify.warning).toHaveBeenCalledWith('İrsaliye numarasını girin');

  fireEvent.change(within(dialog).getByLabelText(/İrsaliye No/), { target: { value: 'IRS-77' } });
  fireEvent.change(within(dialog).getByLabelText('Bu teslimat 0018 0012 0040 000 001'), {
    target: { value: '4' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('MK-2026-0002 işlendi'));

  const create = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/goods-receipts/',
  )!;
  expect(create.body).toMatchObject({
    purchase_order: 41,
    irsaliye_no: 'IRS-77',
    lines: [
      { po_line: 301, quantity: '4' },
      { po_line: 302, quantity: '20' },
    ],
  });
});

it('opens a receipt from the link and cancels it after the confirm', async () => {
  renderPage('/warehouse/goods-receipts?view=kabuller&mk=2');
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Geri Al' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Geri Al' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('MK-2026-0002 geri alındı'));
  expect(calls().some((c) => c.url.pathname === '/warehouse/goods-receipts/2/cancel/')).toBe(true);
  await waitFor(() => expect(screen.getByText('İptal Edildi')).toBeInTheDocument());
});

it('receives a plate line with the pieces that came', async () => {
  plateOrder = true;
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Yeni Mal Kabul' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Mal Kabul' });
  const order = within(dialog).getByLabelText(/Sipariş/);
  order.focus();
  fireEvent.change(order, { target: { value: 'Tedarik' } });
  fireEvent.click(await screen.findByRole('option', { name: /#41 · Tedarikçi A/, hidden: true }));
  fireEvent.change(within(dialog).getByLabelText(/İrsaliye No/), { target: { value: 'IRS-9' } });
  fireEvent.change(await within(dialog).findByLabelText('Bu teslimat 0100 0000 0010 000 000'), {
    target: { value: '706.5' },
  });

  // No pieces yet: not saved.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  expect(notify.warning).toHaveBeenCalledWith(
    '0100 0000 0010 000 000: gelen parçaları (ölçü ve adet) girin',
  );

  const piece = (field: string) =>
    within(dialog).getByLabelText(`0100 0000 0010 000 000 parça 1 ${field}`);
  fireEvent.change(piece('en'), { target: { value: '1500' } });
  fireEvent.change(piece('boy'), { target: { value: '3000' } });
  fireEvent.change(piece('adet'), { target: { value: '2' } });
  fireEvent.change(piece('döküm no'), { target: { value: 'H-1' } });
  // The weight comes from the backend preview.
  expect(await within(dialog).findByText('2 parça · 706,50 kg')).toBeInTheDocument();
  expect(within(dialog).queryByText(/İrsaliyedeki miktar/)).not.toBeInTheDocument();
  // An irsaliye kg far from what the pieces weigh is flagged.
  fireEvent.change(within(dialog).getByLabelText('Bu teslimat 0100 0000 0010 000 000'), {
    target: { value: '500' },
  });
  expect(await within(dialog).findByText(/İrsaliyedeki miktar \(500,00 kg\)/)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText('Bu teslimat 0100 0000 0010 000 000'), {
    target: { value: '706.5' },
  });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet ve İşle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('MK-2026-0003 işlendi'));
  const create = calls().find(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/goods-receipts/',
  )!;
  expect(create.body).toMatchObject({
    lines: [
      {
        po_line: 401,
        quantity: '706.5',
        pieces: [
          {
            width_mm: '1500',
            length_mm: '3000',
            quantity: 2,
            heat_number: 'H-1',
            certificate_no: '',
          },
        ],
      },
    ],
  });
});

it('shows the pieces a receipt brought', async () => {
  renderPage('/warehouse/goods-receipts?mk=3');
  expect(
    await screen.findByText('Parçalar: 1500 × 3000 mm × 2 (döküm H-1) — 706,50 kg'),
  ).toBeInTheDocument();
});

describe('a sized plate / bar order line', () => {
  it('starts its pieces from what is still to come', async () => {
    const { startPieces } = await import('./ReceiptPiecesEditor');
    const [row] = startPieces({
      outstanding_pieces: { width_mm: '1500.0', length_mm: '6000.0', count: 2 },
    });
    expect(row).toMatchObject({ width: 1500, length: 6000, quantity: 2 });
    expect(startPieces({ outstanding_pieces: null })[0]).toMatchObject({
      length: '',
      quantity: '',
    });
  });
});
