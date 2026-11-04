import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { OvertimePendingPage } from './OvertimePendingPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 7, username: 'onayci' } }),
}));

const fetchMock = vi.mocked(authedFetch);
// Mantine modals and selects are slow in jsdom when the suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

const STAGE = {
  name: 'Takım Lideri',
  is_complete: false,
  is_rejected: false,
  required_approvals: 1,
  approved_count: 0,
  approvers: [{ id: 7, full_name: 'Onay Veren' }],
  approver_user_ids: [7],
  decisions: [],
};

const PENDING = {
  id: 501,
  requester: 3,
  requester_username: 'ahmet',
  team_label: 'Kaynaklı İmalat',
  start_at: '2026-11-10T15:00:00Z',
  end_at: '2026-11-10T18:30:00Z',
  duration_hours: '3.5',
  total_users: 2,
  status: 'submitted',
  status_label: 'Bekliyor',
  approval: { stage_instances: [STAGE] },
  entries: [
    { id: 11, user_full_name: 'Ali Kaya', job_no: '270-01', status: 'pending' },
    { id: 12, user_full_name: 'Veli Can', job_no: '270-02', status: 'pending' },
  ],
};

const DECIDED = {
  id: 400,
  requester_username: 'mehmet',
  team_label: 'Talaşlı İmalat',
  start_at: '2026-10-01T15:00:00Z',
  end_at: '2026-10-01T17:00:00Z',
  duration_hours: 2,
  total_users: 1,
  status: 'approved',
  status_label: 'Onaylandı',
  created_at: '2026-09-30T08:00:00Z',
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

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/overtime/pending') {
  return renderWithProviders(
    <ModalsProvider>
      <OvertimePendingPage />
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
    if (method === 'GET' && path === '/overtime/requests/pending_approval/') {
      return json({ count: 1, next: null, previous: null, results: [PENDING] });
    }
    if (method === 'GET' && path === '/overtime/requests/decision_by_me/') {
      return json({ count: 1, next: null, previous: null, results: [DECIDED] });
    }
    if (method === 'GET' && path === '/overtime/requests/501/') return json(PENDING);
    if (method === 'GET' && path === '/overtime/requests/501/cost_impact/')
      return json({ detail: 'yok' }, 403);
    if (method === 'POST') return json({ detail: 'ok' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists the pending and the decided requests with the approval stage', async () => {
  renderPage();
  expect(await screen.findByText('ahmet')).toBeInTheDocument();
  expect(screen.getByText('mehmet')).toBeInTheDocument();
  expect(screen.getByText('3 saat 30 dakika')).toBeInTheDocument();
  expect(screen.getByText('Takım Lideri')).toBeInTheDocument();
  expect(screen.getByText(/1 onay bekleniyor/)).toBeInTheDocument();
  expect(screen.getByText('2 kişi')).toBeInTheDocument();

  const pendingCall = calls().find(
    (c) => c.url.pathname === '/overtime/requests/pending_approval/',
  );
  expect(Object.fromEntries(pendingCall!.url.searchParams)).toEqual({ page: '1', page_size: '20' });
});

it('a ?request= deep link opens the details; a partial approve sends the unticked entries', async () => {
  renderPage('/general/overtime/pending?request=501');
  const dialog = await screen.findByRole('dialog', { name: 'Mesai Talebi Detayları' });
  expect(await within(dialog).findByText('Ali Kaya')).toBeInTheDocument();
  // Cost impact 403 -> no cost section.
  expect(within(dialog).queryByText('Maliyet / Kâr Etkisi')).not.toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Veli Can onayla' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));

  const confirmDialog = await screen.findByRole('dialog', { name: 'Mesai Talebi Onayı' });
  fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Evet, Onayla' }));

  await waitFor(() => expect(posts('/overtime/requests/501/approve/')).toHaveLength(1));
  expect(posts('/overtime/requests/501/approve/')[0]!.body).toEqual({ rejected_entry_ids: [12] });
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith(
      'Mesai talebi kısmi olarak onaylandı (1 kalem reddedildi)',
    ),
  );
  // The modal closes and the deep link leaves the URL.
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(''));
});

it('unticking every entry asks for Reddet instead', async () => {
  renderPage('/general/overtime/pending?request=501');
  const dialog = await screen.findByRole('dialog', { name: 'Mesai Talebi Detayları' });
  fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Ali Kaya onayla' }));
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Veli Can onayla' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));
  expect(notify.warning).toHaveBeenCalledWith(
    'Tüm kalemleri reddediyorsunuz. Bunun yerine "Reddet" kullanın.',
  );
  expect(posts('/overtime/requests/501/approve/')).toHaveLength(0);
});

it('rejecting from the row posts the comment and refreshes the lists and the hub count', async () => {
  const { queryClient } = renderPage();
  await screen.findByText('ahmet');
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mesai Talebini Reddet' });
  fireEvent.change(within(dialog).getByLabelText(/Reddetme Gerekçesi/), {
    target: { value: 'Bütçe yok ' },
  });
  expect(within(dialog).getByText('10/500 karakter')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));

  await waitFor(() => expect(posts('/overtime/requests/501/reject/')).toHaveLength(1));
  expect(posts('/overtime/requests/501/reject/')[0]!.body).toEqual({ comment: 'Bütçe yok' });
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Mesai talebi başarıyla reddedildi'),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['overtime'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pendingApprovals', 'overtime', 'count'] });
});

it('survives empty responses', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('Onay bekleyen mesai talebi bulunamadı.')).toBeInTheDocument();
  expect(screen.getByText('Onayladığınız mesai talebi bulunamadı.')).toBeInTheDocument();
});
