import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as XLSX from 'xlsx';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import {
  applyExcelToLine,
  buildExcelCompare,
  clampDecimals,
  emptyLine,
  linesForSubmit,
  parseExcelComparisonRows,
} from './lines';
import { ProcurementLinesPage } from './ProcurementLinesPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PENDING = [
  {
    job_no: '254-01',
    title: 'Kazan',
    customer_name: 'Arçelik',
    status: 'active',
    target_completion_date: '2026-12-01',
  },
];
const HAS = [
  { job_no: '250-07', title: 'Tank', status: 'completed', cost_not_applicable: false },
  { job_no: '250-08', title: 'Silo', status: 'active', cost_not_applicable: true },
];
const SAVED = [
  {
    id: 11,
    item: 501,
    item_code: 'STK-001',
    item_name: 'Sac Levha',
    item_unit: 'kg',
    item_description: '',
    quantity: '10.00',
    unit_price: '2.500000',
    amount_eur: '25.00',
    planning_request_item: 900,
    order: 0,
    price_source: 'po_line',
    price_date: '2026-09-15',
  },
  {
    id: 12,
    item: 502,
    item_code: 'STK-002',
    item_name: 'Cıvata M12',
    item_unit: 'adet',
    item_description: 'Galvaniz',
    quantity: '100.00',
    unit_price: '0.300000',
    amount_eur: '30.00',
    planning_request_item: null,
    order: 1,
    price_source: 'none',
    price_date: null,
  },
];
const PREVIEW = [
  {
    item: 777,
    item_code: 'STK-777',
    item_name: 'Boru',
    item_unit: 'm',
    quantity: '4',
    unit_price_eur: '12.5',
    planning_request_item: 55,
    order: 0,
    price_source: 'recommended_offer',
    price_date: '2026-08-01',
  },
];

let savedLines: unknown[] = SAVED;

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const callsTo = (path: string) => calls().filter((c) => c.url.pathname === path);
const paramsOf = (call: Call | undefined) => Object.fromEntries(call!.url.searchParams);

beforeEach(() => {
  savedLines = SAVED;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/projects/job-orders/procurement_pending/')
      return json({ count: 1, next: null, previous: null, results: PENDING });
    if (path === '/projects/job-orders/has_procurement/')
      return json({ count: 2, next: null, previous: null, results: HAS });
    if (path === '/projects/procurement-lines/') return json(savedLines);
    if (path === '/projects/procurement-lines/preview/') return json(PREVIEW);
    if (path === '/projects/procurement-lines/submit/' && init?.method === 'POST') return json([]);
    if (path.endsWith('/cost_summary/') && init?.method === 'PATCH') return json({});
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
  vi.spyOn(notify, 'info');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage(options: { route: string }) {
  return renderWithProviders(
    <ModalsProvider>
      <ProcurementLinesPage />
    </ModalsProvider>,
    options,
  );
}

function lineRows(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>('tbody tr[data-row-id]'));
}
const HEADERS: Record<string, string> = {
  quantity: 'Miktar',
  unit_price: 'Birim Fiyat (EUR)',
  amount: 'Tutar (EUR)',
  item_description: 'Açıklama',
  excel_unit: 'Excel Birim Fiyat',
  excel_amount: 'Excel Tutar (EUR)',
};
/** A cell by row index and column (read-only cells carry no data-col, so by header position). */
function lineCell(dialog: HTMLElement, index: number, col: string): HTMLElement {
  const headers = Array.from(dialog.querySelectorAll('thead th')).map((th) =>
    (th.textContent ?? '').trim(),
  );
  const ci = headers.indexOf(HEADERS[col] ?? col);
  const td = lineRows(dialog)[index]?.querySelectorAll<HTMLElement>(':scope > td')[ci];
  if (ci === -1 || !td) throw new Error(`no cell ${index}/${col}`);
  return td;
}
/** Click-to-edit a DataTable cell, type and press Enter. */
function editCell(dialog: HTMLElement, index: number, col: string, label: string, value: string) {
  fireEvent.click(lineCell(dialog, index, col));
  const input = within(dialog).getByRole('textbox', { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

async function openSavedLines() {
  renderPage({ route: '/planning/procurement-lines' });
  await screen.findByText('254-01');
  fireEvent.click(screen.getAllByRole('button', { name: 'Satırları Aç' })[0]!);
  const dialog = await screen.findByRole('dialog', {
    name: /Malzeme Maliyeti Satırları — 254-01/,
  });
  await within(dialog).findByText('STK-001');
  return dialog;
}

it('loads the pending list at once and the has-entries list only on demand, as legacy', async () => {
  renderPage({
    route: '/planning/procurement-lines?status=active&search=kazan',
  });
  expect(await screen.findByText('254-01')).toBeInTheDocument();
  expect(paramsOf(callsTo('/projects/job-orders/procurement_pending/')[0])).toEqual({
    status: 'active',
    search: 'kazan',
    ordering: 'job_no',
    page: '1',
    page_size: '20',
  });
  expect(callsTo('/projects/job-orders/has_procurement/')).toHaveLength(0);
  expect(
    screen.getByText('Listeyi yüklemek için Filtrele veya Yenile butonuna tıklayın.'),
  ).toBeInTheDocument();

  fireEvent.click(screen.getAllByRole('button', { name: 'Yenile' })[0]!);
  expect(await screen.findByText('250-07')).toBeInTheDocument();
  expect(screen.getByText('Uygulanamaz')).toBeInTheDocument();
  expect(screen.getByText('Girilmiş')).toBeInTheDocument();
});

it('sends the Maliyet Durumu filter of the has-entries table', async () => {
  renderPage({
    route: '/planning/procurement-lines?has_cost_not_applicable=true&has_status=active',
  });
  expect(await screen.findByText('250-08')).toBeInTheDocument();
  expect(paramsOf(callsTo('/projects/job-orders/has_procurement/')[0])).toEqual({
    status: 'active',
    cost_not_applicable: 'true',
    ordering: 'job_no',
    page: '1',
    page_size: '20',
  });
});

it('edits lines inline, reverts, adds a row and submits the replace-all payload', async () => {
  const dialog = await openSavedLines();
  expect(callsTo('/projects/procurement-lines/')[0]!.url.searchParams.get('job_order')).toBe(
    '254-01',
  );
  // Saved lines exist, so no preview.
  expect(callsTo('/projects/procurement-lines/preview/')).toHaveLength(0);
  expect(within(dialog).getByTestId('lines-summary')).toHaveTextContent(
    'Toplam: 2 satır, Toplam tutar: 55.00 EUR',
  );
  expect(within(dialog).getByText('PO satırı (bu planlama kalemi)')).toBeInTheDocument();

  // Quantity 10 -> 12,5 (Turkish decimal): amount and total follow, the cell is marked changed.
  editCell(dialog, 0, 'quantity', 'Miktar', '12,5');
  expect(lineCell(dialog, 0, 'amount')).toHaveTextContent('31.25');
  expect(lineCell(dialog, 0, 'quantity')).toHaveAttribute('data-cell-state', 'dirty');
  expect(within(dialog).getByTestId('lines-summary')).toHaveTextContent('Toplam tutar: 61.25 EUR');

  // Revert one line, then change again and use the revert-all button.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satırı ilk haline döndür' }));
  expect(lineCell(dialog, 0, 'amount')).toHaveTextContent('25.00');
  expect(within(dialog).queryByRole('button', { name: 'Değişiklikleri Geri Al' })).toBeNull();
  editCell(dialog, 1, 'unit_price', 'Birim Fiyat (EUR)', '0,35');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Geri Al' }));
  expect(notify.success).toHaveBeenCalledWith('1 satır ilk haline döndürüldü.');
  expect(lineCell(dialog, 1, 'amount')).toHaveTextContent('30.00');

  editCell(dialog, 1, 'unit_price', 'Birim Fiyat (EUR)', '0,1234567');
  // A free-text row, and an empty one that is skipped on save.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  editCell(dialog, 2, 'item_description', 'Açıklama', ' Boya ');
  editCell(dialog, 2, 'quantity', 'Miktar', '3');
  editCell(dialog, 2, 'unit_price', 'Birim Fiyat (EUR)', '4');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Satır Ekle' }));
  expect(lineRows(dialog)).toHaveLength(4);

  savedLines = [SAVED[0]];
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Satırlar kaydedildi.'));
  const post = callsTo('/projects/procurement-lines/submit/')[0]!;
  expect(post.method).toBe('POST');
  expect(post.body).toEqual({
    job_order: '254-01',
    lines: [
      {
        item: 501,
        quantity: '10.00',
        unit_price: '2.500000',
        planning_request_item: 900,
        order: 0,
      },
      {
        item: 502,
        item_description: 'Galvaniz',
        quantity: '100.00',
        // unit_price is cut to the backend's 6 decimals
        unit_price: '0.123457',
        order: 1,
      },
      { item_description: 'Boya', quantity: '3', unit_price: '4', order: 2 },
    ],
  });
  // The modal stays open with the persisted lines re-read (not the preview).
  await waitFor(() => expect(lineRows(dialog)).toHaveLength(1));
  expect(callsTo('/projects/procurement-lines/')).toHaveLength(2);
  expect(callsTo('/projects/procurement-lines/preview/')).toHaveLength(0);
  // Both lists reload after a save.
  await waitFor(() =>
    expect(callsTo('/projects/job-orders/has_procurement/').length).toBeGreaterThan(0),
  );
  expect(callsTo('/projects/job-orders/procurement_pending/').length).toBeGreaterThan(1);
});

it('removes a row and opens the preview from Önizle or when nothing is saved', async () => {
  savedLines = [];
  const dialog = await (async () => {
    renderPage({ route: '/planning/procurement-lines' });
    await screen.findByText('254-01');
    fireEvent.click(screen.getAllByRole('button', { name: 'Satırları Aç' })[0]!);
    return screen.findByRole('dialog', { name: /254-01/ });
  })();
  expect(await within(dialog).findByText('STK-777')).toBeInTheDocument();
  expect(within(dialog).getByText('Önerilen tedarikçi teklifi')).toBeInTheDocument();
  // unit_price_eur fills the unit price: 4 × 12,5.
  expect(lineCell(dialog, 0, 'amount')).toHaveTextContent('50.00');
  expect(callsTo('/projects/procurement-lines/preview/')).toHaveLength(1);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Satırı sil' }));
  expect(lineRows(dialog)).toHaveLength(0);
  fireEvent.click(within(dialog).getByText('Kapat'));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  // Önizle on a has-entries row goes straight to the preview.
  fireEvent.click(screen.getAllByRole('button', { name: 'Yenile' })[0]!);
  await screen.findByText('250-07');
  fireEvent.click(screen.getAllByRole('button', { name: 'Önizle' })[0]!);
  const preview = await screen.findByRole('dialog', { name: /250-07/ });
  await within(preview).findByText('STK-777');
  expect(callsTo('/projects/procurement-lines/')).toHaveLength(1);
  expect(callsTo('/projects/procurement-lines/preview/')).toHaveLength(2);
});

function excelFile(rows: unknown[][], name = 'siparis.xlsx'): File {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Sayfa1');
  const data = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([data], name);
}

const EXCEL_ROWS = [
  ['SİPARİŞ RAPORU'],
  ['STOK KODU', 'STOK İSMİ', 'TALEP MİKTARI', 'SİPARİŞ MİKTARI', 'Sip. Tutar EUR'],
  // Same total (10 × 2,5): matches.
  ['STK 001', 'Sac Levha', 10, 10, 25],
  // 100 × 0,35 = 35 vs our 30: unit price differs.
  ['STK-002', 'Cıvata M12', 100, 0, '35,00'],
  ['STK-999', 'Somun', 5, 5, 10],
  ['', '', '', 'TOPLAM', 70],
];

it('compares the lines with an Excel file and applies its prices', async () => {
  const dialog = await openSavedLines();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Excel ile Karşılaştır' }));
  expect(notify.warning).toHaveBeenCalledWith('Lütfen önce bir Excel dosyası seçin.');

  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [excelFile(EXCEL_ROWS)] } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Excel ile Karşılaştır' }));

  const info = await within(dialog).findByTestId('compare-info');
  expect(info).toHaveTextContent('siparis.xlsx');
  expect(info).toHaveTextContent('2 satır eşleşti');
  expect(info).toHaveTextContent('1 satırda tutar farkı');
  expect(info).toHaveTextContent("Excel'de olup tabloda eşleşmeyen 1 satır: STK-999");
  expect(lineCell(dialog, 0, 'excel_amount')).toHaveTextContent('25.00');
  expect(lineCell(dialog, 1, 'excel_unit')).toHaveTextContent('0.3500');
  expect(lineCell(dialog, 0, 'excel_amount')).not.toHaveTextContent('Uygula');

  fireEvent.click(
    within(lineCell(dialog, 1, 'excel_amount')).getByRole('button', { name: 'Uygula' }),
  );
  expect(lineCell(dialog, 1, 'amount')).toHaveTextContent('35.00');
  expect(info).not.toHaveTextContent('tutar farkı');
  expect(within(dialog).queryByRole('button', { name: 'Tümünü Uygula' })).toBeNull();

  // Back to the old price, then Tümünü Uygula.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Geri Al' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tümünü Uygula' }));
  expect(notify.success).toHaveBeenCalledWith('1 satıra Excel değerleri uygulandı.');
  expect(lineCell(dialog, 1, 'unit_price')).toHaveTextContent('0,35');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Karşılaştırmayı Kaldır' }));
  expect(within(dialog).queryByTestId('compare-info')).toBeNull();
  expect(dialog.querySelector('td[data-col="excel_amount"]')).toBeNull();
});

it('reports an Excel file without the expected columns', async () => {
  const dialog = await openSavedLines();
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [
        excelFile([
          ['KOD', 'AD'],
          ['A', 'B'],
        ]),
      ],
    },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Excel ile Karşılaştır' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Excel dosyasında "STOK KODU" başlıklı sütun bulunamadı.',
      }),
      expect.anything(),
    ),
  );
});

it('marks and unmarks a job order as cost not applicable after a confirm', async () => {
  renderPage({ route: '/planning/procurement-lines' });
  await screen.findByText('254-01');
  fireEvent.click(screen.getAllByRole('button', { name: 'Maliyet Uygulanamaz' })[0]!);
  expect(
    await screen.findByText('254-01 için maliyet uygulanamaz olarak işaretlensin mi?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, işaretle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('İş emri maliyet uygulanamaz olarak işaretlendi.'),
  );
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/projects/job-orders/254-01/cost_summary/');
  expect(patch.body).toEqual({ cost_not_applicable: true });
  // Both lists reload, the has-entries one included.
  expect(await screen.findByText('250-08')).toBeInTheDocument();

  // 250-08 is flagged: it offers Maliyeti Uygula instead.
  fireEvent.click(screen.getByRole('button', { name: 'Maliyeti Uygula' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, kaldır' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('İş emri yeniden maliyet takibine alındı.'),
  );
  expect(calls().filter((c) => c.method === 'PATCH')[1]!.body).toEqual({
    cost_not_applicable: false,
  });
});

describe('line model', () => {
  it('clamps decimals like the legacy save', () => {
    expect(clampDecimals('1.23456', 2)).toBe('1.23');
    expect(clampDecimals('1.2', 2)).toBe('1.2');
    expect(clampDecimals('abc', 2)).toBe('abc');
  });

  it('skips lines with neither item nor description', () => {
    expect(linesForSubmit([emptyLine(0)])).toEqual([]);
  });

  it('parses the Excel grid and derives a unit price when only the total can match', () => {
    const rows = parseExcelComparisonRows({ SheetNames: ['S'], Sheets: { S: {} } }, () => [
      ['STOK KODU', 'STOK ISMI', 'SIPARIS MIKTARI', 'SIP TUTAR EUR'],
      ['a 1', 'X', '3', '1.000,00'],
      ['A1', 'X', 0, 0],
    ]);
    const compare = buildExcelCompare(rows, 'f.xlsx');
    expect(compare.rows).toEqual([
      { code: 'A1', rawCode: 'a 1', name: 'X', qty: 3, amountEur: 1000, unitPrice: 1000 / 3 },
    ]);
    const line = { ...emptyLine(), item_code: 'A1', quantity: '3', unit_price: '1' };
    const applied = applyExcelToLine(line, compare.rows[0]!)!;
    expect(applied.quantity).toBe('3');
    expect(applied.unit_price).toBe('333.333333');
    // Quantity 0 on both sides: nothing to derive from.
    const zero = buildExcelCompare(
      [{ code: 'B', rawCode: 'B', name: '', qty: 0, amountEur: 5 }],
      'f',
    );
    expect(applyExcelToLine({ ...emptyLine(), quantity: '0' }, zero.rows[0]!)).toBeNull();
  });
});
