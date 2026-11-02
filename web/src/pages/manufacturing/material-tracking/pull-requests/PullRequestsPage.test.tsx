import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PullRequestsPage } from './PullRequestsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const auth = { user: { id: 7, username: 'planlama' }, isAdmin: false };
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const fetchMock = vi.mocked(authedFetch);

const REQUESTS = [
  {
    id: 55,
    number: 'MPR-2026-0055',
    status: 'pending',
    status_label: 'Beklemede',
    destination_type: 'subcontractor',
    destination_name: 'Usta Kaynak',
    item_count: 2,
    job_nos: ['254-01', '254-02'],
    requested_by: 7,
    requested_by_name: 'Plan Lama',
    requested_at: '2026-10-20T08:00:00Z',
    note: 'Sabah teslim edilsin',
  },
  {
    id: 56,
    number: 'MPR-2026-0056',
    status: 'pending',
    status_label: 'Beklemede',
    destination_type: 'team',
    destination_name: 'Ekip A',
    item_count: 1,
    job_nos: [],
    requested_by: 99,
    requested_by_name: 'Başka Biri',
    requested_at: '2026-10-21T08:00:00Z',
  },
];

const DETAIL = {
  ...REQUESTS[0],
  items: [
    {
      id: 1,
      item_code: 'STK-001',
      item_name: 'Sac 10mm',
      job_no: '254-01',
      quantity: '600.00',
      item_unit: 'kg',
      is_delivered: false,
      delivered_quantity: '900.00',
      planning_quantity: '1200.00',
      pulled_quantity: '600.00',
      quantity_available_to_pull: '300.00',
    },
  ],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

type Call = { url: URL; method: string };
function calls(): Call[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
  }));
}
const listCalls = () =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/warehouse/pull-requests/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/manufacturing/material-tracking/pull-requests') {
  return renderWithProviders(
    <ModalsProvider>
      <PullRequestsPage />
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
    if (method === 'GET' && path === '/warehouse/pull-requests/') {
      return json({ count: 2, next: null, previous: null, results: REQUESTS });
    }
    if (method === 'GET' && path === '/warehouse/pull-requests/55/') return json(DETAIL);
    if (method === 'POST' && path.endsWith('/cancel/'))
      return json({ ...REQUESTS[0], status: 'cancelled' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the requests and sends the legacy default params', async () => {
  renderPage();
  expect(screen.getByText('Depo Çekme Talepleri')).toBeInTheDocument();
  expect(await screen.findByText('MPR-2026-0055')).toBeInTheDocument();
  expect(screen.getByText('Usta Kaynak')).toBeInTheDocument();
  expect(screen.getByText('254-02')).toBeInTheDocument();
  expect(screen.getByText('Sabah teslim edilsin')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    ordering: '-requested_at',
    page: '1',
    page_size: '20',
  });
});

it('?talep= and ?status= deep links fill the filters, as legacy applyUrlParams did', async () => {
  renderPage('/manufacturing/material-tracking/pull-requests?talep=MPR-2026-0055&status=pending');
  await screen.findByText('MPR-2026-0055');
  expect(screen.getByLabelText('Arama')).toHaveValue('MPR-2026-0055');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toMatchObject({
    search: 'MPR-2026-0055',
    status: 'pending',
  });
});

it('"Sadece benim taleplerim" filters by the signed-in user', async () => {
  renderPage();
  await screen.findByText('MPR-2026-0055');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sadece benim taleplerim' }));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(listCalls()[1]!.url.searchParams.get('requested_by')).toBe('7');
  expect(screen.getByTestId('location').textContent).toContain('mine=true');
});

it('offers İptal only on pending requests the user made, unless admin', async () => {
  const { unmount } = renderPage();
  await screen.findByText('MPR-2026-0055');
  expect(screen.getAllByRole('button', { name: 'İptal' })).toHaveLength(1);
  unmount();

  auth.isAdmin = true;
  renderPage();
  await screen.findByText('MPR-2026-0055');
  expect(screen.getAllByRole('button', { name: 'İptal' })).toHaveLength(2);
});

it('cancels a request only after the confirm', async () => {
  renderPage();
  await screen.findByText('MPR-2026-0055');

  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
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

it('Vazgeç cancels nothing', async () => {
  renderPage();
  await screen.findByText('MPR-2026-0055');
  fireEvent.click(screen.getByRole('button', { name: 'İptal' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }));
  await waitFor(() =>
    expect(screen.queryByText(/numaralı depo çekme talebini iptal etmek/)).toBeNull(),
  );
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
});

it('Detay shows the lines with the warehouse ledger', async () => {
  renderPage();
  await screen.findByText('MPR-2026-0055');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);

  const dialog = await screen.findByRole('dialog', { name: 'Depo Çekme Talebi — MPR-2026-0055' });
  expect(within(dialog).getByText('Kalemler (1)')).toBeInTheDocument();
  expect(within(dialog).getByText('STK-001')).toBeInTheDocument();
  expect(within(dialog).getByText('600 kg')).toBeInTheDocument();
  // Partial delivery: 900 of the 1200 planned arrived.
  expect(within(dialog).getByText('Kısmi 900 / 1.200 kg')).toBeInTheDocument();
  expect(within(dialog).getByText('300')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: "Excel'e Aktar" })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Talebi İptal Et' })).toBeInTheDocument();
});
