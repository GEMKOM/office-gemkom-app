import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { HomePage } from './HomePage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

// null: every route opens (admin); a set: only those routes (and the always-open ones).
const access = vi.hoisted(() => ({ granted: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => {
    const open = ['/', '/general', '/general/discussions', '/general/notifications', '/isg', '/isg/issues'];
    return access.granted === null || open.includes(route) || access.granted.has(route);
  },
}));

const auth = vi.hoisted(() => ({
  user: { id: 7, username: 'ayse', first_name: 'Ayşe', department_code: 'procurement' } as Record<string, unknown>,
}));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: auth.user }) }));

const fetchMock = vi.mocked(authedFetch);
const page = (results: unknown[], count = results.length) => ({ count, next: null, previous: null, results });

/** path (or "path?param=value") -> body; anything else answers an empty page. */
let responses: Record<string, unknown>;

function respond(url: string) {
  const { pathname, searchParams } = new URL(url);
  const keyed = [...searchParams].map(([k, v]) => `${pathname}?${k}=${v}`).find((key) => key in responses);
  const body = keyed ? responses[keyed] : pathname in responses ? responses[pathname] : page([]);
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const calledPaths = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
const panel = (title: string) => screen.getByRole('heading', { level: 2, name: title }).closest('section')!;
const tile = (label: string) => screen.getByText(label, { selector: 'span' }).closest('li')!;

beforeEach(() => {
  access.granted = null;
  auth.user = { id: 7, username: 'ayse', first_name: 'Ayşe', department_code: 'procurement' };
  localStorage.clear();
  responses = {};
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => respond(String(url)));
});

it('greets the user and lists what waits on their approval, each linking to its record', async () => {
  responses = {
    '/procurement/purchase-requests/pending_approval/': page(
      [
        { id: 1, request_number: 'SAT-1', title: 'Rulman', requestor_username: 'mehmet', priority: 'urgent', created_at: '2026-10-20T08:00:00Z' },
        { id: 2, request_number: 'SAT-2', title: 'Boya', requestor_username: 'ali', created_at: '2026-11-02T08:00:00Z' },
      ],
      2,
    ),
    '/vacation-requests/requests/pending_approval/': page(
      [{ id: 31, requester_full_name: 'Can Demir', leave_type_label: 'Yıllık İzin', start_date: '2026-11-10', end_date: '2026-11-12', created_at: '2026-11-01T08:00:00Z' }],
      1,
    ),
    '/approvals/inbox/': [
      { workflow_id: 1, subject_type: 'quality_control.ncr', subject_id: 9, stage_name: 'Kalite', created_at: '2026-10-25T08:00:00Z', snapshot: { ncr_number: 'NCR-7', title: 'Kaynak hatası' } },
      { workflow_id: 2, subject_type: 'procurement.paymentlist', subject_id: 4, stage_name: 'Finans', created_at: '2026-10-30T08:00:00Z', snapshot: { payment_list: { title: 'Kasım 1. hafta' } } },
      // Has its own pending list, so the inbox copy is not counted twice.
      { workflow_id: 3, subject_type: 'procurement.purchaserequest', subject_id: 1, created_at: '2026-10-20T08:00:00Z', snapshot: {} },
    ],
  };
  renderWithProviders(<HomePage />);

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/, Ayşe$/);
  await waitFor(() => expect(within(tile('Onayınızı Bekleyen')).getByText('5')).toBeInTheDocument());

  const list = within(panel('Onayınızı Bekleyenler'));
  await waitFor(() => expect(list.getByRole('link', { name: /SAT-1/ })).toBeInTheDocument());
  expect(list.getByRole('link', { name: /SAT-1/ })).toHaveAttribute('href', '/procurement/purchase-requests/pending?talep=SAT-1');
  expect(list.getByRole('link', { name: /NCR-7/ })).toHaveAttribute('href', '/quality-control/ncrs?ncr=NCR-7');
  expect(list.getByRole('link', { name: /Kasım 1. hafta/ })).toHaveAttribute('href', '/procurement/payment-lists?status=submitted');
  // Oldest first: the request waiting longest leads.
  expect(list.getAllByRole('link')[0]).toHaveTextContent('SAT-1');

  const queues = within(panel('Onay Kuyruklarım'));
  expect(queues.getByRole('link', { name: /Satın alma talepleri/ })).toHaveTextContent('2');
  expect(queues.getByRole('link', { name: /Uygunsuzluk raporları/ })).toHaveAttribute('href', '/quality-control/ncrs');
  expect(queues.getByRole('link', { name: /Ödeme listeleri/ })).toBeInTheDocument();
  expect(queues.queryByRole('link', { name: /Satış teklifleri/ })).not.toBeInTheDocument();

  // Drawing releases are for the design department only.
  expect(calledPaths()).not.toContain('/projects/drawing-releases/pending_approvals/');
});

it('shows the tasks assigned to the user, overdue ones flagged, each opening on its department page', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T10:00:00'));
  auth.user = { id: 7, username: 'zeynep', first_name: 'Zeynep', department_code: 'design' };
  responses = {
    '/projects/department-tasks/?ordering=target_completion_date': page(
      [
        { id: 11, title: 'Montaj resmi', job_order: '254-01', department: 'design', department_display: 'Dizayn', status: 'in_progress', status_display: 'Devam Ediyor', target_completion_date: '2026-10-30' },
        { id: 12, title: 'Sevk listesi', job_order: '254-02', department: 'logistics', status: 'pending', status_display: 'Bekliyor', target_completion_date: '2026-11-20' },
      ],
      2,
    ),
    '/projects/department-tasks/?target_completion_date__lte=2026-11-02': page([], 1),
    '/projects/drawing-releases/pending_approvals/': page(
      [
        { id: 1, job_order_no: '254-01', revision_code: 'R2', job_order_title: 'Tank', can_approve: true },
        { id: 2, job_order_no: '254-03', revision_code: 'R0', job_order_title: 'Silo', can_approve: false },
      ],
      2,
    ),
  };
  try {
    renderWithProviders(<HomePage />);

    const tasks = within(panel('Görevlerim'));
    await waitFor(() => expect(tasks.getByRole('link', { name: /Montaj resmi/ })).toBeInTheDocument());
    expect(tasks.getByRole('link', { name: /Montaj resmi/ })).toHaveAttribute('href', '/design/projects?task=11');
    expect(tasks.getByRole('link', { name: /Montaj resmi/ })).toHaveTextContent('Gecikti');
    expect(tasks.getByRole('link', { name: /Sevk listesi/ })).toHaveAttribute('href', '/logistics/projects?task=12');
    expect(tasks.getByRole('link', { name: 'Tümü' })).toHaveAttribute('href', '/design/projects?assigned_to=7');
    await waitFor(() => expect(within(tile('Geciken')).getByText('1')).toBeInTheDocument());

    // Only the releases this user may review count.
    const queues = within(panel('Onay Kuyruklarım'));
    await waitFor(() => expect(queues.getByRole('link', { name: /Çizim onayları/ })).toHaveTextContent('1'));
    expect(within(panel('Onayınızı Bekleyenler')).queryByText('Silo')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

it('asks nothing of the lists a user cannot open and says so kindly when nothing waits', async () => {
  access.granted = new Set(['/general/vacation/requests']);
  auth.user = { id: 8, username: 'usta', first_name: 'Usta', department_code: 'welding' };
  responses = {
    '/vacation-requests/requests/?mine=true': page([
      { id: 5, status: 'submitted', status_label: 'Onay Bekliyor', leave_type_label: 'Yıllık İzin', start_date: '2026-11-20', end_date: '2026-11-21', created_at: '2026-11-02T08:00:00Z' },
    ]),
  };
  renderWithProviders(<HomePage />);

  const mine = within(panel('Taleplerim'));
  await waitFor(() => expect(mine.getByRole('link', { name: /Yıllık İzin/ })).toBeInTheDocument());
  expect(mine.getByRole('link', { name: /Yıllık İzin/ })).toHaveAttribute('href', '/general/vacation/requests?request_id=5');
  expect(mine.getByText('Onay Bekliyor')).toBeInTheDocument();

  // No approval queue, no task department: no approval panels or figures.
  expect(screen.queryByRole('heading', { name: 'Onayınızı Bekleyenler' })).not.toBeInTheDocument();
  expect(screen.queryByText('Onayınızı Bekleyen')).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Görevlerim' })).not.toBeInTheDocument();
  await waitFor(() => expect(calledPaths()).toContain('/approvals/inbox/'));
  expect(calledPaths().filter((path) => path.includes('pending'))).toEqual([]);
  expect(calledPaths()).not.toContain('/overtime/requests/');
});

it('shows a calm note when nothing at all waits on the user', async () => {
  access.granted = new Set();
  auth.user = { id: 9, username: 'misafir', first_name: 'Misafir' };
  renderWithProviders(<HomePage />);

  expect(await screen.findByText(/Üzerinizde bekleyen bir onay, görev ya da talep yok/)).toBeInTheDocument();
  expect(await within(panel('Son Bildirimler')).findByText('Henüz bir bildiriminiz yok.')).toBeInTheDocument();
});

it('shows an empty approval list as good news, not as a blank panel', async () => {
  renderWithProviders(<HomePage />);
  expect(await within(panel('Onayınızı Bekleyenler')).findByText(/Şu an onayınızı bekleyen bir şey yok/)).toBeInTheDocument();
  expect(await within(panel('Onay Kuyruklarım')).findByText('Bekleyen bir iş yok')).toBeInTheDocument();
});

it('lists the latest notifications, unread marked, linking to all of them', async () => {
  responses = {
    '/notifications/': page([
      { id: 1, title: 'Talep onaylandı', is_read: true, created_at: '2026-11-03T07:00:00Z', link: '/procurement/purchase-requests/registry?talep=SAT-9' },
      { id: 2, title: 'Yeni NCR atandı', is_read: false, created_at: '2026-11-02T07:00:00Z', link: '/quality-control/ncrs?ncr=NCR-8' },
    ]),
  };
  renderWithProviders(<HomePage />);

  const notes = within(panel('Son Bildirimler'));
  const rows = await notes.findAllByRole('button');
  // Unread first.
  expect(rows[0]).toHaveTextContent('Yeni NCR atandı');
  expect(rows[0]).toHaveTextContent('Okunmamış');
  expect(notes.getByRole('link', { name: 'Tümü' })).toHaveAttribute('href', '/general/notifications');
});

const shortcutLinks = () =>
  within(panel('Kısayollar'))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));

it('offers the department pages as shortcuts until the user has favourites of their own', async () => {
  const { unmount } = renderWithProviders(<HomePage />);
  expect(shortcutLinks().slice(0, 2)).toEqual(['/procurement/purchase-requests/pending', '/procurement/purchase-requests/registry']);
  unmount();

  localStorage.setItem(
    'gk.pageVisits.7',
    JSON.stringify({ '/sales/offers': { count: 9, last: 1 }, '/finance/purchase-orders': { count: 3, last: 2 } }),
  );
  renderWithProviders(<HomePage />);
  expect(shortcutLinks().slice(0, 3)).toEqual([
    '/sales/offers',
    '/finance/purchase-orders',
    '/procurement/purchase-requests/pending',
  ]);
  const first = within(panel('Kısayollar')).getAllByRole('link')[0]!;
  expect(first).toHaveTextContent('Teklifler');
  expect(first).toHaveAttribute('title', 'Satış › Teklifler');
});

it('sits right under the band, before the panels', () => {
  renderWithProviders(<HomePage />);
  const bar = panel('Kısayollar');
  const queues = panel('Onay Kuyruklarım');
  expect(bar.compareDocumentPosition(queues) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Çalışma Alanları' })).not.toBeInTheDocument();
});

it('keeps a pinned page first and remembers it for the next visit', async () => {
  const { unmount } = renderWithProviders(<HomePage />);

  fireEvent.click(within(panel('Kısayollar')).getByRole('button', { name: 'Tedarikçi Listesi sabitle' }));
  expect(shortcutLinks()[0]).toBe('/procurement/suppliers/list');
  expect(JSON.parse(localStorage.getItem('gk.pinnedPages.7')!)).toEqual(['/procurement/suppliers/list']);
  unmount();

  renderWithProviders(<HomePage />);
  expect(shortcutLinks()[0]).toBe('/procurement/suppliers/list');
  const bar = within(panel('Kısayollar'));
  fireEvent.click(bar.getByRole('button', { name: 'Tedarikçi Listesi sabitlemesini kaldır' }));
  expect(JSON.parse(localStorage.getItem('gk.pinnedPages.7')!)).toEqual([]);
});

it('pins any page of the menu from the picker', async () => {
  renderWithProviders(<HomePage />);

  fireEvent.click(within(panel('Kısayollar')).getByRole('button', { name: 'Kısayol ekle' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Sayfa ara' }), { target: { value: 'takibi' } });
  // The popover is still fading in (aria-hidden) under jsdom: reach the row by its text.
  fireEvent.click((await screen.findByText('Proje Takibi', { selector: 'span' })).closest('button')!);

  expect(shortcutLinks()[0]).toBe('/projects/project-tracking');
  expect(JSON.parse(localStorage.getItem('gk.pinnedPages.7')!)).toEqual(['/projects/project-tracking']);
});

it('badges what waits on the user in red, and drops the badges when nothing does', async () => {
  responses = {
    '/procurement/purchase-requests/pending_approval/': page([{ id: 1, request_number: 'SAT-1', title: 'Rulman' }], 12),
    '/notifications/unread_count/': { count: 3 },
  };
  const { unmount } = renderWithProviders(<HomePage />);

  const approvals = panel('Onayınızı Bekleyenler');
  await waitFor(() => expect(approvals.querySelector('[data-count-badge]')).toHaveTextContent('12'));
  const queues = panel('Onay Kuyruklarım');
  expect(queues.querySelector('[data-count-badge]')).toHaveTextContent('12');
  expect(queues.querySelector('a[href="/procurement/purchase-requests/pending"] [data-count-badge]')).toHaveTextContent('12');
  await waitFor(() => expect(panel('Son Bildirimler').querySelector('[data-count-badge]')).toHaveTextContent('3'));
  unmount();

  responses = {};
  renderWithProviders(<HomePage />);
  await within(panel('Onay Kuyruklarım')).findByText('Bekleyen bir iş yok');
  expect(document.querySelector('[data-count-badge]')).toBeNull();
});
