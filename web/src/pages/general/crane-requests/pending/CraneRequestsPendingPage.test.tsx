import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { CraneRequestsPendingPage } from './CraneRequestsPendingPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ben' } }) }));

const fetchMock = vi.mocked(authedFetch);

const PENDING = [
  {
    id: 21,
    request_number: 'VNC-021',
    status: 'submitted',
    requestor_full_name: 'Ali Veli',
    crane_type_name: '25 ton',
    job_no: 'J-100',
    pricing_option: 'up_to_8h',
    needed_date: '2026-11-10',
    estimated_cost: '2000',
    estimated_cost_currency: 'TRY',
    priority: 'critical',
  },
];
const ALL = [
  {
    id: 30,
    request_number: 'VNC-030',
    status: 'approved',
    approved_by: 7,
    requestor_username: 'ayse',
  },
  { id: 31, request_number: 'VNC-031', status: 'completed', approved_by: 7 },
  { id: 32, request_number: 'VNC-032', status: 'approved', approved_by: 9 },
  { id: 33, request_number: 'VNC-033', status: 'rejected', approved_by: 7 },
];

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

function routes(extra?: (path: string, method: string) => Promise<Response> | undefined) {
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    const custom = extra?.(path, method);
    if (custom) return custom;
    if (path === '/cranes/requests/pending_approval/')
      return json({ count: 1, next: null, previous: null, results: PENDING });
    if (path === '/cranes/requests/')
      return json({ count: 4, next: null, previous: null, results: ALL });
    return json({ detail: 'not mocked' }, 404);
  });
}

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/crane-requests/pending') {
  return renderWithProviders(
    <ModalsProvider>
      <CraneRequestsPendingPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  routes();
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists pending requests and the ones I approved', async () => {
  renderPage();
  expect(await screen.findByText('VNC-021')).toBeInTheDocument();
  expect(screen.getByText('Ali Veli')).toBeInTheDocument();
  // Approved/completed with approved_by = me only.
  expect(await screen.findByText('VNC-030')).toBeInTheDocument();
  expect(screen.getByText('VNC-031')).toBeInTheDocument();
  expect(screen.queryByText('VNC-032')).toBeNull();
  expect(screen.queryByText('VNC-033')).toBeNull();
  const all = calls().find((c) => c.url.pathname === '/cranes/requests/')!;
  expect(Object.fromEntries(all.url.searchParams)).toEqual({ page_size: '100' });
});

it('approves after the confirm', async () => {
  routes((path, method) =>
    method === 'POST' && path === '/cranes/requests/21/approve/' ? json({}) : undefined,
  );
  renderPage();
  await screen.findByText('VNC-021');
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  expect(
    await screen.findByText('Bu vinç talebini onaylamak istediğinizden emin misiniz?'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Vinç talebi onaylandı'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/cranes/requests/21/approve/');
  expect(post.body).toEqual({ comment: '' });
  await waitFor(() =>
    expect(
      calls().filter((c) => c.url.pathname === '/cranes/requests/pending_approval/').length,
    ).toBeGreaterThan(1),
  );
});

it('rejects from the ?request details with a trimmed comment', async () => {
  routes((path, method) => {
    if (path === '/cranes/requests/21/' && method === 'GET')
      return json({ ...PENDING[0], procurement_item_code: 'VNC-KIRA' });
    if (path === '/cranes/requests/21/reject/') return json({});
    return undefined;
  });
  renderPage('/general/crane-requests/pending?request=21');
  const details = await screen.findByRole('dialog', { name: /Vinç Talebi Detayları/ });
  expect(await within(details).findByText('VNC-KIRA')).toBeInTheDocument();

  fireEvent.click(within(details).getByRole('button', { name: 'Reddet' }));
  const dialog = await screen.findByRole('dialog', { name: 'Vinç Talebini Reddet' });
  fireEvent.change(within(dialog).getByLabelText(/Reddetme Gerekçesi/), {
    target: { value: '  Bütçe yok  ' },
  });
  expect(within(dialog).getByText('13/500 karakter')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Vinç talebi reddedildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/cranes/requests/21/reject/');
  expect(post.body).toEqual({ comment: 'Bütçe yok' });
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('request'));
});

it('shows the backend message when approve fails', async () => {
  routes((path, method) =>
    method === 'POST' && path === '/cranes/requests/21/approve/'
      ? json({ detail: 'Yetkiniz yok' }, 403)
      : undefined,
  );
  renderPage();
  await screen.findByText('VNC-021');
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Evet, Onayla' }));
  await waitFor(() =>
    expect(notify.error).toHaveBeenCalledWith('Talep onaylanırken hata oluştu: Yetkiniz yok'),
  );
});

it('does not crash on empty endpoints', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('Onay bekleyen vinç talebi bulunamadı.')).toBeInTheDocument();
  expect(screen.getByText('Onayladığınız vinç talebi bulunamadı.')).toBeInTheDocument();
});
