import { authedFetch, hasPerm } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { exportToExcel } from '@/ui/DataTable/exportExcel';
import { FinanceOperationsPage } from './FinanceOperationsPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(() => false),
  isSuperuser: vi.fn(() => false),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: false }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ isAdmin: auth.isAdmin }) }));
vi.mock('@/ui/DataTable/exportExcel', () => ({ exportToExcel: vi.fn() }));

const fetchMock = vi.mocked(authedFetch);

const ORDER = {
  id: 11,
  supplier_name: 'Acme Çelik',
  purchase_request_number: 'SAT-5',
  status: 'awaiting_payment',
  status_label: 'Ödeme Bekliyor',
  total_amount: '1000.00',
  total_tax_amount: '200.00',
  tax_rate: '20.00',
  tax_outstanding: '200.00',
  currency: 'EUR',
  priority: 'high',
  created_at: '2026-10-01T10:00:00Z',
  payment_schedules: [
    {
      id: 101,
      sequence: 1,
      label: 'Peşin',
      percentage: '40.00',
      amount: '400.00',
      currency: 'EUR',
      due_date: '2020-01-01',
      is_paid: false,
      effective_tax_due: '80.00',
    },
    {
      id: 102,
      sequence: 2,
      label: 'Teslimde',
      percentage: '60.00',
      amount: '600.00',
      currency: 'EUR',
      due_date: '2099-01-01',
      is_paid: true,
      paid_with_tax: true,
      base_tax: '120.00',
    },
  ],
  lines: [
    {
      id: 1,
      item_code: 'MAL-1',
      item_name: 'Sac levha',
      quantity: '12.5',
      unit_price: '80',
      total_price: '1000',
      delivery_days: 7,
      allocations: [{ job_no: '254-01' }, { job_no: '254-02' }],
    },
  ],
};

const DBS_SUPPLIER = {
  id: 3,
  name: 'Banka Tedarik',
  has_dbs: true,
  dbs_bank: 'Garanti',
  dbs_currency: 'TRY',
  dbs_limit: '10000.00',
  dbs_used: '2500.00',
  dbs_expiry_date: '2099-01-01',
};

const INFLOW = [
  {
    source: 'sales_offer',
    offer_id: 5,
    offer_no: 'OF-26-5',
    sequence: 1,
    title: 'Tank teklifi',
    customer_name: 'Petkim',
    label: 'Avans taksiti',
    amount: '1000.00',
    currency: 'USD',
    amount_eur: '900.00',
    due_date: '2026-11-10',
    is_received: false,
    editable: false,
  },
  {
    source: 'expected_receipt',
    receipt_id: 70,
    installment_id: 7,
    sequence: 1,
    title: 'Retention',
    customer_name: 'Tüpraş',
    label: 'Teminat iadesi',
    amount: '500.00',
    currency: 'EUR',
    amount_eur: '500.00',
    due_date: '2026-12-05',
    is_received: false,
    editable: true,
  },
  {
    source: 'expected_receipt',
    receipt_id: 70,
    installment_id: 8,
    sequence: 2,
    label: 'Tahsil olmuş',
    amount: '10',
    currency: 'EUR',
    amount_eur: '10',
    due_date: '2026-10-05',
    is_received: true,
    editable: true,
  },
  {
    source: 'expected_receipt',
    receipt_id: 71,
    installment_id: 9,
    sequence: 1,
    label: 'Vadesiz',
    amount: '20',
    currency: 'EUR',
    amount_eur: '20',
    due_date: null,
    is_received: false,
    editable: true,
  },
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
const posts = (path: string) =>
  calls().filter((c) => c.method === 'POST' && c.url.pathname === path);
const gets = (path: string) => calls().filter((c) => c.method === 'GET' && c.url.pathname === path);

let evaluations: unknown[] = [];
let expenses: unknown[] = [];

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/finance/purchase-orders/') {
  return renderWithProviders(
    <ModalsProvider>
      <FinanceOperationsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

const rowOf = (text: string) => screen.getByText(text).closest('tr')!;

beforeEach(() => {
  auth.isAdmin = false;
  evaluations = [];
  expenses = [];
  vi.mocked(hasPerm).mockReturnValue(false);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET') {
      if (path === '/procurement/purchase-orders/')
        return json({ count: 1, next: null, previous: null, results: [ORDER] });
      if (path === '/procurement/purchase-orders/11/') return json(ORDER);
      if (path === '/procurement/supplier-evaluations/') return json({ results: evaluations });
      if (path === '/procurement/suppliers/') return json({ count: 1, results: [DBS_SUPPLIER] });
      if (path === '/procurement/dbs-payments/') return json({ results: [] });
      if (path === '/finance/expenses/') return json(expenses);
      if (path === '/finance/loans/') return json([]);
      if (path === '/finance/loans/40/installments/') {
        return json([
          {
            id: 1,
            sequence: 1,
            due_date: '2026-12-01',
            total_payment: '110',
            principal_component: '100',
            interest_component: '10',
            is_paid: false,
          },
        ]);
      }
      if (path === '/finance/reports/inflow-tracker/') return json(INFLOW);
    }
    if (method === 'POST') {
      if (path === '/finance/expected-receipts/') return json({ id: 70 }, 201);
      if (path === '/finance/loans/')
        return json({ id: 40, name: 'Ekipman', currency: 'TRY', status: 'active' }, 201);
      if (path === '/procurement/supplier-evaluations/')
        return json({ id: 1, supplier: { rating_score: 4.25 } }, 201);
      return json({}, 200);
    }
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.mocked(exportToExcel).mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('Satın Alma Siparişleri', () => {
  it('lists awaiting-payment orders and marks an instalment paid without its VAT', async () => {
    renderPage();
    const row = rowOf(await screen.findByText('Acme Çelik').then((el) => el.textContent!));
    expect(gets('/procurement/purchase-orders/')[0]!.url.searchParams.get('status')).toBe(
      'awaiting_payment',
    );
    expect(within(row).getByText('Gecikmiş')).toBeInTheDocument();
    expect(within(row).getByText(/\(KDV Ödendi\)/)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Ödeme İşaretle: Peşin' }));
    const amount = await screen.findByLabelText('Ödeme tutarı');
    expect(amount).toHaveValue('€480,00');
    fireEvent.click(screen.getByLabelText('KDV dahil ödeme yapıldı'));
    expect(amount).toHaveValue('€400,00');

    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İşaretle' }));
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Ödeme başarıyla işaretlendi.'),
    );
    expect(posts('/procurement/purchase-orders/11/mark_schedule_paid/')[0]!.body).toEqual({
      schedule_id: 101,
      paid_with_tax: false,
    });
  });

  it('opens ?order= in the detail modal and refuses a second evaluation', async () => {
    vi.mocked(hasPerm).mockReturnValue(true);
    evaluations = [{ id: 1 }];
    renderPage('/finance/purchase-orders/?order=11');
    const dialog = await screen.findByRole('dialog', { name: /Sipariş Detayları/ });
    await within(dialog).findByText('Sac levha');
    expect(within(dialog).getByRole('link', { name: 'SAT-5' })).toHaveAttribute(
      'href',
      '/procurement/purchase-requests/registry/?talep=SAT-5',
    );
    expect(within(dialog).getByText('254-01, 254-02')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Tedarikçi Değerlendir' }));
    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Bu sipariş zaten değerlendirilmiş.'),
    );
    expect(
      gets('/procurement/supplier-evaluations/')[0]!.url.searchParams.get('purchase_order'),
    ).toBe('11');
  });

  it('rates the supplier of an order that has no evaluation', async () => {
    vi.mocked(hasPerm).mockReturnValue(true);
    renderPage('/finance/purchase-orders/?order=11');
    const dialog = await screen.findByRole('dialog', { name: /Sipariş Detayları/ });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Tedarikçi Değerlendir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Değerlendirmeyi Kaydet' }));
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith(
        'Değerlendirme kaydedildi. Tedarikçinin yeni puanı: 4.25',
      ),
    );
    expect(posts('/procurement/supplier-evaluations/')[0]!.body).toEqual({
      purchase_order: 11,
      quality_score: 4,
      delivery_score: 4,
      price_score: 4,
      service_score: 4,
      comment: '',
    });
  });

  it('hides the evaluation without the procurement write permission and closes on Kapat', async () => {
    renderPage('/finance/purchase-orders/?order=11');
    const dialog = await screen.findByRole('dialog', { name: /Sipariş Detayları/ });
    await within(dialog).findByText('Sac levha');
    expect(within(dialog).queryByRole('button', { name: 'Tedarikçi Değerlendir' })).toBeNull();
    // The header's close icon and the footer button are both "Kapat".
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' })[0]!);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^$/));
  });

  it('offers delete to admins only, after a confirm', async () => {
    renderPage();
    await screen.findByText('Acme Çelik');
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
  });

  it('deletes an order as an admin', async () => {
    auth.isAdmin = true;
    renderPage();
    await screen.findByText('Acme Çelik');
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Evet' }));
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Satın alma siparişi silindi.'),
    );
    expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
      '/procurement/purchase-orders/11/',
    );
  });

  it('exports every order of the status filter', async () => {
    renderPage('/finance/purchase-orders/?status=paid');
    await screen.findByText('Acme Çelik');
    fireEvent.click(screen.getByRole('button', { name: 'Dışa Aktar' }));
    await waitFor(() => expect(exportToExcel).toHaveBeenCalled());
    const [rows, , options] = vi.mocked(exportToExcel).mock.calls[0]!;
    expect(rows).toHaveLength(1);
    expect(options.fileName).toMatch(/^purchase-orders-\d{4}-\d{2}-\d{2}$/);
    const exportCall = gets('/procurement/purchase-orders/').at(-1)!;
    expect(exportCall.url.searchParams.get('status')).toBe('paid');
    expect(exportCall.url.searchParams.get('page_size')).toBe('100');
  });

  it('switches tabs through the URL', async () => {
    renderPage();
    await screen.findByText('Acme Çelik');
    fireEvent.click(screen.getByRole('button', { name: 'Krediler' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?tab=loans'));
    expect(await screen.findByText('Kayıtlı kredi bulunmamaktadır.')).toBeInTheDocument();
  });
});

describe('DBS Tedarikçileri', () => {
  it('shows the available credit, warns on overpayment and records a payment', async () => {
    renderPage('/finance/purchase-orders/?tab=dbs');
    const row = rowOf(await screen.findByText('Banka Tedarik').then((el) => el.textContent!));
    expect(gets('/procurement/suppliers/')[0]!.url.searchParams.get('has_dbs')).toBe('true');
    expect(within(row).getByText('₺7.500,00')).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: 'Öde' }));
    const amount = await screen.findByLabelText(/Tutar/);
    fireEvent.change(amount, { target: { value: '3000' } });
    expect(await screen.findByText(/kullanılan krediden büyük/)).toBeInTheDocument();
    fireEvent.change(amount, { target: { value: '500' } });
    await waitFor(() => expect(screen.queryByText(/kullanılan krediden büyük/)).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Ödemeyi Kaydet' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('DBS ödemesi kaydedildi.'));
    expect(posts('/procurement/dbs-payments/')[0]!.body).toEqual({ supplier: 3, amount: '500.00' });
  });
});

describe('Aylık Giderler', () => {
  it('filters currency on the client, which the backend ignores', async () => {
    expenses = [
      {
        id: 1,
        description: 'Yemek',
        currency: 'TRY',
        status: 'active',
        category: 'catering',
        recurrence: 'monthly',
        amount: '100',
      },
      {
        id: 2,
        description: 'Depo kirası',
        currency: 'EUR',
        status: 'active',
        category: 'rent',
        recurrence: 'monthly',
        amount: '900',
      },
    ];
    renderPage('/finance/purchase-orders/?tab=expenses&currency=EUR');
    expect(await screen.findByText('Depo kirası')).toBeInTheDocument();
    expect(screen.queryByText('Yemek')).toBeNull();
    const request = gets('/finance/expenses/')[0]!.url.searchParams;
    expect(request.get('status')).toBe('active');
    expect(request.has('currency')).toBe(false);
  });

  it('validates and creates an expense', async () => {
    renderPage('/finance/purchase-orders/?tab=expenses');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Gider' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Açıklama zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Geçerli pozitif bir tutar girin.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Açıklama/), { target: { value: 'Servis' } });
    fireEvent.change(screen.getByLabelText(/^Tutar/), { target: { value: '1250,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Gider kaydedildi.'));
    expect(posts('/finance/expenses/')[0]!.body).toMatchObject({
      category: 'catering',
      recurrence: 'monthly',
      description: 'Servis',
      amount: '1250.50',
      currency: 'TRY',
      end_date: null,
      status: 'active',
    });
  });
});

describe('Beklenen Tahsilatlar', () => {
  it('groups pending rows by due month with undated ones last', async () => {
    renderPage('/finance/purchase-orders/?tab=receipts');
    expect(await screen.findByText('Kasım 2026')).toBeInTheDocument();
    expect(screen.getByText('Aralık 2026')).toBeInTheDocument();
    expect(screen.getByText('Vade tarihi yok')).toBeInTheDocument();
    expect(screen.queryByText('Tahsil olmuş')).toBeNull();
    expect(screen.getByRole('link', { name: 'OF-26-5' })).toHaveAttribute(
      'href',
      '/sales/offers?offer_no=OF-26-5',
    );
    // A USD row shows its EUR value too.
    expect(within(rowOf('Avans taksiti')).getByText('€900,00')).toBeInTheDocument();
  });

  it('asks for notes before marking an offer instalment received', async () => {
    renderPage('/finance/purchase-orders/?tab=receipts');
    const row = rowOf(await screen.findByText('Avans taksiti').then((el) => el.textContent!));
    fireEvent.click(within(row).getByRole('button', { name: 'Tahsil edildi' }));
    fireEvent.change(await screen.findByLabelText('Notlar'), { target: { value: 'Havale geldi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tahsil Edildi' }));
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Taksit tahsil edildi olarak işaretlendi.'),
    );
    expect(posts('/finance/offer-installments/5/1/mark-received/')[0]!.body).toEqual({
      notes: 'Havale geldi',
    });
  });

  it('creates a receipt and then its instalments', async () => {
    renderPage('/finance/purchase-orders/?tab=receipts');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Tahsilat' }));
    fireEvent.change(await screen.findByLabelText(/Başlık/), { target: { value: 'Retention' } });
    fireEvent.change(screen.getByLabelText(/^Müşteri/), { target: { value: 'Tüpraş' } });
    fireEvent.change(screen.getByLabelText(/Toplam tutar/), { target: { value: '300' } });
    const draft = screen.getByTestId('draft-installment');
    fireEvent.change(within(draft).getByLabelText('Etiket'), { target: { value: 'Avans' } });
    fireEvent.change(within(draft).getByLabelText('Tutar'), { target: { value: '100' } });
    expect(screen.getByText(/Üst kayıt toplamı/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Tahsilat ve 1 taksit kaydedildi.'),
    );
    expect(posts('/finance/expected-receipts/')[0]!.body).toMatchObject({
      title: 'Retention',
      customer_name: 'Tüpraş',
      total_amount: '300.00',
      currency: 'EUR',
      job_order: null,
      status: 'expected',
    });
    expect(posts('/finance/expected-receipts/70/installments/')[0]!.body).toMatchObject({
      sequence: 1,
      label: 'Avans',
      amount: '100.00',
    });
  });

  it('adds an instalment with the next sequence of its receipt', async () => {
    renderPage('/finance/purchase-orders/?tab=receipts');
    const row = rowOf(await screen.findByText('Teminat iadesi').then((el) => el.textContent!));
    // Six actions: two inline, the rest in the menu.
    fireEvent.click(within(row).getByRole('button', { name: 'Diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Taksit ekle' }));
    expect(await screen.findByLabelText(/Sıra/)).toHaveValue('3');
  });
});

describe('Krediler', () => {
  it('opens a new loan’s instalments and marks one paid', async () => {
    renderPage('/finance/purchase-orders/?tab=loans');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni Kredi' }));
    fireEvent.change(await screen.findByLabelText(/Kredi adı/), { target: { value: 'Ekipman' } });
    fireEvent.change(screen.getByLabelText(/Anapara/), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText(/Yıllık faiz/), { target: { value: '42,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Kredi kaydedildi.'));
    expect(posts('/finance/loans/')[0]!.body).toMatchObject({
      name: 'Ekipman',
      principal: '100000.00',
      interest_rate: '42.50',
      term_months: 24,
    });

    const dialog = await screen.findByRole('dialog', { name: /Kredi Taksitleri/ });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Ödendi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ödendi İşaretle' }));
    await waitFor(() =>
      expect(notify.success).toHaveBeenCalledWith('Taksit ödendi olarak işaretlendi.'),
    );
    expect(posts('/finance/loans/40/installments/1/mark-paid/')).toHaveLength(1);
  });
});
