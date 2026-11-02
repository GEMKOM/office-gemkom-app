import { authedFetch, hasPerm, isSuperuser } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { SuppliersPage } from './SuppliersPage';

vi.mock('@legacy/authService.js', () => ({
  authedFetch: vi.fn(),
  hasPerm: vi.fn(),
  isSuperuser: vi.fn(),
}));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);
const hasPermMock = vi.mocked(hasPerm);
const isSuperuserMock = vi.mocked(isSuperuser);

const SUPPLIERS = [
  {
    id: 7,
    name: 'Bosch Rexroth',
    contact_person: 'Ayşe Yılmaz',
    default_currency: 'EUR',
    default_tax_rate: '20.00',
    is_active: true,
    default_payment_terms: 3,
    has_dbs: true,
    dbs_limit: '150000.00',
    dbs_currency: 'TRY',
    status: 'watch',
    rating_score: 4.5,
    rating_count: 2,
  },
  {
    id: 6,
    name: 'Festo',
    is_active: false,
    default_tax_rate: 18,
    status: 'approved',
    rating_score: null,
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
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/procurement/suppliers/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/procurement/suppliers/list') {
  return renderWithProviders(
    <ModalsProvider>
      <SuppliersPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/procurement/suppliers/') {
      return json({ count: 42, next: null, previous: null, results: SUPPLIERS });
    }
    if (method === 'GET' && path === '/procurement/payment-terms/') {
      return json({ count: 1, results: [{ id: 3, name: '30 gün vadeli' }] });
    }
    if (method === 'GET' && path === '/procurement/suppliers/7/')
      return json({ ...SUPPLIERS[0], code: 'T-7' });
    if (method === 'POST' && path === '/procurement/suppliers/')
      return json({ id: 99, name: 'Yeni' }, 201);
    if (method === 'POST' && path === '/procurement/suppliers/7/set-status/')
      return json({ ...SUPPLIERS[0] });
    if (method === 'PUT') return json({ ...SUPPLIERS[0] });
    if (method === 'DELETE') return json(undefined, 204);
    return json({ detail: 'not mocked' }, 404);
  });
  hasPermMock.mockReset();
  hasPermMock.mockReturnValue(true);
  isSuperuserMock.mockReset();
  isSuperuserMock.mockReturnValue(false);
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the rows, stats and the first request with the legacy params', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: /Tedarikçiler/ })).toBeInTheDocument();
  expect(await screen.findByText('Bosch Rexroth')).toBeInTheDocument();
  expect(screen.getByText('Festo')).toBeInTheDocument();
  expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument();
  expect(screen.getByText('İzlemede')).toBeInTheDocument();
  expect(screen.getByText('150.000,00 TRY')).toBeInTheDocument();
  expect(screen.getByText('(2)')).toBeInTheDocument();
  expect(await screen.findByText('30 gün vadeli')).toBeInTheDocument();

  // Toplam from count; the other three from the loaded page (legacy).
  expect(
    within(document.getElementById('all-suppliers-count')!).getByText('2'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('active-suppliers-count')!).getByText('1'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('inactive-suppliers-count')!).getByText('1'),
  ).toBeInTheDocument();
  expect(
    within(document.getElementById('total-suppliers-count')!).getByText('42'),
  ).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
  expect(
    calls()
      .find((c) => c.url.pathname === '/procurement/payment-terms/')!
      .url.searchParams.get('page_size'),
  ).toBe('100');
});

it('filters from the URL reach the request under the legacy param names', async () => {
  renderPage(
    '/procurement/suppliers/list?name=bosch&contact_person=ay&is_active=true&default_currency=EUR&created_at__gte=2026-01-01&supplier_status=blacklisted&ordering=name&page=2',
  );
  await screen.findByText('Bosch Rexroth');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    name: 'bosch',
    contact_person: 'ay',
    is_active: 'true',
    default_currency: 'EUR',
    created_at__gte: '2026-01-01',
    supplier_status: 'blacklisted',
    ordering: 'name',
    page: '2',
    page_size: '20',
  });
});

it('typing a name filters, writes the URL and goes back to page 1', async () => {
  renderPage('/procurement/suppliers/list?page=3');
  await screen.findByText('Bosch Rexroth');
  fireEvent.change(screen.getByLabelText('Tedarikçi Adı'), { target: { value: 'fes' } });
  fireEvent.keyDown(screen.getByLabelText('Tedarikçi Adı'), { key: 'Enter' });

  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('name')).toBe('fes');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    name: 'fes',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
});

it('sorting a column asks the server, starting ascending', async () => {
  renderPage();
  await screen.findByText('Bosch Rexroth');
  fireEvent.click(screen.getByRole('button', { name: /Ödeme Koşulları/ }));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(listCalls()[1]!.url.searchParams.get('ordering')).toBe('payment_terms_name');
});

// A long form with three submits: give it room under a full parallel run.
it('the create form validates and then posts the legacy body', async () => {
  renderPage();
  await screen.findByText('Bosch Rexroth');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Tedarikçi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Tedarikçi' });

  // Name required (field check).
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();

  // A negative tax rate passes the field check and fails the save check.
  fireEvent.change(within(dialog).getByLabelText(/Tedarikçi Adı/), {
    target: { value: '  Yeni Firma  ' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Varsayılan vergi oranı/), {
    target: { value: '-1' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Geçerli bir vergi oranı giriniz (0–100 arası)'),
  );
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Varsayılan vergi oranı/), {
    target: { value: '18' },
  });
  // DBS fields only go out when DBS is ticked.
  fireEvent.change(within(dialog).getByLabelText('DBS bankası'), { target: { value: 'İşbank' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Tedarikçi başarıyla oluşturuldu'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/procurement/suppliers/');
  expect(post.body).toEqual({
    code: '',
    name: 'Yeni Firma',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    bank_info: '',
    default_currency: 'TRY',
    default_payment_terms: null,
    default_tax_rate: 18,
    is_active: true,
    has_dbs: false,
    dbs_bank: '',
    dbs_limit: null,
    dbs_currency: 'TRY',
    dbs_agreement_no: '',
    dbs_expiry_date: null,
    dbs_details: '',
  });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
}, 15_000);

it('shows the legacy message when the backend rejects the create', async () => {
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'POST'
      ? json({ error: 'Bu isimde tedarikçi var' }, 400)
      : new URL(String(url)).pathname === '/procurement/suppliers/'
        ? json({ count: 0, next: null, previous: null, results: [] })
        : json([]),
  );
  renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Tedarikçi' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Tedarikçi Adı/), { target: { value: 'X' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Tedarikçi kaydedilirken hata oluştu: Bu isimde tedarikçi var',
    ),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('edit loads the supplier fresh and PUTs the full body', async () => {
  renderPage();
  await screen.findByText('Bosch Rexroth');
  const firstRow = screen.getByText('Bosch Rexroth').closest('tr')!;
  fireEvent.click(within(firstRow).getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Düzenle' }));

  const dialog = await screen.findByRole('dialog', { name: 'Tedarikçi Düzenle' });
  expect(within(dialog).getByLabelText(/Kod/)).toHaveValue('T-7');
  expect(within(dialog).getByLabelText(/Varsayılan vergi oranı/)).toHaveValue(20);
  expect(within(dialog).getByLabelText('DBS kullanıyor')).toBeChecked();

  fireEvent.change(within(dialog).getByLabelText('DBS limiti'), { target: { value: '-5' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Güncelle' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Geçerli bir DBS limiti giriniz (0 veya daha büyük)'),
  );

  fireEvent.change(within(dialog).getByLabelText('DBS limiti'), { target: { value: '200000' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Güncelle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Tedarikçi başarıyla güncellendi'),
  );
  const put = calls().find((c) => c.method === 'PUT')!;
  expect(put.url.pathname).toBe('/procurement/suppliers/7/');
  expect(put.body).toMatchObject({
    code: 'T-7',
    name: 'Bosch Rexroth',
    default_currency: 'EUR',
    default_payment_terms: 3,
    default_tax_rate: 20,
    has_dbs: true,
    dbs_limit: 200000,
    dbs_currency: 'TRY',
  });
});

it('deletes a supplier only after the confirm', async () => {
  renderPage();
  await screen.findByText('Bosch Rexroth');
  const firstRow = screen.getByText('Bosch Rexroth').closest('tr')!;
  fireEvent.click(within(firstRow).getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));

  expect(
    await screen.findByText(
      '"Bosch Rexroth" tedarikçisini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Tedarikçi başarıyla silindi'));
  expect(calls().find((c) => c.method === 'DELETE')!.url.pathname).toBe(
    '/procurement/suppliers/7/',
  );
});

it('Durum Değiştir needs the suppliers-list permission (or superuser)', async () => {
  hasPermMock.mockReturnValue(false);
  renderPage();
  await screen.findByText('Bosch Rexroth');
  const firstRow = screen.getByText('Bosch Rexroth').closest('tr')!;
  // Four actions left: two icons and the menu.
  fireEvent.click(within(firstRow).getByRole('button', { name: 'Diğer işlemler' }));
  expect(await screen.findByRole('menuitem', { name: 'Düzenle' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Durum Değiştir' })).toBeNull();
  expect(hasPermMock).toHaveBeenCalledWith('access_procurement_suppliers_list');
});

it('changes the supplier status with a reason', async () => {
  hasPermMock.mockImplementation((code: string) => code === 'access_procurement_suppliers_list');
  renderPage();
  await screen.findByText('Bosch Rexroth');
  const firstRow = screen.getByText('Bosch Rexroth').closest('tr')!;
  fireEvent.click(within(firstRow).getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Durum Değiştir' }));

  const dialog = await screen.findByRole('dialog', { name: 'Tedarikçi Durumu Değiştir' });
  fireEvent.change(within(dialog).getByLabelText('Gerekçe'), {
    target: { value: ' Geç teslimat ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Tedarikçi durumu güncellendi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/procurement/suppliers/7/set-status/');
  expect(post.body).toEqual({ status: 'watch', reason: 'Geç teslimat' });
});

it('rates an unrated purchase order from the purchase history', async () => {
  isSuperuserMock.mockReturnValue(true);
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (path === '/procurement/suppliers/7/purchase-history/') {
      return json([
        {
          purchase_order: 55,
          request_number: 'SAT-12',
          title: 'Rulman alımı',
          line_count: 1,
          delivered_line_count: 0,
          total_amount: '1000',
          currency: 'EUR',
          po_status: 'awaiting_payment',
          po_status_label: 'Ödeme Bekliyor',
          lines: [],
          evaluation: null,
        },
      ]);
    }
    if (method === 'POST' && path === '/procurement/supplier-evaluations/') {
      return json(
        { id: 1, composite_score: '4.25', comment: '', evaluated_by_username: 'ali' },
        201,
      );
    }
    if (path === '/procurement/suppliers/')
      return json({ count: 2, next: null, previous: null, results: SUPPLIERS });
    return json([]);
  });
  renderPage();
  await screen.findByText('Bosch Rexroth');
  const firstRow = screen.getByText('Bosch Rexroth').closest('tr')!;
  fireEvent.click(within(firstRow).getByRole('button', { name: 'Satın Alma Geçmişi' }));

  const dialog = await screen.findByRole('dialog', { name: /Satın Alma Geçmişi — Bosch Rexroth/ });
  expect(await within(dialog).findByText('SAT-12')).toHaveAttribute(
    'href',
    '/procurement/purchase-requests/registry/?talep=SAT-12',
  );

  fireEvent.click(within(dialog).getByRole('button', { name: 'Değerlendir' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith(
      'Lütfen tüm kriterleri (1–5) yıldız ile değerlendirin.',
    ),
  );

  fireEvent.click(within(dialog).getByRole('radio', { name: 'Kalite: 5' }));
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Teslimat: 4' }));
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Fiyat: 4' }));
  fireEvent.click(within(dialog).getByRole('radio', { name: 'Servis: 4' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Değerlendir' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Değerlendirme kaydedildi (4.25 / 5).'),
  );
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    purchase_order: 55,
    quality_score: 5,
    delivery_score: 4,
    price_score: 4,
    service_score: 4,
    comment: '',
  });
  // The card turns into the saved evaluation.
  expect(await within(dialog).findByText('4.25')).toBeInTheDocument();
});
