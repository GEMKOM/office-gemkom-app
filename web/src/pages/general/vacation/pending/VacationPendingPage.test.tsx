import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { pendingApprovalCountQueryOptions } from '@/api/general/approvals';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { VacationPendingPage } from './VacationPendingPage';

// Mantine modals with many fields are slow in jsdom when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const PENDING = [
  {
    id: 21,
    requester_username: 'ayse.kaya',
    leave_type: 'annual_leave',
    status: 'submitted',
    status_label: 'Onay Bekliyor',
    start_date: '2026-11-10',
    end_date: '2026-11-12',
    duration_days: 3,
    approval: {
      stage_instances: [{ name: 'Yönetici Onayı', required_approvals: 2, approved_count: 1 }],
    },
  },
  {
    id: 22,
    requester_username: 'ali.can',
    leave_type: 'sick_leave',
    status: 'approved',
    start_date: '2026-11-03',
  },
];
const HOURLY = {
  id: 23,
  requester_username: 'mert.su',
  leave_type: 'compensatory_leave',
  status: 'submitted',
  start_date: '2026-11-05',
  end_date: '2026-11-05',
  start_time: '13:00:00',
  end_time: '16:00:00',
  duration_days: 0,
};
const DECIDED = [
  {
    id: 5,
    requester_username: 'veli.ok',
    leave_type: 'paid_leave',
    status: 'rejected',
    status_label: 'Reddedildi',
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
const gets = (path: string) => calls().filter((c) => c.method === 'GET' && c.url.pathname === path);

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <VacationPendingPage />
    </ModalsProvider>,
    { route: '/general/vacation/pending' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const { pathname } = new URL(String(url));
    if (method === 'GET' && pathname === '/vacation-requests/requests/pending_approval/') {
      return json({ count: 2, next: null, previous: null, results: PENDING });
    }
    if (method === 'GET' && pathname === '/vacation-requests/requests/decision_by_me/') {
      return json({ count: 1, next: null, previous: null, results: DECIDED });
    }
    if (method === 'GET' && pathname === '/vacation-requests/requests/21/') {
      return json({ ...PENDING[0], reason: 'Aile ziyareti' });
    }
    if (method === 'POST') return json({ status: 'ok' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists pending requests and my decisions; only submitted ones can be decided', async () => {
  renderPage();
  expect(await screen.findByText('ayse.kaya')).toBeInTheDocument();
  expect(screen.getByText('#21')).toBeInTheDocument();
  expect(screen.getByText('Yönetici Onayı')).toBeInTheDocument();
  expect(screen.getByText('1 onay bekleniyor')).toBeInTheDocument();
  expect(await screen.findByText('veli.ok')).toBeInTheDocument();
  expect(screen.getByText('Reddedildi')).toBeInTheDocument();

  expect(screen.getAllByRole('button', { name: 'Onayla' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Reddet' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Detay' })).toHaveLength(3);
  expect(within(document.getElementById('pending-count')!).getByText('2')).toBeInTheDocument();

  // Legacy loaded both lists without params.
  expect(gets('/vacation-requests/requests/pending_approval/')[0]!.url.search).toBe('');
  expect(gets('/vacation-requests/requests/decision_by_me/')[0]!.url.search).toBe('');
});

it('does not crash on empty responses', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('Bekleyen izin talebi bulunamadı.')).toBeInTheDocument();
  expect(await screen.findByText('Karar geçmişi bulunamadı.')).toBeInTheDocument();
});

it('approves after the confirm, reloads both lists and the pending count', async () => {
  const { queryClient } = renderPage();
  queryClient.setQueryData(pendingApprovalCountQueryOptions('vacation').queryKey, 2);
  await screen.findByText('ayse.kaya');

  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));
  expect(await screen.findByText('#21 numaralı izin talebi onaylansın mı?')).toBeInTheDocument();
  expect(screen.getByText('Talep Eden: ayse.kaya')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Evet, Onayla' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin talebi onaylandı.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/vacation-requests/requests/21/approve/');
  expect(post.body).toEqual({ comment: '' });
  await waitFor(() =>
    expect(gets('/vacation-requests/requests/pending_approval/')).toHaveLength(2),
  );
  await waitFor(() => expect(gets('/vacation-requests/requests/decision_by_me/')).toHaveLength(2));
  expect(
    queryClient.getQueryState(pendingApprovalCountQueryOptions('vacation').queryKey)?.isInvalidated,
  ).toBe(true);
});

it('rejects with the typed comment', async () => {
  renderPage();
  await screen.findByText('ayse.kaya');
  fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
  const dialog = await screen.findByRole('dialog', { name: 'İzin Talebini Reddet' });
  fireEvent.change(within(dialog).getByLabelText('Yorum (opsiyonel)'), {
    target: { value: '  Yoğun dönem  ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('İzin talebi reddedildi.'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/vacation-requests/requests/21/reject/');
  expect(post.body).toEqual({ comment: 'Yoğun dönem' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('keeps the reject dialog open with the backend message when it fails', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'POST'
      ? json({ detail: 'Bu talep için yetkiniz yok.' }, 403)
      : base(url, init),
  );
  renderPage();
  await screen.findByText('ayse.kaya');
  fireEvent.click(screen.getByRole('button', { name: 'Reddet' }));
  const dialog = await screen.findByRole('dialog', { name: 'İzin Talebini Reddet' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalled());
  expect(vi.mocked(notify.error).mock.calls[0]![0]).toMatchObject({
    message: 'Bu talep için yetkiniz yok.',
  });
  expect(screen.getByRole('dialog', { name: 'İzin Talebini Reddet' })).toBeInTheDocument();
});

it('shows a request in the approver detail modal', async () => {
  renderPage();
  await screen.findByText('ayse.kaya');
  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'İzin Talebi Detayı' });
  expect(within(dialog).getByText('Genel Bilgiler')).toBeInTheDocument();
  expect(within(dialog).getByText('Aile ziyareti')).toBeInTheDocument();
  expect(within(dialog).getByText('Onay Özeti')).toBeInTheDocument();
  expect(within(dialog).queryByText('Saat Aralığı')).not.toBeInTheDocument();
});

it('shows hourly leave as hours, with the time range in the detail modal', async () => {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/vacation-requests/requests/pending_approval/')
      return json({ count: 1, next: null, previous: null, results: [HOURLY] });
    if (pathname === '/vacation-requests/requests/23/') return json(HOURLY);
    return base(url, init);
  });
  renderPage();
  await screen.findByText('mert.su');
  expect(screen.getByText('3 saat')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Detay' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'İzin Talebi Detayı' });
  expect(within(dialog).getByText('13:00 - 16:00')).toBeInTheDocument();
  expect(within(dialog).getByText('3 saat')).toBeInTheDocument();
});
