import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { FasonPage, ProcurementFasonPage, WarehouseFasonPage } from './FasonPage';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  hasPerm: () => true,
  isAdmin: () => false,
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const JOB = {
  id: 5,
  department_request: {
    id: 9,
    number: 'DR-2026-0042',
    title: '304-02 BÜKÜM TALEBİ',
    status: 'transferred',
    status_label: 'Satın Almaya Aktarıldı',
    priority: 'normal',
    department: 'imalat',
    requestor: 'Ali Usta',
    created_at: '2026-11-19T08:00:00Z',
    needed_date: '2026-11-25',
  },
  operations: ['BÜKÜM'],
  job_nos: ['304-02'],
  purchase_step: 'ordered',
  purchase_label: 'Sipariş verildi',
  material_step: 'received',
  material_label: 'Depoda, gönderime hazır',
  suppliers: ['Sezgin Metal'],
  material_note: 'P-26 × 2',
  discussion_topic_id: null,
  awaiting_approval: false,
  can_hand_over: false,
  can_receive: false,
  can_send: true,
  created_at: '2026-11-19T08:00:00Z',
};

const DETAIL = {
  ...JOB,
  rows: [
    {
      item_code: 'F001',
      item_name: 'BÜKÜM',
      quantity: 2,
      unit: 'adet',
      job_no: '304-02',
      description: 'P-26',
    },
  ],
  lines: [
    {
      id: 1,
      planning_request: 'GS-10367',
      item_code: 'F001',
      item_name: 'BÜKÜM İŞLEMİ',
      description: 'P-26',
      job_no: '304-02',
      quantity: '2.00',
      delivered_quantity: '0.00',
      pulled_quantity: '0.00',
      purchase_step: 'ordered',
      purchase_label: 'Sipariş verildi',
      orders: [{ id: 77, supplier: 'Sezgin Metal' }],
    },
  ],
  unsent_orders: [{ id: 77, supplier: 'Sezgin Metal', lines: 1 }],
  shipments: [],
  steps: {
    handed_over: { at: '2026-11-19T09:00:00Z', by: 'Ali Usta' },
    received: { at: '2026-11-19T10:00:00Z', by: 'Depo' },
  },
};

const BUKUM = { id: 3, code: 'F001 0000 0000 000 000', name: 'BÜKÜM İŞLEMİ', unit: 'ADET' };
const GALVANIZ = { id: 4, code: 'F026 0000 0000 000 000', name: 'GALVANİZ KAPLAMA İŞLEMİ' };

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
  }));

// Mantine's combobox scrolls the active option into view; jsdom has no scrollIntoView.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === 'POST' && path === '/fason/jobs/5/send/')
      return json({
        ...DETAIL,
        material_step: 'sent',
        material_label: 'Fasonda',
        can_send: false,
        unsent_orders: [],
        shipments: [
          {
            id: 1,
            supplier: 'Sezgin Metal',
            purchase_order: 77,
            irsaliye_no: 'IRS-9',
            note: '',
            sent_at: '2026-11-19T12:00:00Z',
            sent_by: 'Depo',
          },
        ],
      });
    if (path === '/fason/jobs/5/') return json(DETAIL);
    if (path === '/fason/jobs/') return json({ count: 1, results: [JOB] });
    if (path === '/procurement/items/') return json({ count: 2, results: [BUKUM, GALVANIZ] });
    if (path === '/projects/job-orders/dropdown/')
      return json([
        { job_no: '304-02', title: 'Kazan' },
        { job_no: '305-01', title: 'Tank' },
      ]);
    if (init?.method === 'POST' && path === '/planning/department-requests/')
      return json({ id: 9, request_number: 'DR-2026-0042', fason_job_id: 5 }, 201);
    return json({});
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => vi.restoreAllMocks());

it('lists the jobs with purchasing and material side by side, by tab', async () => {
  renderWithProviders(<FasonPage />, { route: '/general/fason' });
  expect(await screen.findByText('DR-2026-0042')).toBeInTheDocument();
  expect(screen.getByText('Sipariş verildi')).toBeInTheDocument();
  expect(screen.getByText('Depoda, gönderime hazır')).toBeInTheDocument();
  expect(calls()[0]!.url.searchParams.get('tab')).toBe('open');
  fireEvent.click(screen.getByText('Fasonda'));
  await waitFor(() =>
    expect(calls().some((c) => c.url.searchParams.get('tab') === 'at_supplier')).toBe(true),
  );
});

it('opens a job and sends its material to the order’s supplier', async () => {
  renderWithProviders(<FasonPage />, { route: '/general/fason?job=5' });
  const dialog = await screen.findByRole('dialog', { name: /Fason · DR-2026-0042/ });
  expect(await within(dialog).findByText('P-26 × 2')).toBeInTheDocument();
  // One warehouse step: taken in is ready to send (no separate "Hazırlandı").
  expect(within(dialog).getByText('Depo teslim aldı (gönderime hazır)')).toBeInTheDocument();
  expect(within(dialog).queryByText('Depo hazırladı')).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Hazırlandı' })).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Tedarikçiye Gönder' }));
  const send = await screen.findByRole('dialog', { name: 'Tedarikçiye Gönder' });
  fireEvent.change(within(send).getByLabelText('İrsaliye No'), { target: { value: 'IRS-9' } });
  fireEvent.click(within(send).getByRole('button', { name: 'Gönder' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Malzeme gönderildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/fason/jobs/5/send/');
  expect(post.body).toEqual({ purchase_order: 77, irsaliye_no: 'IRS-9', note: '' });
  expect(
    await within(dialog).findByText(/Gönderildi → Sezgin Metal \(İrsaliye IRS-9\)/),
  ).toBeInTheDocument();
});

it('is the warehouse’s Fason Sevkiyatı: its own tabs, one Teslim Al step, no new request', async () => {
  fetchMock.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    const waiting = {
      ...DETAIL,
      material_step: 'handed_over',
      material_label: 'Depoya teslim edildi',
      can_receive: true,
      can_send: false,
      steps: { handed_over: DETAIL.steps.handed_over, received: { at: null, by: null } },
    };
    if (init?.method === 'POST' && path === '/fason/jobs/5/receive/')
      return json({ ...DETAIL, can_send: false, unsent_orders: [] });
    if (path === '/fason/jobs/5/') return json(waiting);
    if (path === '/fason/jobs/') return json({ count: 1, results: [waiting] });
    return json({});
  });
  renderWithProviders(<WarehouseFasonPage />, { route: '/warehouse/fason?job=5' });
  expect(screen.getByRole('heading', { level: 1, name: 'Fason Sevkiyatı' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Yeni Fason Talebi' })).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      calls()
        .find((c) => c.url.pathname === '/fason/jobs/')
        ?.url.searchParams.get('tab'),
    ).toBe('to_receive'),
  );
  expect(screen.getByText('Gönderilecek')).toBeInTheDocument();

  const dialog = await screen.findByRole('dialog', { name: /Fason · DR-2026-0042/ });
  fireEvent.click(await within(dialog).findByRole('button', { name: 'Teslim Al' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Malzeme teslim alındı; gönderime hazır'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/fason/jobs/5/receive/');
});

it('is procurement’s Fason Takibi, where procurement may mark the material sent', async () => {
  renderWithProviders(<ProcurementFasonPage />, { route: '/procurement/fason?job=5' });
  expect(screen.getByRole('heading', { level: 1, name: 'Fason Takibi' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Yeni Fason Talebi' })).not.toBeInTheDocument();
  const dialog = await screen.findByRole('dialog', { name: /Fason · DR-2026-0042/ });
  expect(
    await within(dialog).findByRole('button', { name: 'Tedarikçiye Gönder' }),
  ).toBeInTheDocument();
  expect(
    calls()
      .find((c) => c.url.pathname === '/fason/jobs/')!
      .url.searchParams.get('tab'),
  ).toBe('open');
});

it('says a job waiting for department approval takes no material step yet', async () => {
  fetchMock.mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    const waiting = {
      ...DETAIL,
      department_request: { ...DETAIL.department_request, status: 'submitted' },
      purchase_step: 'request',
      purchase_label: 'Departman onayı bekleniyor',
      material_step: 'waiting',
      material_label: 'Malzeme bekleniyor',
      awaiting_approval: true,
      can_hand_over: false,
      can_send: false,
      lines: [],
      unsent_orders: [],
      steps: { handed_over: { at: null, by: null }, received: { at: null, by: null } },
    };
    if (path === '/fason/jobs/5/') return json(waiting);
    if (path === '/fason/jobs/') return json({ count: 1, results: [waiting] });
    return json({});
  });
  renderWithProviders(<FasonPage />, { route: '/general/fason?job=5' });
  const dialog = await screen.findByRole('dialog', { name: /Fason · DR-2026-0042/ });
  expect(
    await within(dialog).findByText(/Departman onayı bekleniyor\. Malzeme onaydan sonra/),
  ).toBeInTheDocument();
  expect(
    within(dialog).queryByRole('button', { name: 'Depoya Teslim Et' }),
  ).not.toBeInTheDocument();
});

it('is Fason Talepleri and opens a fason request: one operation, its parts, submitted for approval', async () => {
  renderWithProviders(<FasonPage />, { route: '/general/fason' });
  expect(screen.getByRole('heading', { level: 1, name: 'Fason Talepleri' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Fason Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Fason Talebi' });

  // Only the workshop-route operations are offered.
  await waitFor(() =>
    expect(
      calls()
        .find((c) => c.url.pathname === '/procurement/items/')
        ?.url.searchParams.get('fason_route'),
    ).toBe('workshop'),
  );
  const items = calls().find((c) => c.url.pathname === '/procurement/items/')!.url.searchParams;
  expect(items.get('is_active')).toBe('true');

  // Nothing is sent without an operation, a described part and its job.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));
  expect(await within(dialog).findByText('İşlem seçin')).toBeInTheDocument();
  expect(within(dialog).getByText('Bu alan gereklidir')).toBeInTheDocument();
  // Every part is for a job.
  expect(within(dialog).getByText('İş no gerekli')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('combobox', { name: /^İşlem/ }));
  fireEvent.click(await screen.findByRole('option', { name: 'BÜKÜM İŞLEMİ', hidden: true }));
  fireEvent.change(within(dialog).getByLabelText('Parça 1'), { target: { value: 'P-26' } });
  fireEvent.change(within(dialog).getByLabelText('Adet 1'), { target: { value: '4' } });
  fireEvent.click(within(dialog).getByRole('combobox', { name: 'İş No 1' }));
  fireEvent.click(await screen.findByRole('option', { name: '304-02 - Kazan', hidden: true }));

  // A second part, then a third one removed again.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Parça Ekle' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Parça Ekle' }));
  expect(within(dialog).getAllByTestId('fason-part-row')).toHaveLength(3);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Parçayı kaldır 3' }));
  expect(within(dialog).getAllByTestId('fason-part-row')).toHaveLength(2);
  fireEvent.change(within(dialog).getByLabelText('Parça 2'), { target: { value: 'P-40 kapak' } });
  fireEvent.change(within(dialog).getByLabelText('İhtiyaç Tarihi'), {
    target: { value: '2026-12-01' },
  });
  fireEvent.change(within(dialog).getByLabelText(/^Not/), { target: { value: 'Kenarlar 90°' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Oluştur' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Fason talebi oluşturuldu; departman onayına gönderildi',
    ),
  );
  // The same department-request endpoint as Departman Talepleri.
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/planning/department-requests/');
  const body = post.body as FormData;
  expect(body.get('title')).toBe('BÜKÜM İŞLEMİ · 304-02');
  expect(body.get('description')).toBe('Kenarlar 90°');
  expect(body.get('needed_date')).toBe('2026-12-01');
  expect(body.get('priority')).toBe('normal');
  const card = { item_id: 3, item_code: BUKUM.code, item_name: 'BÜKÜM İŞLEMİ', item_unit: 'adet' };
  expect(JSON.parse(String(body.get('items')))).toEqual([
    { ...card, job_no: '304-02', quantity: 4, item_description: 'P-26', item_specifications: null },
    // The next part keeps the job of the one before.
    {
      ...card,
      job_no: '304-02',
      quantity: 1,
      item_description: 'P-40 kapak',
      item_specifications: null,
    },
  ]);
  // The new request's fason job opens.
  expect(await screen.findByRole('dialog', { name: /Fason · DR-2026-0042/ })).toBeInTheDocument();
});
