import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { OvertimeRegistryPage } from './OvertimeRegistryPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 3, username: 'ahmet' } }) }));

const fetchMock = vi.mocked(authedFetch);
// Mantine modals and selects are slow in jsdom when the suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

const MINE_SUBMITTED = {
  id: 10,
  requester: 3,
  requester_username: 'ahmet',
  start_at: '2026-11-10T15:00:00Z',
  end_at: '2026-11-10T17:00:00Z',
  duration_hours: 2,
  total_users: 1,
  status: 'submitted',
  status_label: 'Bekliyor',
  created_at: '2026-11-01T08:00:00Z',
  approval: {
    stage_instances: [
      { name: 'Müdür', approver_user_ids: [9], required_approvals: 1, approved_count: 0 },
    ],
  },
  entries: [{ id: 1, user_id: 5, user_full_name: 'Ali Kaya', job_no: '270-01', status: 'pending' }],
};
const MINE_REJECTED = {
  ...MINE_SUBMITTED,
  id: 11,
  status: 'rejected',
  status_label: 'Reddedildi',
  duration_hours: 1.5,
  reason: 'Sevkiyat',
};
const OTHERS_SUBMITTED = { ...MINE_SUBMITTED, id: 12, requester: 4, requester_username: 'mehmet' };

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
  calls().filter((c) => c.method === 'GET' && c.url.pathname === '/overtime/requests/');

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/overtime/registry') {
  return renderWithProviders(
    <ModalsProvider>
      <OvertimeRegistryPage />
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
    if (method === 'GET' && path === '/overtime/requests/') {
      return json({
        count: 57,
        next: null,
        previous: null,
        results: [MINE_SUBMITTED, MINE_REJECTED, OTHERS_SUBMITTED],
      });
    }
    if (method === 'GET' && path === '/overtime/requests/12/') return json(OTHERS_SUBMITTED);
    if (method === 'GET' && path === '/overtime/requests/11/') return json(MINE_REJECTED);
    if (method === 'GET' && path.endsWith('/cost_impact/')) return json({ detail: 'yok' }, 403);
    if (method === 'GET' && path === '/users/dropdown/') {
      return json([
        { id: 5, username: 'ali', first_name: 'Ali', last_name: 'Kaya' },
        { id: 6, username: 'veli', first_name: 'Veli', last_name: 'Can' },
      ]);
    }
    if (method === 'GET' && path === '/projects/job-orders/dropdown/') {
      return json([{ job_no: '270-01', title: 'Kazan' }]);
    }
    if (method === 'GET' && path === '/overtime/requests/machining_operators/') return json([]);
    if (method === 'POST' || method === 'PATCH') return json({ id: 99 }, 201);
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the rows, the figures and the owner-only actions', async () => {
  renderPage();
  expect(await screen.findByText('mehmet')).toBeInTheDocument();
  expect(within(document.getElementById('total-requests')!).getByText('57')).toBeInTheDocument();
  expect(within(document.getElementById('pending-requests')!).getByText('2')).toBeInTheDocument();
  expect(
    within(document.getElementById('total-hours')!).getByText('5 saat 30 dakika'),
  ).toBeInTheDocument();

  // İptal Et only on my submitted request, Düzenle & Gönder only on my rejected one.
  expect(screen.getAllByRole('button', { name: 'İptal Et' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Düzenle & Gönder' })).toHaveLength(1);

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    page: '1',
    page_size: '20',
  });
});

it('filters and sorting go to the URL and the request', async () => {
  renderPage('/general/overtime/registry?status=approved&team=welding&page=2');
  await screen.findByText('mehmet');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    status: 'approved',
    team: 'welding',
    page: '2',
    page_size: '20',
  });

  fireEvent.change(screen.getByLabelText('Arama'), { target: { value: '270' } });
  fireEvent.keyDown(screen.getByLabelText('Arama'), { key: 'Enter' });
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(Object.fromEntries(listCalls()[1]!.url.searchParams)).toEqual({
    search: '270',
    status: 'approved',
    team: 'welding',
    page: '1',
    page_size: '20',
  });

  fireEvent.click(screen.getByText('Başlangıç', { selector: 'th *' }));
  await waitFor(() => expect(listCalls()).toHaveLength(3));
  expect(listCalls()[2]!.url.searchParams.get('ordering')).toBe('start_at');
  expect(
    new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('ordering'),
  ).toBe('start_at');

  // OvertimeRequestViewSet orders by start_at, end_at, status and created_at only.
  for (const name of ['Talep No', 'Talep Eden', 'Departman', 'Süre', 'Katılımcı']) {
    expect(within(screen.getByRole('columnheader', { name })).queryByRole('button')).toBeNull();
  }
});

it('sends the date range as OvertimeRequestFilter reads it', async () => {
  // The backend ignores start_date/end_date; it filters start_at__gte / start_at__lte.
  renderPage('/general/overtime/registry?start_date=2026-10-01&end_date=2026-10-31');
  await screen.findByText('mehmet');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    start_at__gte: '2026-10-01',
    start_at__lte: '2026-10-31T23:59:59',
    page: '1',
    page_size: '20',
  });
});

it('cancelling asks first and posts to cancel/', async () => {
  renderPage();
  await screen.findByText('mehmet');
  fireEvent.click(screen.getByRole('button', { name: 'İptal Et' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mesai Talebini İptal Et' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'İptal Et' }));
  await waitFor(() =>
    expect(
      calls().filter(
        (c) => c.method === 'POST' && c.url.pathname === '/overtime/requests/10/cancel/',
      ),
    ).toHaveLength(1),
  );
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Mesai talebi başarıyla iptal edildi.'),
  );
});

it('the details modal offers Onayla only to the request approvers', async () => {
  renderPage('/general/overtime/registry?request=12');
  const dialog = await screen.findByRole('dialog', { name: 'Mesai Talebi Detayları' });
  expect(await within(dialog).findByText('Ali Kaya')).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Onayla' })).not.toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: 'Reddet' })).not.toBeInTheDocument();
});

it('the create form validates, then posts the request', async () => {
  renderPage();
  await screen.findByText('mehmet');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Mesai Talebi' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni Mesai Talebi' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(5);

  fireEvent.change(within(dialog).getByLabelText(/Mesai Nedeni/), {
    target: { value: 'Sevkiyat yetişmeli' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Başlangıç Tarihi/), {
    target: { value: '2099-01-10' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Başlangıç Saati/), {
    target: { value: '18:00' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Bitiş Tarihi/), {
    target: { value: '2099-01-10' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Bitiş Saati/), { target: { value: '17:00' } });

  // The participant still has no user / job.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(
    await within(dialog).findByText('Lütfen tüm katılımcılar için gerekli bilgileri doldurun.'),
  ).toBeInTheDocument();

  // Pick the user and the job.
  await waitFor(() =>
    expect(calls().some((c) => c.url.pathname === '/users/dropdown/')).toBe(true),
  );
  fireEvent.click(within(dialog).getByLabelText(/Çalışan/));
  fireEvent.click(await screen.findByRole('option', { name: 'Ali Kaya (ali)', hidden: true }));
  fireEvent.click(within(dialog).getByLabelText(/İş Emri No/));
  fireEvent.click(await screen.findByRole('option', { name: '270-01 - Kazan', hidden: true }));

  // End before start.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));
  expect(
    await within(dialog).findByText('Bitiş zamanı başlangıç zamanından sonra olmalıdır'),
  ).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText(/Bitiş Saati/), { target: { value: '21:00' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(calls().filter((c) => c.method === 'POST')).toHaveLength(1));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/overtime/requests/');
  expect(post.body).toEqual({
    start_at: new Date('2099-01-10T18:00').toISOString(),
    end_at: new Date('2099-01-10T21:00').toISOString(),
    reason: 'Sevkiyat yetişmeli',
    entries: [{ user: 5, job_no: '270-01', description: '', operations: [] }],
  });
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Mesai talebi başarıyla oluşturuldu.'),
  );
});

it('Düzenle & Gönder opens the form prefilled and PATCHes the request', async () => {
  renderPage();
  await screen.findByText('mehmet');
  fireEvent.click(screen.getByRole('button', { name: 'Düzenle & Gönder' }));
  const dialog = await screen.findByRole('dialog', { name: 'Mesai Talebini Düzenle & Gönder' });
  expect(within(dialog).getByLabelText(/Mesai Nedeni/)).toHaveValue('Sevkiyat');

  // The prefilled window is in the past for the test clock; move it forward.
  fireEvent.change(within(dialog).getByLabelText(/Başlangıç Tarihi/), {
    target: { value: '2099-02-01' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Bitiş Tarihi/), {
    target: { value: '2099-02-01' },
  });
  await waitFor(() =>
    expect(within(dialog).getByLabelText(/Çalışan/)).toHaveValue('Ali Kaya (ali)'),
  );
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kaydet' }));

  await waitFor(() => expect(calls().filter((c) => c.method === 'PATCH')).toHaveLength(1));
  const patch = calls().find((c) => c.method === 'PATCH')!;
  expect(patch.url.pathname).toBe('/overtime/requests/11/');
  expect(patch.body).toMatchObject({
    reason: 'Sevkiyat',
    entries: [{ user: 5, job_no: '270-01' }],
  });
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Mesai talebi güncellendi ve yeniden gönderildi.'),
  );
});
