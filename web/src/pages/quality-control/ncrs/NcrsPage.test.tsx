import { authedFetch, type LegacyUser } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { NcrsPage } from './NcrsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: vi.fn() }));

const fetchMock = vi.mocked(authedFetch);
const useAuthMock = vi.mocked(useAuth);

const QC_USER: LegacyUser = {
  id: 7,
  username: 'kk',
  first_name: 'Kalite',
  last_name: 'Uzmanı',
  user_groups: ['kalite-kontrol'],
  user_group_ids: [5],
};
const WELDER: LegacyUser = {
  id: 8,
  username: 'kaynak',
  user_groups: ['kaynak'],
  user_group_ids: [3],
};

const GROUPS = [
  { id: 3, name: 'kaynak', display_name: 'Kaynak' },
  { id: 5, name: 'kalite-kontrol', display_name: 'Kalite Kontrol' },
];

const NCRS = [
  {
    id: 1,
    ncr_number: 'NCR-2026-0001',
    job_order: 'JO-1',
    title: 'Bükme açısı resim dışı',
    status: 'draft',
    severity: 'major',
    defect_type_display: 'Boyutsal',
    submission_count: 0,
    assigned_team: 3,
    assigned_team_name: 'Kaynak',
    created_at: '2026-10-01T10:00:00Z',
  },
  {
    id: 2,
    ncr_number: 'NCR-2026-0002',
    job_order: 'JO-2',
    title: 'Kaynak gözenekli',
    status: 'submitted',
    severity: 'critical',
    submission_count: 2,
    assigned_team: 3,
    assigned_team_name: 'Kaynak',
    created_at: '2026-10-02T10:00:00Z',
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
  calls().filter(
    (c) =>
      c.method === 'GET' &&
      c.url.pathname === '/quality-control/ncrs/' &&
      c.url.searchParams.get('page_size') !== '1',
  );

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/quality-control/ncrs/') {
  return renderWithProviders(
    <ModalsProvider>
      <NcrsPage />
      <LocationProbe />
    </ModalsProvider>,
    { route },
  );
}

function defaultBackend(url: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method ?? 'GET';
  const { pathname, searchParams } = new URL(String(url));
  if (pathname === '/organization/groups/')
    return json({ count: 2, next: null, previous: null, results: GROUPS });
  if (pathname === '/users/dropdown/')
    return json([{ id: 7, username: 'kk', full_name: 'Kalite Uzmanı' }]);
  if (pathname === '/projects/job-orders/dropdown/')
    return json([{ job_no: 'JO-1', title: 'Tank' }]);
  if (method === 'GET' && pathname === '/quality-control/ncrs/') {
    if (searchParams.get('search') === 'NCR-2026-0002')
      return json({ count: 1, next: null, previous: null, results: [NCRS[1]] });
    return json({ count: 12, next: null, previous: null, results: NCRS });
  }
  if (method === 'GET' && pathname === '/quality-control/ncrs/1/')
    return json({ ...NCRS[0], approval_history: [] });
  if (method === 'GET' && pathname === '/quality-control/ncrs/2/') {
    return json({
      ...NCRS[1],
      root_cause: 'Kalıp ayarı',
      description: 'Gözenek var',
      approval_history: [],
    });
  }
  if (method === 'GET' && /\/files\/$/.test(pathname)) return json([]);
  if (method === 'POST') return json({ id: 1, ncr_number: 'NCR-2026-0001', status: 'submitted' });
  return json({ detail: 'not mocked' }, 404);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(defaultBackend);
  useAuthMock.mockReturnValue({
    user: QC_USER,
    isAdmin: false,
    isImpersonating: false,
    permissionsVersion: 0,
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
  vi.spyOn(notify, 'warning');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('lists NCRs with the legacy default filters for a QC member (every group)', async () => {
  renderPage();
  expect(screen.getByText('Uygunsuzluk Raporları', { selector: 'h1' })).toBeInTheDocument();
  expect(await screen.findByText('2026-0001')).toBeInTheDocument();
  expect(screen.getByText('Bükme açısı resim dışı')).toBeInTheDocument();
  expect(within(document.getElementById('ncr-total-count')!).getByText('12')).toBeInTheDocument();
  // Pending action: the draft waits for its group, the submitted one for QC (that's me).
  expect(screen.getByText('Kök neden ve düzeltici faaliyeti girip göndermeli')).toBeInTheDocument();
  expect(screen.getByText('Sizde')).toBeInTheDocument();

  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    status__in: 'draft,submitted,rejected,approved',
    ordering: '-created_at',
    page: '1',
    page_size: '20',
  });
  // QC decides: edit everywhere, approve / reject on the submitted one only.
  expect(screen.getAllByRole('button', { name: 'Düzenle' })).toHaveLength(2);
  // Four actions on the submitted row: the last two sit in the menu.
  fireEvent.click(screen.getByRole('button', { name: 'Diğer işlemler' }));
  const items = await screen.findAllByRole('menuitem');
  expect(items.map((item) => item.textContent)).toEqual(['Onayla', 'Reddet']);
  // Not a member of Kaynak, so no submit.
  expect(screen.queryByRole('button', { name: 'Gönder' })).toBeNull();
});

it('narrows a group member to their own group, with submit but no QC actions', async () => {
  useAuthMock.mockReturnValue({
    user: WELDER,
    isAdmin: false,
    isImpersonating: false,
    permissionsVersion: 0,
  });
  renderPage();
  await screen.findByText('2026-0001');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    status__in: 'draft,submitted,rejected,approved',
    assigned_team: '3',
    ordering: '-created_at',
    page: '1',
    page_size: '20',
  });
  expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Gönder' })).toHaveLength(1);
});

it('reads and writes the legacy URL keys (`all`, comma lists, search)', async () => {
  renderPage(
    '/quality-control/ncrs/?status__in=all&assigned_team__in=3,5&severity=critical&page=2',
  );
  await screen.findByText('2026-0001');
  expect(Object.fromEntries(listCalls()[0]!.url.searchParams)).toEqual({
    assigned_team__in: '3,5',
    severity: 'critical',
    ordering: '-created_at',
    page: '2',
    page_size: '20',
  });

  fireEvent.change(screen.getByLabelText('Arama'), { target: { value: 'gözenek' } });
  fireEvent.keyDown(screen.getByLabelText('Arama'), { key: 'Enter' });
  await waitFor(() => {
    const search = new URLSearchParams(screen.getByTestId('location').textContent ?? '');
    expect(search.get('search')).toBe('gözenek');
    expect(search.get('status__in')).toBe('all');
    expect(search.get('assigned_team__in')).toBe('3,5');
    expect(search.has('page')).toBe(false);
  });
  await waitFor(() => expect(listCalls().at(-1)!.url.searchParams.get('search')).toBe('gözenek'));
  expect(listCalls().at(-1)!.url.searchParams.has('status__in')).toBe(false);
});

it('rejecting needs a comment, then posts the decision', async () => {
  renderPage();
  await screen.findByText('2026-0002');
  fireEvent.click(screen.getByRole('button', { name: 'Diğer işlemler' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Reddet' }));
  const dialog = await screen.findByRole('dialog', { name: 'NCR Kararı' });
  expect(within(dialog).getByText('Reddetme')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Karar Ver' }));
  expect(await within(dialog).findByText('Bu alan gereklidir')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.change(within(dialog).getByLabelText(/Yorum/), { target: { value: 'Ölçü tutmuyor' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Karar Ver' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('NCR reddedildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/quality-control/ncrs/2/decide/');
  expect(post.body).toEqual({ approve: false, comment: 'Ölçü tutmuyor' });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('the assigned group submits a draft with root cause, corrective action and disposition', async () => {
  useAuthMock.mockReturnValue({
    user: WELDER,
    isAdmin: false,
    isImpersonating: false,
    permissionsVersion: 0,
  });
  renderPage();
  await screen.findByText('2026-0001');
  fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
  const dialog = await screen.findByRole('dialog', { name: 'NCR-2026-0001 · Onaya Gönder' });

  fireEvent.click(within(dialog).getByRole('button', { name: 'Onaya Gönder' }));
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(2);

  fireEvent.change(within(dialog).getByLabelText(/Uygunsuzluk neden oluştu/), {
    target: { value: ' Kalıp ayarı ' },
  });
  fireEvent.change(within(dialog).getByLabelText(/Tekrarlanmaması için/), {
    target: { value: 'Kontrol listesi' },
  });
  fireEvent.click(within(dialog).getByLabelText('Yeniden İşleme'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onaya Gönder' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('NCR başarıyla gönderildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/quality-control/ncrs/1/submit/');
  expect(post.body).toEqual({
    root_cause: 'Kalıp ayarı',
    corrective_action: 'Kontrol listesi',
    disposition: 'rework',
  });
});

it('the create form asks for the required fields', async () => {
  renderPage();
  await screen.findByText('2026-0001');
  fireEvent.click(screen.getByRole('button', { name: 'Yeni Oluştur' }));
  const dialog = await screen.findByRole('dialog', { name: 'Yeni NCR Oluştur' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Oluştur' }));
  // İş emri, sorumlu grup, başlık, açıklama, kusur tipi, önem.
  expect(await within(dialog).findAllByText('Bu alan gereklidir')).toHaveLength(6);
  expect(calls().some((c) => c.method === 'POST')).toBe(false);
});

it('opens the paper form from ?ncr= and keeps the number in the URL', async () => {
  renderPage('/quality-control/ncrs/?ncr=NCR-2026-0002');
  expect(await screen.findByText('Uygunsuzluk Raporu')).toBeInTheDocument();
  expect(await screen.findByText('Kalıp ayarı')).toBeInTheDocument();
  const footer = screen.getByRole('button', { name: 'Yazdır' }).parentElement!;
  expect(within(footer).getByRole('button', { name: 'Onayla' })).toBeInTheDocument();
  expect(screen.getByText('Henüz dosya yok.')).toBeInTheDocument();

  fireEvent.click(within(footer).getByRole('button', { name: 'Kapat' }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('ncr='));
});

it('an unknown ?ncr= number is reported and dropped from the URL', async () => {
  renderPage('/quality-control/ncrs/?ncr=NCR-1999-9999');
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('NCR yüklenirken hata oluştu'));
  await waitFor(() => expect(screen.getByTestId('location').textContent).not.toContain('ncr='));
});

it('closes an approved NCR only after the confirm', async () => {
  fetchMock.mockImplementation((url, init) => {
    const { pathname } = new URL(String(url));
    if ((init?.method ?? 'GET') === 'GET' && pathname === '/quality-control/ncrs/') {
      return json({
        count: 1,
        next: null,
        previous: null,
        results: [{ ...NCRS[0], id: 3, status: 'approved' }],
      });
    }
    return defaultBackend(url, init);
  });
  renderPage();
  await screen.findByText('2026-0001');
  fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
  expect(
    await screen.findByText(`"NCR-2026-0001" NCR'sını kapatmak istediğinizden emin misiniz?`),
  ).toBeInTheDocument();
  const confirmDialog = screen.getByRole('dialog', { name: 'NCR Kapat' });
  // The header's close button is also called Kapat; the answer is the last one.
  fireEvent.click(within(confirmDialog).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('NCR başarıyla kapatıldı'));
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/quality-control/ncrs/3/close/',
  );
});
