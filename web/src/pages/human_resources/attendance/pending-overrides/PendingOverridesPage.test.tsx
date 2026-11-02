import { authedFetch } from '@legacy/authService.js';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PendingOverridesPage } from './PendingOverridesPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const RECORDS = [
  {
    id: 1,
    user_display: 'Ali Yılmaz',
    status: 'pending_override',
    sessions: [
      { id: 50, status: 'complete', check_in_time: '2026-11-01T06:00:00Z' },
      {
        id: 51,
        status: 'pending_override',
        check_in_time: '2026-11-02T06:10:00Z',
        override_reason: 'Sahada montaj',
      },
    ],
  },
  {
    id: 2,
    user_display: 'Berk Demir',
    status: 'pending_checkout_override',
    sessions: [
      { id: 60, status: 'pending_checkout_override', check_in_time: '2026-11-02T05:00:00Z' },
    ],
  },
  { id: 3, user_display: 'Cem Kaya', status: 'complete', sessions: [] },
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

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <PendingOverridesPage />
    </ModalsProvider>,
    { route: '/human_resources/attendance/pending-overrides/' },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url, init) =>
    (init?.method ?? 'GET') === 'GET'
      ? json({ count: 3, next: null, previous: null, results: RECORDS })
      : json({ ok: true }),
  );
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('shows the pending session of each record and actions only for pending ones', async () => {
  renderPage();
  expect(await screen.findByText('Ali Yılmaz')).toBeInTheDocument();
  expect(screen.getByText('Sahada montaj')).toBeInTheDocument();
  expect(screen.getByText('İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)')).toBeInTheDocument();
  expect(screen.getByText('Tamamlandı (Çıkış Yapıldı)')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Onayla' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Reddet' })).toHaveLength(2);
});

it('approves a check-in with a corrected time', async () => {
  renderPage();
  await screen.findByText('Ali Yılmaz');
  fireEvent.click(screen.getAllByRole('button', { name: 'Onayla' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Onayla' });
  expect(
    within(dialog).getByText('Bu giriş düzeltme talebini onaylamak istiyor musunuz?'),
  ).toBeInTheDocument();

  fireEvent.change(within(dialog).getByLabelText('Giriş saati (opsiyonel)'), {
    target: { value: '2026-11-02T08:15' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Talep onaylandı'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/attendance/hr/sessions/51/approve/');
  expect(post.body).toEqual({ check_in_time: '2026-11-02T08:15' });
});

it('approves a check-out without a time as an empty body', async () => {
  renderPage();
  await screen.findByText('Berk Demir');
  fireEvent.click(screen.getAllByRole('button', { name: 'Onayla' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Onayla' });
  expect(within(dialog).getByLabelText('Çıkış saati (opsiyonel)')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Onayla' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Talep onaylandı'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/attendance/hr/sessions/60/approve/');
  expect(post.body).toEqual({});
});

it('rejects with the typed note', async () => {
  renderPage();
  await screen.findByText('Ali Yılmaz');
  fireEvent.click(screen.getAllByRole('button', { name: 'Reddet' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Reddet' });
  fireEvent.change(within(dialog).getByLabelText('Reddetme notu (opsiyonel)'), {
    target: { value: ' Belge yok ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Reddet' }));

  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Talep reddedildi'));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/attendance/hr/sessions/51/reject/');
  expect(post.body).toEqual({ notes: 'Belge yok' });
});
