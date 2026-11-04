import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { paymentTermFieldValue } from './dialogs/OfferFormModal';
import { OffersPage } from './OffersPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: () => false,
  isAdmin: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'satis' } }),
}));

const fetchMock = vi.mocked(authedFetch);

const OFFERS = [
  {
    id: 1,
    offer_no: 'TKL-001',
    title: 'Konveyör hattı',
    status: 'pricing',
    status_display: 'Fiyatlandırma',
    customer_name: 'Arçelik',
    customer_code: 'C-1',
    total_price: '1250.5',
    item_count: 3,
    offer_expiry_date: '2099-01-01',
    created_at: '2026-10-01T09:00:00Z',
  },
  {
    id: 2,
    offer_no: 'TKL-002',
    title: 'Kazan',
    status: 'submitted_customer',
    created_at: '2026-10-02T09:00:00Z',
  },
  {
    id: 3,
    offer_no: 'TKL-003',
    title: 'Taslak iş',
    status: 'draft',
    created_at: '2026-10-03T09:00:00Z',
  },
];

const DETAIL = {
  ...OFFERS[0],
  description: 'Kapsam',
  customer: 7,
  customer_detail: { phone: '0212', address: 'İstanbul', tax_id: '', tax_office: '' },
  pricing_mode: 'flat',
  shipping_price: '0',
  approval_round: 1,
  payment_terms: { id: 3, name: 'Peşin' },
};

const ITEMS = [
  {
    id: 10,
    parent: null,
    sequence: 1,
    template_node: 5,
    template_node_detail: { id: 5, title: 'Konveyör' },
    resolved_title: 'Konveyör',
    quantity: 2,
    unit_price: '100',
    weight_kg: '10',
    children: [
      { id: 11, parent: 10, sequence: 1, resolved_title: 'Motor', quantity: 1, children: [] },
    ],
  },
];

const APPROVAL = {
  offer_no: 'TKL-001',
  status: 'pending_approval',
  status_display: 'Onay Bekliyor',
  customer_name: 'Arçelik',
  total_price: '200',
  total_weight_kg: '20',
  current_user_can_decide: true,
  items: ITEMS,
  workflows: [],
};

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
const patches = (path: string) =>
  calls().filter((c) => c.method === 'PATCH' && c.url.pathname === path);
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/sales/offers/');

let salesTeam: { id: number; username: string; full_name?: string }[] = [];

beforeEach(() => {
  salesTeam = [{ id: 42, username: 'satis', full_name: 'Satış Kişi' }];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(String(url));
    const path = u.pathname;
    if (method === 'GET') {
      if (path === '/users/dropdown/') return json(salesTeam);
      if (path === '/sales/offers/') {
        const search = u.searchParams.get('search');
        const rows = search ? OFFERS.filter((o) => o.offer_no === search) : OFFERS;
        return json({ count: rows.length === 3 ? 57 : rows.length, results: rows });
      }
      if (path === '/sales/offers/1/') return json(DETAIL);
      if (path === '/sales/offers/1/items/') return json(ITEMS);
      if (path === '/sales/offers/1/files/') return json([]);
      if (path === '/sales/offers/1/price-history/') return json([]);
      if (path === '/sales/offers/1/consultations/') return json([]);
      if (path === '/sales/offers/1/approval-status/') return json(APPROVAL);
      if (path === '/procurement/payment-terms/')
        return json({ results: [{ id: 3, name: 'Peşin' }] });
      if (path === '/sales/offer-templates/') return json([]);
      return json({ detail: 'not mocked' }, 404);
    }
    if (path === '/sales/offers/') return json({ id: 9, offer_no: 'TKL-009' }, 201);
    return json({});
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}
const urlParams = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');

function renderPage(route = '/sales/offers/') {
  return renderWithProviders(
    <ModalsProvider>
      <OffersPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

it('lists offers with the page stats; a sales person starts on their own offers', async () => {
  renderPage();
  expect(await screen.findByText('TKL-001')).toBeInTheDocument();
  expect(screen.getByText('1.250,50')).toBeInTheDocument();
  expect(within(document.getElementById('total-offers')!).getByText('57')).toBeInTheDocument();
  expect(within(document.getElementById('draft-offers')!).getByText('1')).toBeInTheDocument();
  expect(within(document.getElementById('active-offers')!).getByText('2')).toBeInTheDocument();

  // One list request, after the sales team is known, with the user as creator.
  expect(listCalls()).toHaveLength(1);
  const params = listCalls()[0]!.url.searchParams;
  expect(params.get('created_by')).toBe('42');
  expect(params.get('ordering')).toBe('-created_at');
  expect(params.get('page_size')).toBe('20');
});

it('shows everyone’s offers to someone outside the sales team, and honours ?created_by=', async () => {
  salesTeam = [{ id: 5, username: 'baska' }];
  const { unmount } = renderPage();
  await screen.findByText('TKL-001');
  expect(listCalls()[0]!.url.searchParams.has('created_by')).toBe(false);
  unmount();

  fetchMock.mockClear();
  renderPage('/sales/offers/?created_by=5&status=won&status=lost&customer_ref=RFQ');
  await screen.findByText('TKL-001');
  const params = listCalls()[0]!.url.searchParams;
  expect(params.get('created_by')).toBe('5');
  expect(params.get('status__in')).toBe('won,lost');
  expect(params.get('customer_inquiry_ref__icontains')).toBe('RFQ');
});

it('the status badge opens the offer on its tab and puts it in the URL; closing removes it', async () => {
  renderPage();
  fireEvent.click(await screen.findByTitle('Fiyatlandırma sekmesini aç'));
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  await waitFor(() => expect(urlParams().get('offer_no')).toBe('TKL-001'));
  expect(urlParams().get('tab')).toBe('pricing');
  expect(within(dialog).getByRole('tab', { name: 'Fiyatlandırma' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // No Tahmin tab without view_estimates.
  expect(within(dialog).queryByRole('tab', { name: 'Tahmin' })).not.toBeInTheDocument();

  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
  await waitFor(() => expect(urlParams().has('offer_no')).toBe(false));
  expect(urlParams().has('tab')).toBe(false);
});

it('a deep link without a tab opens Onay after resolving the offer number', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  expect(within(dialog).getByRole('tab', { name: 'Onay' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(await within(dialog).findByText('Kalemler (Ağırlık & Fiyat)')).toBeInTheDocument();
  // The approval payload lets this user decide: the footer offers it too.
  expect(within(dialog).getAllByRole('button', { name: 'Onayla' })).toHaveLength(2);
});

it('warns when the linked offer does not exist', async () => {
  renderPage('/sales/offers/?offer_no=YOK-1&tab=genel');
  await waitFor(() => expect(notify.warning).toHaveBeenCalledWith('Teklif bulunamadı'));
  await waitFor(() => expect(urlParams().has('offer_no')).toBe(false));
});

it('marks an offer won only after the confirm', async () => {
  renderPage();
  await screen.findByText('TKL-002');
  fireEvent.click(screen.getByRole('button', { name: 'Kazanıldı' }));
  expect(
    await screen.findByText('Teklifi kazanıldı olarak işaretlemek istediğinize emin misiniz?'),
  ).toBeInTheDocument();
  expect(posts('/sales/offers/2/mark-won/')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Evet' }));
  await waitFor(() => expect(posts('/sales/offers/2/mark-won/')).toHaveLength(1));
  expect(notify.success).toHaveBeenCalledWith('Kazanıldı olarak işaretlendi');
});

it('paymentTermFieldValue keeps a nested term id for the edit form', () => {
  expect(paymentTermFieldValue({ id: 3, name: 'Peşin' })).toBe('3');
  expect(paymentTermFieldValue(3)).toBe('3');
  expect(paymentTermFieldValue('3')).toBe('3');
  expect(paymentTermFieldValue(null)).toBe('');
  expect(paymentTermFieldValue({ name: 'Peşin' })).toBe('');
});

it('editing an offer PATCHes the nested payment term id, not null', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001&tab=genel');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  expect(await within(dialog).findByText('Peşin')).toBeInTheDocument();
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Düzenle' }).at(-1)!);
  const edit = await screen.findByRole('dialog', { name: 'Teklifi Düzenle' });
  fireEvent.click(within(edit).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(patches('/sales/offers/1/')).toHaveLength(1));
  expect(patches('/sales/offers/1/')[0]!.body).toMatchObject({
    title: 'Konveyör hattı',
    payment_terms: '3',
  });
});

it('the new offer form requires a customer and a title', async () => {
  renderPage();
  await screen.findByText('TKL-001');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Teklif' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Teklif Oluştur' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(2);
  expect(posts('/sales/offers/')).toHaveLength(0);
});

it('Kalemler: a custom row and an edit are saved as add-items then update-items', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001&tab=kalemler');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  const titles = await within(dialog).findAllByRole('textbox', { name: 'Kalem adı' });
  expect(titles.map((t) => (t as HTMLInputElement).value)).toEqual(['Konveyör', 'Motor']);

  // Rename the saved child and add a custom row under the root.
  fireEvent.change(titles[1]!, { target: { value: 'Motor 5kW' } });
  fireEvent.click(within(dialog).getAllByRole('button', { name: '+ alt' })[0]!);
  expect(within(dialog).getByTestId('staged-count')).toHaveTextContent('+1 ~1');

  fireEvent.click(within(dialog).getByRole('button', { name: 'Değişiklikleri Kaydet' }));
  await waitFor(() => expect(posts('/sales/offers/1/update-items/')).toHaveLength(1));
  expect(posts('/sales/offers/1/add-items/')[0]!.body).toEqual({
    items: [{ _ref: 'item-1', quantity: 1, title_override: 'Yeni Kalem', parent: 10 }],
  });
  expect(posts('/sales/offers/1/update-items/')[0]!.body).toEqual({
    items: [{ id: 11, title_override: 'Motor 5kW' }],
  });
  expect(posts('/sales/offers/1/delete-items/')).toHaveLength(0);
  expect(notify.success).toHaveBeenCalledWith('Değişiklikler kaydedildi');
});

it('Kalemler: pasted rows are staged under the chosen parent', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001&tab=kalemler');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  await within(dialog).findAllByRole('textbox', { name: 'Kalem adı' });
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Alt kalemleri yapıştır' })[0]!);
  const paste = await screen.findByRole('dialog', { name: 'Alt Kalemleri Yapıştır' });
  expect(within(paste).getByText('Konveyör')).toBeInTheDocument();
  fireEvent.change(within(paste).getByLabelText('Yapıştır'), {
    target: { value: 'Rulo\t4\nŞase\t1' },
  });
  expect(within(paste).getByText('2 kalem')).toBeInTheDocument();
  fireEvent.click(within(paste).getByRole('button', { name: 'Ekle' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('2 alt kalem eklendi'));
  expect(within(dialog).getByTestId('staged-count')).toHaveTextContent('+2');
  const values = within(dialog)
    .getAllByRole('textbox', { name: 'Kalem adı' })
    .map((t) => (t as HTMLInputElement).value);
  expect(values).toEqual(['Konveyör', 'Motor', 'Rulo', 'Şase']);
});

it('Fiyatlandırma: totals follow the edits and one set-prices POST saves them', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001&tab=pricing');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  expect(await within(dialog).findByTestId('pricing-items-total')).toHaveTextContent('€200');

  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Birim fiyat' }), {
    target: { value: '150' },
  });
  expect(within(dialog).getByTestId('pricing-items-total')).toHaveTextContent('€300');
  expect(within(dialog).getByText('Kaydedilmedi')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Fiyatları Kaydet' }));
  await waitFor(() => expect(posts('/sales/offers/1/set-prices/')).toHaveLength(1));
  expect(posts('/sales/offers/1/set-prices/')[0]!.body).toEqual({
    pricing_mode: 'flat',
    shipping_price: 0,
    items: [
      { id: 10, unit_price: 150, quantity: 2, notes: '', weight_kg: 10, delivery_period: '' },
      { id: 11, unit_price: null, quantity: 1, notes: '', weight_kg: null, delivery_period: '' },
    ],
  });
});

it('Fiyatlandırma: submitting for approval with unsaved prices is refused', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001&tab=pricing');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  await within(dialog).findByTestId('pricing-items-total');
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Birim fiyat' }), {
    target: { value: '150' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onaya Gönder' }));
  expect(notify.warning).toHaveBeenCalledWith(
    'Kaydedilmemiş değişiklikler var. Önce "Fiyatları Kaydet" ile kaydedin.',
  );
  expect(screen.queryByRole('dialog', { name: 'Onaya Gönder' })).not.toBeInTheDocument();
});

it('a rejection needs a comment and sends the counter offer', async () => {
  renderPage('/sales/offers/?offer_no=TKL-001&tab=approval');
  const dialog = await screen.findByRole('dialog', { name: 'TKL-001 — Konveyör hattı' });
  await within(dialog).findByText('Kalemler (Ağırlık & Fiyat)');
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Reddet' })[0]!);
  const reject = await screen.findByRole('dialog', { name: 'Reddet' });
  fireEvent.click(within(reject).getByRole('button', { name: 'Kaydet' }));
  expect(notify.warning).toHaveBeenCalledWith('Red için yorum zorunludur');
  expect(posts('/sales/offers/1/decide/')).toHaveLength(0);

  fireEvent.change(within(reject).getByLabelText(/Yorum/), { target: { value: 'Pahalı' } });
  fireEvent.change(within(reject).getByLabelText('Karşı Tutar'), { target: { value: '180' } });
  fireEvent.click(within(reject).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(posts('/sales/offers/1/decide/')).toHaveLength(1));
  expect(posts('/sales/offers/1/decide/')[0]!.body).toEqual({
    approve: false,
    comment: 'Pahalı',
    counter_amount: 180,
    counter_currency: 'EUR',
  });
});
