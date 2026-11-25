import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { MaterialTrackingPage } from './MaterialTrackingPage';
import { arrivalState, jobStockRows, lotGroups, lotsText, spreadPick } from './jobStock';
import { pickedText } from './CreatePullRequestModal';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn(), hasPerm: () => false }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const auth = { user: { id: 7, username: 'atolye' }, isAdmin: false };
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const fetchMock = vi.mocked(authedFetch);
const JOB = '270-06-11/P1';

const CARDS = [
  {
    item: 11,
    item_code: '0018 0016 0060',
    item_name: 'CIVATA M16x60',
    item_unit: 'adet',
    material_class: 'normal',
    on_hand: '240.000',
    held: '40.000',
    available: '200.000',
  },
  {
    item: 12,
    item_code: '0018 0020 0080',
    item_name: 'CIVATA M20x80',
    item_unit: 'adet',
    material_class: 'normal',
    on_hand: '10.000',
    held: '10.000',
    available: '0.000',
  },
];

const lot = (extra: Record<string, unknown>) => ({
  item_unit: 'metre',
  width_mm: null,
  heat_number: '',
  warehouse_code: 'IS_EMRI',
  job_no: JOB,
  ...extra,
});
const LOTS = [
  lot({
    id: 301,
    item: 21,
    item_code: '0010 0120',
    item_name: 'NPU 120',
    kind: 'boy',
    length_mm: '6400.0',
    quantity: 2,
    available_quantity: 2,
  }),
  lot({
    id: 300,
    item: 21,
    item_code: '0010 0120',
    item_name: 'NPU 120',
    kind: 'boy',
    length_mm: '12000.0',
    quantity: 5,
    available_quantity: 4,
  }),
  lot({
    id: 400,
    item: 31,
    item_code: '0100 0010',
    item_name: 'SAC 10 MM',
    item_unit: 'kg',
    kind: 'plate',
    width_mm: '1500.0',
    length_mm: '6000.0',
    quantity: 2,
    available_quantity: 2,
  }),
];

const PULLS = [
  {
    id: 55,
    number: 'MPR-2026-0055',
    status: 'pending',
    status_label: 'Beklemede',
    destination_type: 'team',
    destination_name: 'Kaynak 2',
    item_count: 3,
    requested_by: 7,
    requested_by_name: 'Atöl Ye',
    requested_at: '2026-11-20T08:00:00Z',
  },
];

const PLANNING = [
  {
    id: 1,
    item_code: 'HEA 200',
    item_name: 'HEA 200 profil',
    job_no: JOB,
    quantity: '3',
    item_unit: 'boy',
    is_delivered: false,
    delivered_quantity: '0',
    is_critical: false,
    procurement: {
      pr_number: 'PR-1',
      pr_status: 'approved',
      pr_status_label: 'Onaylandı',
      pr_count: 1,
      po_id: 8,
      po_supplier_name: 'Demir AŞ',
      po_ordered_at: '2026-11-10',
      po_delivery_days: 18,
      po_expected_delivery: '2099-11-28',
      po_unit_price: null,
      po_currency: null,
      po_count: 1,
      ordered_quantity: '3',
    },
  },
  // Another job that only contains the text: left out.
  { id: 2, item_code: 'X', item_name: 'Başka', job_no: `${JOB}-B`, is_delivered: false },
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
const page = (results: unknown[]) => ({
  count: results.length,
  next: null,
  previous: null,
  results,
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = `/manufacturing/material-tracking?job=${encodeURIComponent(JOB)}`) {
  return renderWithProviders(
    <ModalsProvider>
      <MaterialTrackingPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  auth.isAdmin = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/warehouse/pull-requests/job-stock/') return json(CARDS);
    if (method === 'GET' && path === '/warehouse/pieces/') return json(page(LOTS));
    if (method === 'GET' && path === '/warehouse/pull-requests/') return json(page(PULLS));
    if (method === 'GET' && path === '/planning/items/') return json(page(PLANNING));
    if (method === 'GET' && path === '/subcontracting/subcontractors/')
      return json([{ id: 5, name: 'Usta Kaynak', is_active: true }]);
    if (method === 'GET' && path === '/teams/') return json([{ id: 9, name: 'Kaynak 2' }]);
    if (method === 'GET' && path === '/warehouse/pull-requests/56/')
      return json({ ...PULLS[0], id: 56, number: 'MPR-2026-0056', items: [] });
    if (method === 'POST' && path === '/warehouse/pull-requests/')
      return json({ id: 56, number: 'MPR-2026-0056' }, 201);
    if (method === 'POST' && path.endsWith('/mark_critical/'))
      return json({ id: 1, is_critical: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("shows the job's İş Emri stock, its requests and the lines that have not arrived", async () => {
  renderPage();
  expect(screen.getByText(`Malzeme Takibi · ${JOB}`)).toBeInTheDocument();
  expect(await screen.findByText('CIVATA M16x60')).toBeInTheDocument();
  // Cards: on hand, held by pending requests, still requestable.
  expect(screen.getByText('240 adet')).toBeInTheDocument();
  expect(screen.getByText('200 adet')).toBeInTheDocument();
  // Bars by length (free bars), plates go to CNC.
  expect(screen.getByText('12 m × 4 · 6,4 m × 2')).toBeInTheDocument();
  expect(screen.getByText('6 boy')).toBeInTheDocument();
  expect(screen.getByText('CNC kesime gider')).toBeInTheDocument();

  expect(await screen.findByText('MPR-2026-0055')).toBeInTheDocument();
  expect(await screen.findByText(/Sipariş verildi · Demir AŞ/)).toBeInTheDocument();
  expect(screen.queryByText('Başka')).toBeNull();

  const get = (path: string) => calls().find((c) => c.url.pathname === path)!.url.searchParams;
  expect(get('/warehouse/pull-requests/job-stock/').get('job_no')).toBe(JOB);
  expect(Object.fromEntries(get('/warehouse/pieces/'))).toMatchObject({
    warehouse: 'IS_EMRI',
    job_no: JOB,
  });
  expect(get('/warehouse/pull-requests/').get('job')).toBe(JOB);
  expect(Object.fromEntries(get('/planning/items/'))).toMatchObject({
    job_no: JOB,
    is_delivered: 'false',
    include_procurement: 'true',
  });
});

it('only what can still go out is selectable; a card and bars make one request to a team', async () => {
  renderPage();
  await screen.findByText('CIVATA M16x60');
  const checks = screen.getAllByRole('checkbox', { name: 'Satırı seç' });
  // Rows by code: the bar, M16 bolts, M20 bolts (all held), the plate.
  expect(checks[2]).toBeDisabled();
  expect(checks[3]).toBeDisabled();
  fireEvent.click(checks[0]!);
  fireEvent.click(checks[1]!);
  expect(await screen.findByText('2 kalem seçildi')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'İmalata Çıkış Talebi Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: `İmalata Çıkış Talebi · ${JOB}` });
  const qty = within(dialog).getByLabelText('Miktar: 0018 0016 0060');
  expect(qty).toHaveValue('200');

  // No bars picked yet: refused before the request.
  fireEvent.click(await within(dialog).findByPlaceholderText('Ekip seçin...'));
  fireEvent.click(await screen.findByRole('option', { name: 'Kaynak 2', hidden: true }));
  fireEvent.change(qty, { target: { value: '201' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  expect(
    await within(dialog).findByText('En fazla 200 adet imalata çıkabilir'),
  ).toBeInTheDocument();

  fireEvent.change(qty, { target: { value: '120' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  await waitFor(() =>
    expect(notify.warning).toHaveBeenCalledWith('0010 0120: iş emri stoğundan en az bir boy seçin'),
  );
  fireEvent.change(within(dialog).getByLabelText('0010 0120 12 m boy adedi'), {
    target: { value: '3' },
  });
  expect(within(dialog).getByText('3 boy · 36 m')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('İmalata çıkış talebi oluşturuldu: MPR-2026-0056'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.body).toEqual({
    note: '',
    team: 9,
    items: [
      { item: 21, job_no: JOB, pieces: [{ piece: 300, quantity: 3 }] },
      { item: 11, job_no: JOB, quantity: 120 },
    ],
  });
  // The new request opens.
  expect(
    await screen.findByRole('dialog', { name: 'İmalata Çıkış Talebi — MPR-2026-0056' }),
  ).toBeInTheDocument();
});

it('the Kritik box on a waiting line posts mark_critical', async () => {
  renderPage();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Kritik: HEA 200' }));
  await waitFor(() =>
    expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
      '/planning/items/1/mark_critical/',
    ),
  );
});

it('with no job it asks for one and lists every request; İş Değiştir goes back there', async () => {
  renderPage('/manufacturing/material-tracking?status=pending');
  expect(screen.getByText('İş Seçin')).toBeInTheDocument();
  expect(await screen.findByText('MPR-2026-0055')).toBeInTheDocument();
  const list = calls().find((c) => c.url.pathname === '/warehouse/pull-requests/')!;
  expect(list.url.searchParams.get('status')).toBe('pending');
  expect(calls().some((c) => c.url.pathname === '/warehouse/pull-requests/job-stock/')).toBe(false);

  fireEvent.change(screen.getByRole('textbox', { name: 'İş No' }), { target: { value: JOB } });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'İş No' }), { key: 'Enter' });
  await waitFor(() =>
    expect(screen.getByTestId('location').textContent).toContain(`job=${encodeURIComponent(JOB)}`),
  );
  expect(await screen.findByText('CIVATA M16x60')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'İş Değiştir' }));
  expect(await screen.findByText('İş Seçin')).toBeInTheDocument();
});

describe('job stock rows', () => {
  it('group lots by card, count bars and leave plate out of requests', () => {
    const rows = jobStockRows(CARDS, LOTS as never);
    expect(rows.map((r) => [r.kind, r.item_code, r.onHand, r.held, r.available])).toEqual([
      ['bar', '0010 0120', 7, 1, 6],
      ['card', '0018 0016 0060', 240, 40, 200],
      ['card', '0018 0020 0080', 10, 10, 0],
      ['plate', '0100 0010', 2, 0, 2],
    ]);
    // Longest bars first.
    expect(rows[0]!.lots.map((l) => l.id)).toEqual([300, 301]);
  });

  it('show lots of the same length as one, and spread a count over them', () => {
    const same = (id: number, free: number, heat = '') =>
      lot({
        id,
        item: 21,
        item_code: '0010 0120',
        item_name: 'NPU 120',
        kind: 'boy',
        length_mm: '6000.0',
        quantity: free,
        available_quantity: free,
        heat_number: heat,
      });
    const rows = jobStockRows([], [same(10, 72), same(11, 6), same(12, 2, 'D-1')] as never);
    expect(lotsText(rows[0]!)).toBe('6 m × 78 · 6 m × 2');
    const [group] = lotGroups(rows[0]!.lots);
    expect(group!.free).toBe(78);
    expect(spreadPick(group!, 75)).toEqual({ 10: 72, 11: 3 });
    expect(spreadPick(group!, 5)).toEqual({ 10: 5, 11: 0 });
  });

  it('say how many bars and metres are picked', () => {
    const lots = [
      { id: 1, length_mm: '6000.0' },
      { id: 2, length_mm: '4000.0' },
    ];
    expect(pickedText({ 1: 2, 2: '1' }, lots)).toBe('3 boy · 16 m');
    expect(pickedText({}, lots)).toBe('Boy seçilmedi');
  });
});

describe('arrival state of a waiting planning line', () => {
  const base = { id: 1, quantity: '8', item_unit: 'adet', is_delivered: false };
  it('ordered, late, at purchasing, partial or not ordered', () => {
    const po = (due: string) =>
      ({ po_id: 1, po_supplier_name: 'Demir AŞ', po_expected_delivery: due }) as never;
    expect(arrivalState({ ...base, procurement: po('2026-11-28') }, '2026-11-23')).toEqual({
      text: 'Sipariş verildi · Demir AŞ · 28.11.2026 bekleniyor',
      tone: 'blue',
    });
    expect(arrivalState({ ...base, procurement: po('2026-11-20') }, '2026-11-23').tone).toBe('red');
    expect(
      arrivalState({
        ...base,
        procurement: { pr_number: 'PR-7', pr_status_label: 'Onayda' } as never,
      }).text,
    ).toBe('Satın almada · PR-7 (Onayda)');
    expect(arrivalState({ ...base, delivered_quantity: '4' })).toEqual({
      text: 'Kısmi 4 / 8 adet · Sipariş verilmedi',
      tone: 'orange',
    });
    expect(arrivalState(base).text).toBe('Sipariş verilmedi');
  });
});
