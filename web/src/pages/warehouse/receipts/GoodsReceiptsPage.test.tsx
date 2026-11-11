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

beforeEach(() => {
  cancelled = false;
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
    if (method === 'POST' && u.pathname === '/warehouse/goods-receipts/') return json(RECEIPT, 201);
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
    if (u.pathname === '/warehouse/goods-receipts/order-lines/') return json(ORDER_LINES);
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

it('receives a purchase order with the irsaliye, line by line', async () => {
  renderPage();
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
  renderPage('/warehouse/goods-receipts?mk=2');
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Geri Al' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Geri Al' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('MK-2026-0002 geri alındı'));
  expect(calls().some((c) => c.url.pathname === '/warehouse/goods-receipts/2/cancel/')).toBe(true);
  await waitFor(() => expect(screen.getByText('İptal Edildi')).toBeInTheDocument());
});
