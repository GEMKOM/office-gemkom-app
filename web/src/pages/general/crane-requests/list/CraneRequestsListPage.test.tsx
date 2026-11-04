import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CraneRequestsListPage } from './CraneRequestsListPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ben' } }) }));

const fetchMock = vi.mocked(authedFetch);

const TYPES = [
  {
    id: 1,
    name: '25 ton',
    category: 'mobile_crane',
    category_label: 'Mobil Vinç',
    current_rate: {
      price_up_to_3h: '1000',
      price_up_to_8h: '2000',
      rigger_fee: '500',
      currency: 'TRY',
    },
  },
  {
    id: 2,
    name: '12 m',
    category: 'scissor_platform',
    category_label: 'Makaslı Platform',
    current_rate: { price_per_day: '800', transport_fee: '300', currency: 'TRY' },
  },
];

const ROWS = [
  {
    id: 11,
    request_number: 'VNC-011',
    status: 'submitted',
    requestor: 7,
    crane_type: 1,
    crane_type_name: '25 ton',
    job_no: 'J-100',
    pricing_option: 'up_to_8h',
    estimated_cost: '2000',
    estimated_cost_currency: 'TRY',
    priority: 'urgent',
    created_at: '2026-10-01T08:00:00Z',
  },
  {
    id: 12,
    request_number: 'VNC-012',
    status: 'approved',
    requestor: 8,
    crane_type: 1,
    crane_type_name: '25 ton',
    job_no: 'J-200',
    pricing_option: 'up_to_3h',
    needs_rigger: true,
    estimated_cost: '1500',
    estimated_cost_currency: 'TRY',
    priority: 'normal',
  },
  {
    id: 13,
    request_number: 'VNC-013',
    status: 'submitted',
    requestor: 8,
    pricing_option: 'daily',
    days: 2,
  },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

type Call = { url: URL; method: string; body: RequestInit['body'] };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: init?.body,
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/cranes/requests/');

let permissions = { can_complete: true, can_manage_prices: false };

function routes(
  extra?: (path: string, method: string, init?: RequestInit) => Promise<Response> | undefined,
) {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    const custom = extra?.(path, method, init);
    if (custom) return custom;
    if (path === '/cranes/requests/' && method === 'GET')
      return json({ count: 3, next: null, previous: null, results: ROWS });
    if (path === '/cranes/requests/my_permissions/') return json(permissions);
    if (path === '/cranes/crane-types/') return json(TYPES);
    if (path === '/projects/job-orders/dropdown/')
      return json([{ job_no: 'J-100', title: 'Tank' }]);
    if (path === '/users/dropdown/')
      return json([{ id: 8, username: 'ali', full_name: 'Ali Veli' }]);
    return json({ detail: 'not mocked' }, 404);
  });
}

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/crane-requests/list') {
  return renderWithProviders(
    <ModalsProvider>
      <CraneRequestsListPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  permissions = { can_complete: true, can_manage_prices: false };
  routes();
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const search = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');

it('lists the requests with the legacy default params', async () => {
  renderPage();
  expect(screen.getByText('Tüm Vinç Talepleri')).toBeInTheDocument();
  expect(await screen.findByText('VNC-011')).toBeInTheDocument();
  expect(screen.getByText('8 Saate Kadar')).toBeInTheDocument();
  expect(screen.getByText('3 Saate Kadar + Sapancı')).toBeInTheDocument();
  expect(screen.getByText('Günlük × 2')).toBeInTheDocument();
  expect(screen.getByText('2.000 TRY')).toBeInTheDocument();
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
    ordering: '-id',
  });
});

it('filters from the URL reach the request, and a pill writes the URL', async () => {
  renderPage('/general/crane-requests/list?priority=urgent&job_no=J-100&page=2');
  await screen.findByText('VNC-011');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '2',
    page_size: '20',
    ordering: '-id',
    priority: 'urgent',
    job_no: 'J-100',
  });

  const pill = screen
    .getAllByRole('button', { name: /^Durum/ })
    .find((b) => b.getAttribute('aria-haspopup'))!;
  fireEvent.click(pill);
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Onaylandı' }));
  await waitFor(() => expect(search().get('status')).toBe('approved'));
  expect(search().has('page')).toBe(false);
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('status')).toBe('approved'));
  expect(listCalls().at(-1)!.url.searchParams.get('page')).toBe('1');
});

it('shows complete only with can_complete, and cancel only on my submitted requests', async () => {
  renderPage();
  await screen.findByText('VNC-011');
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Tamamla (Fiili Değer Gir)' })).toHaveLength(1),
  );
  // Row 11 is mine and submitted; row 13 is someone else's.
  expect(screen.getAllByRole('button', { name: 'İptal Et' })).toHaveLength(1);
});

it('hides complete without the can_complete permission', async () => {
  permissions = { can_complete: false, can_manage_prices: false };
  renderPage();
  await screen.findByText('VNC-011');
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/cranes/requests/my_permissions/')).toBe(true),
  );
  expect(screen.queryByRole('button', { name: 'Tamamla (Fiili Değer Gir)' })).toBeNull();
});

it('cancels after the confirm', async () => {
  routes((path, method) =>
    method === 'POST' && path === '/cranes/requests/11/cancel/' ? json({}) : undefined,
  );
  renderPage();
  await screen.findByText('VNC-011');
  fireEvent.click(screen.getByRole('button', { name: 'İptal Et' }));
  expect(
    await screen.findByText(
      'VNC-011 numaralı vinç talebini iptal etmek istediğinizden emin misiniz?',
    ),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Vinç talebi iptal edildi'));
  expect(
    calls().some((c) => c.method === 'POST' && c.url.pathname === '/cranes/requests/11/cancel/'),
  ).toBe(true);
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

async function pick(dialog: HTMLElement, label: RegExp, option: string) {
  fireEvent.click(within(dialog).getByLabelText(label));
  // Mantine keeps every Select's options mounted; the open one may still count as hidden in jsdom.
  fireEvent.click(await screen.findByRole('option', { name: option, hidden: true }));
}

it('create validates, shows the estimate and posts the form data', async () => {
  routes((path, method) =>
    method === 'POST' && path === '/cranes/requests/'
      ? json({ id: 50, request_number: 'VNC-050' }, 201)
      : undefined,
  );
  renderPage();
  await screen.findByText('VNC-011');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Vinç Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Vinç Talebi' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  expect(await within(dialog).findByText('Lütfen bir ekipman seçin')).toBeInTheDocument();
  expect(within(dialog).getByText('Lütfen süre / fiyatlandırma seçin')).toBeInTheDocument();
  expect(within(dialog).getByText('Lütfen iş emri seçin')).toBeInTheDocument();
  expect(within(dialog).getByText('Lütfen ihtiyaç tarihini seçin')).toBeInTheDocument();

  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/cranes/crane-types/')).toBe(true),
  );
  await pick(dialog, /Ekipman/, 'Mobil Vinç · 25 ton');
  // First offered option is preselected; the rigger box shows for cranes with a rigger fee.
  const panel = within(dialog).getByTestId('crane-estimate-panel');
  await waitFor(() => expect(within(panel).getByText('1.000 TRY')).toBeInTheDocument());
  fireEvent.click(within(dialog).getByLabelText('İlave sapancı istiyorum'));
  expect(within(panel).getByText('1.500 TRY')).toBeInTheDocument();
  expect(within(dialog).queryByLabelText('Gün Sayısı')).toBeNull();

  await pick(dialog, /İş Emri/, 'J-100 - Tank');
  fireEvent.change(within(dialog).getByLabelText(/İhtiyaç Tarihi/), {
    target: { value: '2026-11-10' },
  });
  fireEvent.change(within(dialog).getByLabelText('Konum / Saha'), { target: { value: 'Saha 2' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Vinç talebi oluşturuldu: VNC-050'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.body).toBeInstanceOf(FormData);
  expect(Object.fromEntries((post.body as FormData).entries())).toEqual({
    crane_type: '1',
    pricing_option: 'up_to_3h',
    job_no: 'J-100',
    days: '1',
    needs_rigger: 'true',
    needed_date: '2026-11-10',
    location: 'Saha 2',
    priority: 'normal',
  });
});

it('opens the details from ?request and completes it with the suggested cost', async () => {
  const detail = {
    ...ROWS[1],
    can_complete: true,
    requestor_full_name: 'Ali Veli',
    approval: {
      stage_instances: [
        {
          order: 1,
          name: 'Bölüm Müdürü',
          is_complete: true,
          approved_count: 1,
          required_approvals: 1,
          approvers: [],
        },
      ],
    },
    files: [{ id: 1, file_name: 'uploads/plan.pdf', file_url: 'https://files.test/plan.pdf' }],
  };
  routes((path, method) => {
    if (path === '/cranes/requests/12/' && method === 'GET') return json(detail);
    if (path === '/cranes/requests/12/complete/') return json({});
    return undefined;
  });
  renderPage('/general/crane-requests/list?request=12');
  const details = await screen.findByRole('dialog', { name: /Vinç Talebi Detayları/ });
  expect(await within(details).findByText('Ali Veli')).toBeInTheDocument();
  expect(within(details).getByText('1. Bölüm Müdürü')).toBeInTheDocument();
  expect(within(details).getByRole('link', { name: 'plan.pdf' })).toHaveAttribute(
    'href',
    'https://files.test/plan.pdf',
  );

  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/cranes/crane-types/')).toBe(true),
  );
  fireEvent.click(within(details).getByRole('button', { name: 'Tamamla' }));
  const dialog = await screen.findByRole('dialog', { name: /Talebi Tamamla — VNC-012/ });
  // 3h request: prefilled 3 hours, 3h bracket + rigger.
  expect(within(dialog).getByLabelText('Fiili Saat')).toHaveValue(3);
  expect(within(dialog).getByLabelText(/Fiili Maliyet/)).toHaveValue(1500);

  // The cost follows the quantity until edited by hand.
  fireEvent.change(within(dialog).getByLabelText('Fiili Saat'), { target: { value: '6' } });
  expect(within(dialog).getByLabelText(/Fiili Maliyet/)).toHaveValue(2500);
  expect(within(dialog).getByTestId('actual-cost-suggestion')).toHaveTextContent(
    '8 saate kadar tarifesi + sapancı',
  );

  fireEvent.click(within(dialog).getByRole('button', { name: 'Tamamla ve Maliyeti İşle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Talep tamamlandı; maliyet iş emrine işlendi'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/cranes/requests/12/complete/');
  expect(JSON.parse(String(post.body))).toEqual({
    actual_quantity: '6',
    actual_cost: '2500',
    actual_cost_currency: 'TRY',
  });
  await waitFor(() => expect(search().has('request')).toBe(false));
});

it('does not crash on empty endpoints', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('Vinç talebi bulunamadı.')).toBeInTheDocument();
});
