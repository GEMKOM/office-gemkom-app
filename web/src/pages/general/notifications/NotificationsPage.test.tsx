import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { groupRows, NotificationsPage } from './NotificationsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

const fetchMock = vi.mocked(authedFetch);

const NOTIFICATIONS = [
  {
    id: 1,
    title: 'Satınalma talebi onaylandı',
    body: 'SAT-12 onaylandı',
    category: 'procurement',
    category_display: 'Satınalma',
    notification_type_display: 'Talep Onayı',
    link: '/procurement/purchase-requests/registry/?talep=SAT-12',
    is_read: false,
    created_at: '2026-10-30T09:15:00Z',
  },
  {
    id: 2,
    title: 'Yeni yorum',
    body: null,
    category: 'topics',
    category_display: 'Konular',
    notification_type_display: 'Yorum',
    link: '',
    is_read: true,
    created_at: '2026-10-29T08:00:00Z',
  },
];

const FACETS = {
  total: 40,
  unread: 3,
  oldest: '2026-01-02T10:00:00Z',
  categories: [
    { value: 'procurement', label: 'Satınalma', count: 30 },
    { value: 'topics', label: 'Konular', count: 0 },
  ],
  types: [{ value: 'purchase_approved', label: 'Talep Onayı', count: 12 }],
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
const getCalls = (path: string) =>
  calls().filter((c) => c.method === 'GET' && c.url.pathname === path);
const listCalls = () => getCalls('/notifications/');
const facetCalls = () => getCalls('/notifications/facets/');
const paramsOf = (call: Call | undefined) => Object.fromEntries(call!.url.searchParams);

function LocationProbe() {
  return <div data-testid="location">{useLocation().search}</div>;
}

function renderPage(route = '/general/notifications') {
  return renderWithProviders(
    <>
      <NotificationsPage />
      <LocationProbe />
    </>,
    { route },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const method = init?.method ?? 'GET';
    const path = new URL(String(url)).pathname;
    if (method === 'GET' && path === '/notifications/') {
      return json({ count: 2, next: null, previous: null, results: NOTIFICATIONS });
    }
    if (method === 'GET' && path === '/notifications/facets/') return json(FACETS);
    if (method === 'POST') return json({ status: 'ok' });
    return json({ detail: 'not mocked' }, 404);
  });
  vi.spyOn(notify, 'success');
  vi.spyOn(notify, 'error');
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('opens on unread only and sends the legacy params to the list and the facets', async () => {
  renderPage();
  expect(await screen.findByText('Satınalma talebi onaylandı')).toBeInTheDocument();
  // The read row drops out of the unread view even if the server sent it.
  expect(screen.queryByText('Yeni yorum')).not.toBeInTheDocument();

  expect(paramsOf(listCalls()[0])).toEqual({
    ordering: '-created_at',
    page_size: '25',
    page: '1',
    is_read: 'false',
  });
  expect(paramsOf(facetCalls()[0])).toEqual({ is_read: 'false' });

  expect(within(document.getElementById('notif-unread-count')!).getByText('3')).toBeInTheDocument();
  expect(within(document.getElementById('notif-total-count')!).getByText('40')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Tümü/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /Satınalma/ })).toBeInTheDocument();
  expect(screen.getByText('2 bildirim')).toBeInTheDocument();
});

it('a category tab filters both requests and lands in the URL', async () => {
  renderPage();
  await screen.findByText('Satınalma talebi onaylandı');

  fireEvent.click(screen.getByRole('tab', { name: /Satınalma/ }));
  await waitFor(() => expect(listCalls()).toHaveLength(2));
  expect(paramsOf(listCalls()[1])).toMatchObject({
    category: 'procurement',
    is_read: 'false',
    page: '1',
  });
  expect(paramsOf(facetCalls()[1])).toEqual({ category: 'procurement', is_read: 'false' });
  expect(
    new URLSearchParams(screen.getByTestId('location').textContent ?? '').get('category'),
  ).toBe('procurement');
});

it('the mixed view asks the server for unread first and splits off the read rows', async () => {
  renderPage('/general/notifications?is_read=');
  expect(await screen.findByText('Yeni yorum')).toBeInTheDocument();
  expect(screen.getByText('Okunanlar')).toBeInTheDocument();
  expect(paramsOf(listCalls()[0])).toEqual({
    ordering: 'is_read,-created_at',
    page_size: '25',
    page: '1',
  });
  expect(paramsOf(facetCalls()[0])).toEqual({});
});

it('marking a row read posts mark_read and reloads the notifications', async () => {
  renderPage();
  await screen.findByText('Satınalma talebi onaylandı');

  fireEvent.click(screen.getByRole('button', { name: 'Okundu işaretle' }));
  await waitFor(() => expect(calls().some((c) => c.method === 'POST')).toBe(true));
  const post = calls().find((c) => c.method === 'POST')!;
  expect(post.url.pathname).toBe('/notifications/1/mark_read/');
  // Settling invalidates the ['notifications'] prefix (bell included).
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(1));
});

it('a failed toggle puts the row back and says so', async () => {
  renderPage('/general/notifications?is_read=');
  await screen.findByText('Yeni yorum');
  fetchMock.mockImplementation((url, init) =>
    init?.method === 'POST'
      ? json({ detail: 'hata' }, 500)
      : new URL(String(url)).pathname === '/notifications/facets/'
        ? json(FACETS)
        : json({ count: 2, next: null, previous: null, results: NOTIFICATIONS }),
  );

  fireEvent.click(screen.getByRole('button', { name: 'Okunmadı işaretle' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Bildirim durumu güncellenemedi'));
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/notifications/2/mark_unread/',
  );
  expect(screen.getByRole('button', { name: 'Okunmadı işaretle' })).toBeInTheDocument();
});

it('Tümünü Okundu İşaretle posts mark_all_read and confirms', async () => {
  renderPage();
  await screen.findByText('Satınalma talebi onaylandı');
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Okundu İşaretle' }));
  await waitFor(() =>
    expect(notify.success).toHaveBeenCalledWith('Tüm bildirimler okundu olarak işaretlendi'),
  );
  expect(calls().find((c) => c.method === 'POST')!.url.pathname).toBe(
    '/notifications/mark_all_read/',
  );
});

it('does not crash on empty replies and shows the unread-clear state', async () => {
  fetchMock.mockImplementation(() => json({}));
  renderPage();
  expect(await screen.findByText('Okunmamış bildirim yok.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tümünü Okundu İşaretle' })).toBeDisabled();
});

it('groupRows dates the rows and restarts the days in the read block', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const rows = [
    { id: 1, is_read: false, created_at: '2026-10-30T09:00:00Z' },
    { id: 2, is_read: false, created_at: '2026-10-30T08:00:00Z' },
    { id: 3, is_read: true, created_at: '2026-10-30T07:00:00Z' },
    { id: 4, is_read: true, created_at: '2026-10-29T07:00:00Z' },
  ];
  expect(groupRows(rows, true, now).map((e) => [e.item.id, e.readBlock, e.day])).toEqual([
    [1, false, 'Bugün'],
    [2, false, null],
    [3, true, 'Bugün'],
    [4, false, 'Dün'],
  ]);
  expect(groupRows(rows, false, now).map((e) => e.day)).toEqual(['Bugün', null, null, 'Dün']);
});
