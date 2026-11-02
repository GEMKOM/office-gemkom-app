import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { MaterialTrackingPage } from './MaterialTrackingPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const auth = { user: { id: 7, username: 'planlama' }, isAdmin: false };
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const fetchMock = vi.mocked(authedFetch);

const ITEMS = [
  {
    id: 1,
    item_code: 'STK-001',
    item_name: 'Sac 10mm',
    planning_request_number: 'PLR-12',
    job_no: '254-01',
    quantity: '900.00',
    item_unit: 'kg',
    is_delivered: true,
    delivered_quantity: '900.00',
    pulled_quantity: '600.00',
    quantity_available_to_pull: '300.00',
    is_critical: false,
    pull_requests: [
      {
        id: 55,
        number: 'MPR-2026-0055',
        status: 'pending',
        status_label: 'Beklemede',
        destination_name: 'Usta Kaynak',
        quantity: '600.00',
      },
    ],
  },
  {
    id: 2,
    item_code: 'STK-002',
    item_name: 'Profil',
    job_no: '254-02',
    quantity: '10.00',
    item_unit: 'adet',
    is_delivered: false,
    delivered_quantity: '0',
    pulled_quantity: '0',
    quantity_available_to_pull: '0',
    is_critical: true,
    pull_requests: [],
  },
];

const PULL_REQUEST = {
  id: 55,
  number: 'MPR-2026-0055',
  status: 'pending',
  status_label: 'Beklemede',
  destination_type: 'subcontractor',
  destination_name: 'Usta Kaynak',
  requested_by: 7,
  requested_by_name: 'Plan Lama',
  requested_at: '2026-10-20T08:00:00Z',
  note: '',
  items: [
    {
      id: 1,
      item_code: 'STK-001',
      item_name: 'Sac 10mm',
      job_no: '254-01',
      quantity: '600.00',
      item_unit: 'kg',
      is_delivered: true,
    },
  ],
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
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/planning/items/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/material-tracking') {
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
    if (method === 'GET' && path === '/planning/items/') {
      return json({ count: 2, next: null, previous: null, results: ITEMS });
    }
    if (method === 'GET' && path === '/subcontracting/subcontractors/') {
      return json([
        { id: 5, name: 'Usta Kaynak', is_active: true },
        { id: 6, name: 'Eski Firma', is_active: false },
      ]);
    }
    if (method === 'GET' && path === '/teams/') return json([{ id: 9, name: 'Ekip A' }]);
    if (method === 'GET' && path === '/warehouse/pull-requests/55/') return json(PULL_REQUEST);
    if (method === 'POST' && path === '/warehouse/pull-requests/')
      return json({ id: 56, number: 'MPR-2026-0056' }, 201);
    if (method === 'POST' && path === '/warehouse/pull-requests/55/cancel/')
      return json({ ...PULL_REQUEST, status: 'cancelled' });
    if (method === 'POST' && path.endsWith('/mark_critical/'))
      return json({ id: 1, is_critical: true });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the items with the warehouse ledger and sends the legacy list params', async () => {
  renderPage();
  expect(screen.getByText('Planlama Kalemleri')).toBeInTheDocument();
  expect(await screen.findByText('STK-001')).toBeInTheDocument();
  expect(screen.getByText('Profil')).toBeInTheDocument();
  // Ledger and the pull request chip.
  expect(screen.getByText(/kalan 300 kg/)).toBeInTheDocument();
  expect(screen.getByText('Usta Kaynak · 600 kg')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    include_price: 'false',
    ordering: '-id',
    page: '1',
    page_size: '20',
  });
});

it('the Teslim pill sends the partial delivery params and writes the URL', async () => {
  renderPage();
  await screen.findByText('STK-001');

  fireEvent.click(screen.getByRole('button', { name: /Teslim/ }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Kısmi Teslim' }));

  await waitFor(() => expect(listCalls()).toHaveLength(2));
  const params = Object.fromEntries(listCalls()[1]!.url.searchParams);
  expect(params).toMatchObject({
    is_delivered: 'false',
    partially_delivered: 'true',
    ordering: '-id',
  });
  expect(screen.getByTestId('location').textContent).toContain('is_delivered=partial');
});

it('the Kritik checkbox posts mark_critical without reloading the list', async () => {
  renderPage();
  await screen.findByText('STK-001');

  const box = screen.getByRole('checkbox', { name: 'Kritik: STK-001' });
  expect(box).not.toBeChecked();
  fireEvent.click(box);

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Kalem kritik olarak işaretlendi — imalat öngörüsü bu teslimatı bekleyecek',
    ),
  );
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/planning/items/1/mark_critical/',
  );
  expect(screen.getByRole('checkbox', { name: 'Kritik: STK-001' })).toBeChecked();
  expect(listCalls()).toHaveLength(1);
});

it('a failed critical toggle goes back and shows the backend message', async () => {
  fetchMock.mockImplementation((_url, init) =>
    init?.method === 'POST'
      ? json({ detail: 'Yetkiniz yok' }, 403)
      : json({ count: 2, next: null, previous: null, results: ITEMS }),
  );
  renderPage();
  await screen.findByText('STK-002');
  const box = screen.getByRole('checkbox', { name: 'Kritik: STK-002' });
  expect(box).toBeChecked();
  fireEvent.click(box);
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Yetkiniz yok'));
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/planning/items/2/unmark_critical/',
  );
  await waitFor(() =>
    expect(screen.getByRole('checkbox', { name: 'Kritik: STK-002' })).toBeChecked(),
  );
});

it('selects pullable lines and creates a pull request for a subcontractor', async () => {
  renderPage();
  await screen.findByText('STK-001');

  const rowChecks = screen.getAllByRole('checkbox', { name: 'Satırı seç' });
  // Nothing left in the warehouse: not selectable.
  expect(rowChecks[1]).toBeDisabled();
  fireEvent.click(rowChecks[0]!);
  expect(await screen.findByText('1 kalem seçildi')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Depodan Çekme Talebi Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Depodan Çekme Talebi Oluştur' });
  expect(within(dialog).getByText('Kalemler (1)')).toBeInTheDocument();
  const qty = within(dialog).getByLabelText('Miktar: STK-001');
  // Preset to what is still in the warehouse.
  expect(qty).toHaveValue('300');

  // No destination yet: the dropdown is required.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();

  // More than is left is refused before the request.
  fireEvent.change(qty, { target: { value: '450' } });
  fireEvent.click(within(dialog).getByPlaceholderText('Taşeron seçin...'));
  // Inactive subcontractors are left out.
  const option = await screen.findByRole('option', { name: 'Usta Kaynak', hidden: true });
  expect(screen.queryByRole('option', { name: 'Eski Firma', hidden: true })).toBeNull();
  fireEvent.click(option);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));
  expect(await within(dialog).findByText('En fazla 300 çekilebilir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(qty, { target: { value: '250' } });
  fireEvent.change(within(dialog).getByLabelText('Not (opsiyonel)'), {
    target: { value: ' Acil ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));

  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Malzeme çekme talebi oluşturuldu: MPR-2026-0056'),
  );
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/warehouse/pull-requests/');
  expect(post.body).toEqual({
    note: 'Acil',
    items: [{ planning_item: 1, quantity: 250 }],
    subcontractor: 5,
  });
  // The selection is cleared and the list reloaded.
  await waitFor(() => expect(screen.queryByText('1 kalem seçildi')).toBeNull());
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('a team destination posts team instead of subcontractor', async () => {
  renderPage();
  await screen.findByText('STK-001');
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Satırı seç' })[0]!);
  fireEvent.click(await screen.findByRole('button', { name: 'Depodan Çekme Talebi Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Depodan Çekme Talebi Oluştur' });

  fireEvent.click(within(dialog).getByRole('radio', { name: 'Kaynak Ekibi' }));
  fireEvent.click(within(dialog).getByPlaceholderText('Ekip seçin...'));
  fireEvent.click(await screen.findByRole('option', { name: 'Ekip A', hidden: true }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Talep Gönder' }));

  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  expect(calls().find((c) => c.method === 'POST')!.body).toEqual({
    note: '',
    items: [{ planning_item: 1, quantity: 300 }],
    team: 9,
  });
});

it('a pull request chip opens the detail; its requester may cancel it after the confirm', async () => {
  renderPage();
  await screen.findByText('STK-001');

  fireEvent.click(screen.getByText('Usta Kaynak · 600 kg'));
  const dialog = await screen.findByRole('dialog', { name: 'Depo Çekme Talebi — MPR-2026-0055' });
  expect(within(dialog).getByText('Plan Lama', { exact: false })).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Talebi İptal Et' }));
  expect(
    await screen.findByText(
      'MPR-2026-0055 numaralı depo çekme talebini iptal etmek istediğinize emin misiniz?',
    ),
  ).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Depo çekme talebi iptal edildi'),
  );
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/warehouse/pull-requests/55/cancel/',
  );
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('someone else cannot cancel a request they did not make', async () => {
  auth.user = { id: 99, username: 'baska' };
  try {
    renderPage();
    await screen.findByText('STK-001');
    fireEvent.click(screen.getByText('Usta Kaynak · 600 kg'));
    const dialog = await screen.findByRole('dialog', { name: 'Depo Çekme Talebi — MPR-2026-0055' });
    expect(within(dialog).queryByRole('button', { name: 'Talebi İptal Et' })).toBeNull();
  } finally {
    auth.user = { id: 7, username: 'planlama' };
  }
});
