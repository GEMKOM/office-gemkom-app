import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { paymentListSheet } from './exportList';
import { PaymentListsPage } from './PaymentListsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const LISTS = [
  {
    id: 7,
    title: '27.10.2026 Ödeme Listesi',
    list_date: '2026-10-27',
    status: 'submitted',
    status_label: 'Onayda',
    budget_eur: '10000.00',
    created_by_name: 'Ayşe',
    current_stage_name: 'Genel Müdür',
    pending_approver_names: ['Mehmet'],
    totals: { total_eur: '12000.00', paid_eur: '0', included_count: 3, paid_count: 0, proforma_missing: 2, over_budget: true },
  },
  {
    id: 8,
    title: 'Eski Liste',
    list_date: '2026-10-01',
    status: 'completed',
    status_label: 'Tamamlandı',
    totals: { total_eur: '500', paid_eur: '500', included_count: 1, paid_count: 1, proforma_missing: 0 },
  },
];

const POOL_ROW = {
  schedule_id: 101,
  schedule_sequence: 1,
  schedule_count: 2,
  label: 'Avans',
  basis_label: 'Peşin',
  percentage: '30',
  currency: 'TRY',
  net_amount: '1000.00',
  gross_amount: '1200.00',
  amount_eur: '30.00',
  due_date: '2026-11-10',
  items_summary: 'Sac levha',
  line_count: 2,
  gs_numbers: ['GS-1'],
  jobs: [{ job_no: '2501', customer_short_name: 'Arçelik' }],
  supplier: { name: 'Demir A.Ş.', has_dbs: true },
  po: { id: 55, gross_total: '4000', currency: 'TRY', created_at: '2026-10-01', proforma_count: 0 },
  open_list: null,
};

const ITEMS = [
  { ...POOL_ROW, id: 1, sequence: 1, note: 'İlk ödeme', is_paid: false, is_excluded: false },
  { ...POOL_ROW, id: 2, schedule_id: 102, sequence: 2, note: '', is_paid: true, is_excluded: false, supplier: { name: 'Bakır Ltd.' } },
  {
    ...POOL_ROW,
    id: 3,
    schedule_id: 103,
    sequence: 3,
    note: '',
    is_paid: false,
    is_excluded: true,
    exclusion_reason: 'Ertelendi',
    supplier: { name: 'Çelik Ltd.' },
  },
];

function detail(allowed: string[], extra: Record<string, unknown> = {}) {
  return {
    ...LISTS[0],
    status: 'draft',
    status_label: 'Taslak',
    allowed_actions: allowed,
    fx: { source: 'table', eur_try: '40.5', usd_try: '35.1', date: '2026-10-27' },
    items: ITEMS,
    ...extra,
  };
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: unknown };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}
const callsTo = (method: string, path: string) => calls().filter((c) => c.method === method && c.url.pathname === path);

let detailBody: Record<string, unknown> = detail([]);
let detailStatus = 200;

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}
const search = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');

function renderPage(route = '/procurement/payment-lists/') {
  return renderWithProviders(
    <ModalsProvider>
      <PaymentListsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  detailBody = detail([]);
  detailStatus = 200;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/procurement/payment-lists/') {
      return json({ count: 2, next: null, previous: null, results: LISTS });
    }
    if (method === 'GET' && path === '/procurement/payment-lists/7/') return json(detailBody, detailStatus);
    if (method === 'GET' && path === '/procurement/payment-pool/') {
      return json({ count: 1, next: null, previous: null, results: [POOL_ROW] });
    }
    if (method === 'GET' && path === '/procurement/payment-pool/facets/') {
      return json({ job_nos: [{ value: '2501', label: '2501' }], gs_numbers: [], suppliers: [] });
    }
    if (method === 'POST' && path === '/procurement/payment-lists/') return json({ id: 99, title: 'Yeni' }, 201);
    if (method === 'POST' && path === '/procurement/payment-schedules/bulk_mark_paid/') {
      return json({ dry_run: false, paid: 1, skipped: 0, results: [{ schedule_id: 101, ok: true }] });
    }
    if (method === 'PATCH') return json({});
    if (method === 'DELETE') return json(undefined, 204);
    if (method === 'POST') return json({});
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('lists view', () => {
  it('renders the lists, the stat figures and asks for open lists by default', async () => {
    renderPage();
    expect(await screen.findByText('27.10.2026 Ödeme Listesi')).toBeInTheDocument();
    expect(screen.getByText('Bekleyen: Mehmet')).toBeInTheDocument();
    expect(screen.getByText('2 eksik')).toBeInTheDocument();

    const table = callsTo('GET', '/procurement/payment-lists/').find((c) => c.url.searchParams.get('page') === '1');
    expect(Object.fromEntries(table!.url.searchParams)).toEqual({ status: 'open', page: '1', page_size: '20' });
    // Stats: one 200-row page of open lists.
    expect(
      callsTo('GET', '/procurement/payment-lists/').some((c) => c.url.searchParams.get('page_size') === '200'),
    ).toBe(true);
    await waitFor(() => expect(within(document.getElementById('pl-open')!).getByText('2')).toBeInTheDocument());
    expect(within(document.getElementById('pl-submitted')!).getByText('1')).toBeInTheDocument();
    expect(within(document.getElementById('pl-missing')!).getByText('2')).toBeInTheDocument();
  });

  it('URL filters reach the request (the dashboard links ?status=submitted)', async () => {
    renderPage('/procurement/payment-lists/?status=submitted&gs=GS-1,%20GS-2&q=hafta');
    await screen.findByText('Eski Liste');
    const table = callsTo('GET', '/procurement/payment-lists/').find((c) => c.url.searchParams.get('page') === '1');
    expect(Object.fromEntries(table!.url.searchParams)).toEqual({
      status: 'submitted',
      q: 'hafta',
      gs: 'GS-1,GS-2',
      page: '1',
      page_size: '20',
    });
  });

  it('a row click opens the list (?list=<id>)', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Eski Liste'));
    await waitFor(() => expect(search().get('list')).toBe('8'));
  });

  it('creates a list with the legacy payload and opens it', async () => {
    renderPage();
    await screen.findByText('Eski Liste');
    fireEvent.click(screen.getByRole('button', { name: 'Yeni Liste' }));
    const dialog = await screen.findByRole('dialog', { name: 'Yeni Ödeme Listesi' });
    fireEvent.change(within(dialog).getByLabelText(/Bütçe \(EUR\)/), { target: { value: '2500.50' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
    await waitFor(() => expect(callsTo('POST', '/procurement/payment-lists/')).toHaveLength(1));
    const body = callsTo('POST', '/procurement/payment-lists/')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ budget_eur: '2500.50', notes: '' });
    expect(String(body.title)).toMatch(/Ödeme Listesi$/);
    expect(body.list_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body).not.toHaveProperty('carry_over_from');
    await waitFor(() => expect(search().get('list')).toBe('99'));
    expect(notify.success).toHaveBeenCalledWith('Liste oluşturuldu');
  });
});

describe('pool view', () => {
  it('asks for immediate, unlisted instalments by default and filters through the URL', async () => {
    renderPage('/procurement/payment-lists/?view=pool');
    expect(await screen.findByText('Sac levha')).toBeInTheDocument();
    const [first] = callsTo('GET', '/procurement/payment-pool/');
    expect(Object.fromEntries(first!.url.searchParams)).toEqual({
      basis: 'immediate',
      listed: 'false',
      page: '1',
      page_size: '50',
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Listede olanları gizle' }));
    await waitFor(() => expect(search().get('hide_listed')).toBe('false'));
    await waitFor(() => expect(callsTo('GET', '/procurement/payment-pool/')).toHaveLength(2));
    expect(callsTo('GET', '/procurement/payment-pool/')[1]!.url.searchParams.has('listed')).toBe(false);
  });

  it('job numbers from the URL travel as one comma-separated param', async () => {
    renderPage('/procurement/payment-lists/?view=pool&job_no=2501&job_no=2502&po_date_start=2026-10-01');
    await screen.findByText('Sac levha');
    const params = callsTo('GET', '/procurement/payment-pool/')[0]!.url.searchParams;
    expect(params.get('job_no')).toBe('2501,2502');
    expect(params.get('created_after')).toBe('2026-10-01');
  });

  it('selected rows open the bulk bar and the bulk mark-paid posts their schedules', async () => {
    renderPage('/procurement/payment-lists/?view=pool');
    await screen.findByText('Sac levha');
    const row = document.querySelector<HTMLElement>('tr[data-row-id="101"]')!;
    fireEvent.click(within(row).getByRole('checkbox'));
    const bar = await screen.findByTestId('pool-bulk-bar');
    expect(bar).toHaveTextContent('1 kalem seçildi');

    fireEvent.click(within(bar).getByRole('button', { name: /Ödendi İşaretle \(toplu\)/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Toplu Ödeme İşaretle' });
    fireEvent.click(within(dialog).getByRole('button', { name: '1 taksiti ödendi işaretle' }));
    await waitFor(() => expect(callsTo('POST', '/procurement/payment-schedules/bulk_mark_paid/')).toHaveLength(1));
    expect(callsTo('POST', '/procurement/payment-schedules/bulk_mark_paid/')[0]!.body).toMatchObject({
      schedule_ids: [101],
      paid_with_tax: true,
      dry_run: false,
    });
    expect(notify.success).toHaveBeenCalledWith('1 işaretlendi, 0 atlandı');
    await waitFor(() => expect(screen.queryByTestId('pool-bulk-bar')).not.toBeInTheDocument());
  });
});

describe('detail view', () => {
  /** The editable cell, or null when the cell is read-only. */
  const cell = (rowId: string, col: string) =>
    document.querySelector<HTMLElement>(
      `tr[data-row-id="${rowId}"] td[data-edit-cell][data-col="${col}"]`,
    );

  it('shows the toolbar the allowed actions permit', async () => {
    detailBody = detail(['add_items', 'submit', 'delete']);
    renderPage('/procurement/payment-lists/?list=7');
    const toolbar = await screen.findByTestId('pl-toolbar');
    expect(within(toolbar).getByRole('button', { name: 'Havuzdan Ekle' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Onaya Gönder' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Sil' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: "Excel'e Aktar" })).toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
    expect(within(toolbar).queryByRole('button', { name: 'Düzenle' })).not.toBeInTheDocument();
    expect(screen.getByTestId('pl-budget')).toHaveTextContent('Bütçe aşımı');
  });

  it('edits a note inline with update_item, and only on unpaid, included rows', async () => {
    detailBody = detail(['update_item']);
    renderPage('/procurement/payment-lists/?list=7');
    await screen.findByText('İlk ödeme');

    // Paid and excluded rows stay read-only: no edit cell.
    expect(cell('2', 'note')).toBeNull();
    expect(cell('3', 'note')).toBeNull();

    fireEvent.click(cell('1', 'note')!);
    const input = screen.getByRole('textbox', { name: 'Açıklama' });
    expect(input).toHaveValue('İlk ödeme');
    fireEvent.change(input, { target: { value: '  Acil ödenecek  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(callsTo('PATCH', '/procurement/payment-lists/7/items/1/')).toHaveLength(1));
    expect(callsTo('PATCH', '/procurement/payment-lists/7/items/1/')[0]!.body).toEqual({ note: 'Acil ödenecek' });
    await waitFor(() => expect(cell('1', 'note')).toHaveTextContent('Acil ödenecek'));
  });

  it('without update_item the note is not editable', async () => {
    detailBody = detail([]);
    renderPage('/procurement/payment-lists/?list=7');
    fireEvent.click(await screen.findByText('İlk ödeme'));
    expect(cell('1', 'note')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Açıklama' })).not.toBeInTheDocument();
  });

  it('submits after the confirm and reloads', async () => {
    detailBody = detail(['submit']);
    renderPage('/procurement/payment-lists/?list=7');
    fireEvent.click(await screen.findByRole('button', { name: 'Onaya Gönder' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('3 kalem, toplam €12.000,00 onaya gönderilecek.');
    expect(dialog).toHaveTextContent('Bütçe aşımı');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(callsTo('POST', '/procurement/payment-lists/7/submit/')).toHaveLength(1));
    expect(notify.success).toHaveBeenCalledWith('Liste onaya gönderildi');
    await waitFor(() => expect(callsTo('GET', '/procurement/payment-lists/7/').length).toBeGreaterThan(1));
  });

  it('excludes an item with a required reason', async () => {
    detailBody = detail(['exclude_item']);
    renderPage('/procurement/payment-lists/?list=7');
    await screen.findByText('İlk ödeme');
    const row = document.querySelector<HTMLElement>('tr[data-row-id="1"]')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Listeden Çıkar' }));
    const dialog = await screen.findByRole('dialog', { name: /Listeden çıkar: Demir A.Ş./ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Çıkar' }));
    expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Gerekçe/), { target: { value: 'Gelecek hafta' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Çıkar' }));
    await waitFor(() => expect(callsTo('POST', '/procurement/payment-lists/7/items/1/exclude/')).toHaveLength(1));
    expect(callsTo('POST', '/procurement/payment-lists/7/items/1/exclude/')[0]!.body).toEqual({ reason: 'Gelecek hafta' });
    expect(notify.success).toHaveBeenCalledWith('Kalem çıkarıldı');
  });

  it('deletes a draft list and goes back to the lists', async () => {
    detailBody = detail(['delete']);
    renderPage('/procurement/payment-lists/?list=7');
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sil' }));
    await waitFor(() => expect(callsTo('DELETE', '/procurement/payment-lists/7/')).toHaveLength(1));
    await waitFor(() => expect(search().has('list')).toBe(false));
    expect(notify.success).toHaveBeenCalledWith('Liste silindi');
  });

  it('a missing list goes back to the lists', async () => {
    detailStatus = 404;
    detailBody = { detail: 'Bulunamadı.' };
    renderPage('/procurement/payment-lists/?list=7');
    await waitFor(() => expect(search().has('list')).toBe(false));
    expect(notify.error).toHaveBeenCalled();
  });

  it('the picker adds the selected pool rows to the list', async () => {
    detailBody = detail(['add_items']);
    renderPage('/procurement/payment-lists/?list=7');
    fireEvent.click(await screen.findByRole('button', { name: 'Havuzdan Ekle' }));
    const dialog = await screen.findByRole('dialog', { name: 'Havuzdan Kalem Ekle' });
    await within(dialog).findByText('Sac levha');
    const params = callsTo('GET', '/procurement/payment-pool/')[0]!.url.searchParams;
    expect(params.get('listed')).toBe('false');
    const row = dialog.querySelector<HTMLElement>('tr[data-row-id="101"]')!;
    fireEvent.click(within(row).getByRole('checkbox'));
    expect(within(dialog).getByTestId('picker-count')).toHaveTextContent('1 kalem seçildi');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Seçilenleri Ekle' }));
    await waitFor(() => expect(callsTo('POST', '/procurement/payment-lists/7/items/')).toHaveLength(1));
    expect(callsTo('POST', '/procurement/payment-lists/7/items/')[0]!.body).toEqual({ schedule_ids: [101] });
    expect(notify.success).toHaveBeenCalledWith('1 kalem eklendi');
  });

  it('the Excel sheet keeps the old layout', () => {
    const sheet = paymentListSheet(detail([], { totals: { total_eur: '100', paid_eur: '40', remaining_eur: '60' } }) as never);
    expect(sheet[3]![0]).toBe('#');
    expect(sheet[4]).toEqual(
      expect.arrayContaining([1, 'Arçelik', '2501', 'GS-1', 'Sac levha', 'Demir A.Ş.', 4000, 'TRY', 1200, 30]),
    );
    expect(sheet[6]![15]).toBe('ÇIKARILDI — Ertelendi');
    expect(sheet.at(-1)).toEqual(['KALAN (EUR)', '', '', '', '', '', '', '', '', 60]);
  });
});
