import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { saveBlob } from '@/ui/files';
import { mikroCsv, partDeductions, turkishKg } from './mikroCsv';
import { WeightReductionPage } from './WeightReductionPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  isAdmin: () => false,
  isSuperuser: () => false,
  hasPerm: (code: string) => code === 'access_warehouse',
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/ui/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/ui/files')>()),
  saveBlob: vi.fn(),
}));

const fetchMock = vi.mocked(authedFetch);

const LOT = {
  id: 9,
  item: 12,
  item_code: '0100-10',
  item_name: '10 mm ST 37-2 SAC',
  width_mm: '1500.0',
  length_mm: '3000.0',
  heat_number: 'H-1',
  warehouse_code: 'HAMMADDE',
  job_no: '',
  unit_kg: '353.250',
};
const CUT = {
  key: 'CNC-7',
  name: 'Kazan sacı',
  nesting_id: 'NST-1',
  material: '10 mm ST 37-2 SAC',
  dimensions: '1500x3000',
  thickness_mm: '10.00',
  quantity: 2,
  parts_count: 2,
  completion_date: 1_763_280_000_000,
  has_piece: true,
  processed_by_warehouse: false,
  remnants_entered: true,
  fire_kg: '135.850',
};
const DETAIL = {
  ...CUT,
  consumed_kg: '706.500',
  consumed_estimated: false,
  parts_kg: '500.000',
  remnant_kg: '70.650',
  fire_kg: '135.850',
  remnants_entered: true,
  piece_issues: [{ piece: 9, quantity: 2, unit_kg: '353.250', piece_details: LOT }],
  remnant_pieces: [{ ...LOT, id: 15, width_mm: '600.0', length_mm: '1500.0', quantity: 1 }],
  parts: [
    { id: 1, job_no: '254-01', image_no: 'R1', position_no: 'P1', weight_kg: '100', quantity: 2 },
    { id: 2, job_no: '254-02', image_no: 'R2', position_no: 'P2', weight_kg: '50', quantity: 1 },
  ],
};
let detail: Record<string, unknown> = DETAIL;

/** What the backend previews for the body: consumed 706.5, parts 500, remnants as sent. */
function preview(body: { remnants?: { width_mm: string; length_mm: string; quantity: number }[] }) {
  const remnants = (body.remnants ?? []).map((r) => {
    const w = Math.min(Number(r.width_mm), Number(r.length_mm));
    const l = Math.max(Number(r.width_mm), Number(r.length_mm));
    const unit = (w * l * 10 * 7.85) / 1e6;
    return {
      item: 12,
      item_code: '0100-10',
      width_mm: String(w),
      length_mm: String(l),
      quantity: r.quantity,
      heat_number: 'H-1',
      kept: w >= 500,
      unit_kg: unit.toFixed(3),
      total_kg: (unit * r.quantity).toFixed(3),
    };
  });
  const remnantKg = remnants.filter((r) => r.kept).reduce((s, r) => s + Number(r.total_kg), 0);
  const fire = 706.5 - 500 - remnantKg;
  const share = (kg: number) => (fire * kg) / 500;
  return {
    key: 'CNC-7',
    sheets: 2,
    consumed: [{ piece: 9, item: 12, item_code: '0100-10', quantity: 2, unit_kg: '353.250', total_kg: '706.500' }],
    consumed_kg: '706.500',
    consumed_estimated: false,
    parts_kg: '500.000',
    parts_without_weight: 0,
    remnants,
    remnant_kg: remnantKg.toFixed(3),
    fire_kg: fire.toFixed(3),
    parts: [
      { id: 1, job_no: '254-01', image_no: 'R1', position_no: 'P1', weight_kg: '100', quantity: 2, parts_kg: '400.000', fire_kg: share(400).toFixed(3), deduct_kg: (400 + share(400)).toFixed(3) },
      { id: 2, job_no: '254-02', image_no: 'R2', position_no: 'P2', weight_kg: '50', quantity: 1, parts_kg: '100.000', fire_kg: share(100).toFixed(3), deduct_kg: (100 + share(100)).toFixed(3) },
    ],
  };
}

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
  detail = DETAIL;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url), 'https://api.test');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    if (method === 'GET' && u.pathname === '/cnc_cutting/tasks/') return json({ count: 1, results: [CUT] });
    if (method === 'GET' && u.pathname === '/cnc_cutting/tasks/CNC-7/') return json(detail);
    if (method === 'POST' && u.pathname === '/cnc_cutting/tasks/CNC-7/finish-preview/')
      return json(preview(body));
    if (method === 'POST' && u.pathname === '/cnc_cutting/tasks/warehouse-process/')
      return json({ status: 'ok' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const render = (route = '/warehouse/weight-reduction') =>
  renderWithProviders(
    <ModalsProvider>
      <WeightReductionPage />
    </ModalsProvider>,
    { route },
  );

it('lists the finished cuts the warehouse has not processed', async () => {
  render();
  expect(await screen.findByText('CNC-7')).toBeInTheDocument();
  expect(screen.getByText('Stok Sac')).toBeInTheDocument();
  expect(screen.getByText('Girildi')).toBeInTheDocument();
  const list = calls().find((c) => c.url.pathname === '/cnc_cutting/tasks/')!;
  expect(Object.fromEntries(list.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-completion_date',
    completion_date__isnull: 'false',
    processed_by_warehouse: 'false',
  });
});

it('shows a finished cut as booked, exports the Mikro file and records the deduction', async () => {
  render('/warehouse/weight-reduction?kesim=CNC-7');
  const dialog = await screen.findByRole('dialog', { name: /Ağırlık Düşüşü/ });
  expect(
    await within(dialog).findByText('Stoktan düşülen: 0100-10 · 1500 × 3000 mm × 2'),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('Stoğa dönen fire sac: 0100-10 · 600 × 1500 mm × 1')).toBeInTheDocument();
  expect(dialog).toHaveTextContent('135,85 kg');
  // Booked at finish: nothing is previewed.
  expect(calls().some((c) => c.url.pathname.endsWith('/finish-preview/'))).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Mikro CSV' }));
  expect(saveBlob).toHaveBeenCalledTimes(1);
  const [blob, name] = vi.mocked(saveBlob).mock.calls[0]!;
  expect(name).toMatch(/^parts_export_\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.csv$/);
  const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
  expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM, for Excel
  expect(new TextDecoder().decode(bytes.slice(3)).split('\r\n')).toEqual([
    ';C;"508,68";;254-01;2',
    ';C;"127,17";;254-02;2',
  ]);

  fireEvent.click(within(dialog).getByRole('button', { name: "Mikro'ya İşlendi" }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, İşaretle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith("CNC-7 Mikro'ya işlendi olarak işaretlendi"),
  );
  const marked = calls().find((c) => c.url.pathname === '/cnc_cutting/tasks/warehouse-process/')!;
  expect(marked.body).toEqual({ key: 'CNC-7' });
});

it('a cut finished before booking shows the estimate from its own size', async () => {
  detail = { ...DETAIL, consumed_kg: null, parts_kg: null, remnant_kg: null, fire_kg: null,
    remnants_entered: false, piece_issues: [], remnant_pieces: [] };
  render('/warehouse/weight-reduction?kesim=CNC-7');
  const dialog = await screen.findByRole('dialog', { name: /Ağırlık Düşüşü/ });
  expect(await within(dialog).findByText(/ağırlıklar kesimin ölçüsünden tahmindir/)).toBeInTheDocument();
  await waitFor(() =>
    expect(calls().find((c) => c.url.pathname.endsWith('/finish-preview/'))!.body).toEqual({
      consumed: [],
      remnants: [],
    }),
  );
  expect(within(dialog).getByText('Operatör fire sac girmedi.')).toBeInTheDocument();
});

describe('Mikro file', () => {
  it('writes Turkish kg with two decimals, quoted, one row per part', () => {
    expect(turkishKg(1234.5)).toBe('1.234,50');
    expect(mikroCsv([{ job_no: '254-01', deduct_kg: 1234.5 }])).toBe(';C;"1.234,50";;254-01;2');
  });

  it('spreads a processed cut’s fire over its parts by weight', () => {
    const rows = partDeductions(
      [
        { id: 1, job_no: 'A', weight_kg: '100', quantity: 2 },
        { id: 2, job_no: 'B', weight_kg: '50', quantity: 1 },
      ],
      2,
      135.85,
    );
    expect(rows.map((r) => [r.parts_kg, r.fire_kg, r.deduct_kg])).toEqual([
      ['400.000', '108.680', '508.680'],
      ['100.000', '27.170', '127.170'],
    ]);
    expect(partDeductions([{ id: 1, job_no: 'A', weight_kg: '10', quantity: 1 }], 1, null)[0]!.deduct_kg).toBe(
      '10.000',
    );
  });
});
