import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { HammaddePage, IsEmriPage } from './InventoryPages';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  // A warehouse user: may move cards and lots.
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const BOLT = {
  id: 1,
  item: 7,
  item_code: '0018 0012 0040 000 001',
  item_name: 'CİVATA M12x40',
  item_unit: 'adet',
  warehouse_code: 'HAMMADDE',
  job_no: '',
  quantity: '20.000',
  updated_at: '',
};

const SHEETS = {
  id: 31,
  item: 9,
  item_code: '0100 0000 0010 000 000',
  item_name: '10 mm SAC',
  item_unit: 'kg',
  item_is_active: true,
  category_code: '0100',
  kind: 'plate',
  width_mm: '1500.0',
  length_mm: '3000.0',
  quantity: 4,
  reserved_quantity: 0,
  available_quantity: 4,
  reservations: [],
  unit_kg: '353.250',
  total_kg: '1413.000',
  heat_number: '',
  certificate_no: '',
  warehouse: 1,
  warehouse_code: 'HAMMADDE',
  warehouse_name: 'Hammadde Deposu',
  job_no: '',
  supplier: null,
  supplier_name: null,
  origin: 'count',
  origin_label: 'Sayım',
  parent: null,
  needs_review: false,
  review_note: '',
  note: '',
  created_by_username: 'depo',
  created_at: '',
  updated_at: '',
};

const BARS = {
  ...SHEETS,
  id: 32,
  item: 10,
  item_code: '0010 0114 0015 000 000',
  item_name: 'BORU 114,3x15',
  item_unit: 'metre',
  category_code: '0010',
  kind: 'boy',
  width_mm: null,
  length_mm: '6000.0',
  quantity: 3,
  available_quantity: 3,
  unit_kg: '220.380',
  total_kg: '661.140',
};

const JOBS = [
  {
    job_no: '',
    job_title: '',
    cards: 1053,
    negative_cards: 0,
    lots: 0,
    pieces: 0,
    kg: '0',
    kg_unknown: false,
  },
  {
    job_no: '254-01',
    job_title: 'Pres Hattı',
    cards: 3,
    negative_cards: 1,
    lots: 1,
    pieces: 2,
    kg: '440.760',
    kg_unknown: false,
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

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (u.pathname === '/warehouse/stock-balances/') {
      const job = u.searchParams.get('job_no');
      return json({
        count: 1,
        results: [job ? { ...BOLT, warehouse_code: 'IS_EMRI', job_no: job } : BOLT],
      });
    }
    if (u.pathname === '/warehouse/pieces/') return json({ count: 2, results: [SHEETS, BARS] });
    if (u.pathname === '/warehouse/inventories/jobs/') return json(JOBS);
    if (u.pathname === '/projects/job-orders/dropdown/') {
      return json([
        { job_no: '254-01', title: 'Pres Hattı' },
        { job_no: '300-02', title: 'Vinç' },
      ]);
    }
    if (method === 'POST' && u.pathname === '/warehouse/inventories/move/') {
      if (body.lines.length && !body.allow_negative && Number(body.lines[0].quantity) > 20) {
        return json(
          {
            detail: 'Kaynakta yeterli stok yok.',
            shortages: [
              {
                item: 7,
                item_code: BOLT.item_code,
                item_name: BOLT.item_name,
                available: '20.000',
                quantity: body.lines[0].quantity,
              },
            ],
          },
          409,
        );
      }
      return json(
        { slip: body.lines.length ? { number: 'DTR-2026-0010' } : null, pieces: [] },
        201,
      );
    }
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => vi.restoreAllMocks());

function moves() {
  return calls().filter(
    (c) => c.method === 'POST' && c.url.pathname === '/warehouse/inventories/move/',
  );
}

it('Hammadde: ticks a card and a bar lot, sets both aside for a job; plates stay', async () => {
  renderWithProviders(
    <ModalsProvider>
      <HammaddePage />
    </ModalsProvider>,
    { route: '/warehouse/hammadde' },
  );
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();
  expect(await screen.findByText('10 mm SAC')).toBeInTheDocument();
  const balances = calls().find((c) => c.url.pathname === '/warehouse/stock-balances/')!;
  expect(balances.url.searchParams.get('warehouse__code')).toBe('HAMMADDE');
  const lots = calls().find((c) => c.url.pathname === '/warehouse/pieces/')!;
  expect(lots.url.searchParams.get('warehouse')).toBe('HAMMADDE');

  expect(screen.getByRole('button', { name: 'İşe Ayır' })).toBeDisabled();
  // Rows: the card, the plate lot, the bar lot. A plate never goes on a job.
  const boxes = screen.getAllByLabelText('Satırı seç');
  expect(boxes[1]).toBeDisabled();
  expect(screen.getByText(/Sac İş Emri deposuna alınmaz/)).toBeInTheDocument();
  fireEvent.click(boxes[0]!);
  fireEvent.click(boxes[2]!);
  expect(screen.getByText('2 satır seçili')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'İşe Ayır' }));

  const dialog = await screen.findByRole('dialog', { name: 'İşe Ayır' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(notify.warning).toHaveBeenCalledWith('Hangi işe taşınacağını seçin');

  fireEvent.click(within(dialog).getByLabelText('Hangi işe (İş No)'));
  fireEvent.click(await screen.findByRole('option', { name: '254-01 - Pres Hattı', hidden: true }));
  fireEvent.change(within(dialog).getByLabelText(`${BOLT.item_code} miktar`), {
    target: { value: '25' },
  });
  fireEvent.change(within(dialog).getByLabelText('Lot 32 adet'), { target: { value: '1' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  expect(await screen.findByText('Kaynakta yeterli stok yok')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Yine de Kaydet' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      '1 kart ve 1 lot taşındı: Hammadde → İş Emri · 254-01 (DTR-2026-0010)',
    ),
  );
  expect(moves()).toHaveLength(2);
  expect(moves()[0]!.body).toEqual({
    from_warehouse_code: 'HAMMADDE',
    from_job_no: '',
    to_warehouse_code: 'IS_EMRI',
    to_job_no: '254-01',
    note: '',
    lines: [{ item: 7, quantity: '25' }],
    pieces: [{ piece: 32, quantity: 1 }],
  });
  expect(moves()[1]!.body).toMatchObject({ allow_negative: true });
});

it('İş Emri: lists jobs with Atanmamış first and opens one', async () => {
  renderWithProviders(<IsEmriPage />, { route: '/warehouse/is-emri' });
  expect(await screen.findByText('Atanmamış')).toBeInTheDocument();
  expect(screen.getByText('Pres Hattı')).toBeInTheDocument();
  expect(screen.getByText('1 eksi')).toBeInTheDocument();
  expect(screen.getByText('1 lot · 2 adet')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Pres Hattı'));
  expect(await screen.findByText('İş Emri · 254-01')).toBeInTheDocument();
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();
  const balances = calls()
    .filter((c) => c.url.pathname === '/warehouse/stock-balances/')
    .at(-1)!;
  expect(balances.url.searchParams.get('warehouse__code')).toBe('IS_EMRI');
  expect(balances.url.searchParams.get('job_no')).toBe('254-01');
  expect(screen.getByRole('button', { name: 'Başka İşe Aktar' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Hammaddeye İade' })).toBeInTheDocument();
});

it('İş Emri · Atanmamış: assigns the unassigned stock to a job, or returns it to Hammadde', async () => {
  renderWithProviders(
    <ModalsProvider>
      <IsEmriPage />
    </ModalsProvider>,
    { route: '/warehouse/is-emri?job=__unassigned__' },
  );
  expect(await screen.findByText('İş Emri · Atanmamış')).toBeInTheDocument();
  expect(await screen.findByText('CİVATA M12x40')).toBeInTheDocument();
  const balances = calls().find((c) => c.url.pathname === '/warehouse/stock-balances/')!;
  expect(balances.url.searchParams.get('unassigned')).toBe('true');
  expect(balances.url.searchParams.get('job_no')).toBeNull();
  expect(screen.getByRole('button', { name: 'İşe Ata' })).toBeInTheDocument();

  fireEvent.click(screen.getAllByLabelText('Satırı seç')[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Hammaddeye İade' }));
  const dialog = await screen.findByRole('dialog', { name: 'Hammaddeye İade' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(moves()).toHaveLength(1));
  expect(moves()[0]!.body).toMatchObject({
    from_warehouse_code: 'IS_EMRI',
    from_job_no: '',
    to_warehouse_code: 'HAMMADDE',
    to_job_no: '',
    lines: [{ item: 7, quantity: '20' }],
    pieces: [],
  });
});

it('İş Emri job: a plate already on the job only goes back to Hammadde, never to another job', async () => {
  renderWithProviders(
    <ModalsProvider>
      <IsEmriPage />
    </ModalsProvider>,
    { route: '/warehouse/is-emri?job=254-01' },
  );
  expect(await screen.findByText('10 mm SAC')).toBeInTheDocument();
  const boxes = screen.getAllByLabelText('Satırı seç');
  // Card, plate lot, bar lot: here the plate can be ticked (for Hammaddeye İade).
  expect(boxes[1]).not.toBeDisabled();
  fireEvent.click(boxes[1]!);
  fireEvent.click(boxes[2]!);
  fireEvent.click(screen.getByRole('button', { name: 'Başka İşe Aktar' }));

  const dialog = await screen.findByRole('dialog', { name: 'Başka İşe Aktar' });
  expect(within(dialog).getByText(/1 sac lotu listeye alınmadı/)).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Lot 31 adet')).toBeNull();
  fireEvent.click(within(dialog).getByLabelText('Hangi işe (İş No)'));
  fireEvent.click(await screen.findByRole('option', { name: '300-02 - Vinç', hidden: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(moves()).toHaveLength(1));
  expect(moves()[0]!.body).toMatchObject({
    from_warehouse_code: 'IS_EMRI',
    from_job_no: '254-01',
    to_warehouse_code: 'IS_EMRI',
    to_job_no: '300-02',
    lines: [],
    pieces: [{ piece: 32, quantity: 3 }],
  });
});
