import { authedFetch } from '@/auth/authService';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { GeneralHubPage } from './GeneralHubPage';
import { OvertimeHubPage } from './OvertimeHubPage';
import { VacationHubPage } from './VacationHubPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 42, username: 'genel' } }),
}));

// null: every route opens (admin); a set: only those routes (and the always-open ones).
const access = vi.hoisted(() => ({ granted: null as Set<string> | null }));
vi.mock('@/auth/accessControl', () => ({
  hasRouteAccess: (route: string) => {
    const path = route.replace(/[?#].*$/, '').replace(/(.)\/$/, '$1');
    const open = ['/general', '/general/discussions', '/isg', '/isg/issues'];
    return access.granted === null || open.includes(path) || access.granted.has(path);
  },
}));

const fetchMock = vi.mocked(authedFetch);

const COUNTS: Record<string, number> = {
  '/overtime/requests/pending_approval/': 5,
  '/vacation-requests/requests/pending_approval/': 0,
  '/planning/department-requests/pending_approval/': 2,
  '/cranes/requests/pending_approval/': 0,
};

// Lists by path (or path?status=x), and whole bodies by path; anything else
// is an empty page with COUNTS' count.
const LISTS: Record<string, unknown[]> = {};
const BODIES: Record<string, unknown> = {};

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  access.granted = null;
  for (const key of Object.keys(LISTS)) delete LISTS[key];
  for (const key of Object.keys(BODIES)) delete BODIES[key];
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname, searchParams } = new URL(String(url));
    if (pathname === '/isg/issues/summary/')
      return json({ total: 12, open: 4, overdue: 2, mine_open: 3 });
    if (pathname in BODIES) return json(BODIES[pathname]);
    const status = searchParams.get('status');
    const key = status ? `${pathname}?status=${status}` : pathname;
    const rows = LISTS[key] ?? [];
    return json({ count: COUNTS[key] ?? rows.length, next: null, previous: null, results: rows });
  });
});

const cardTitles = () =>
  screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

const card = (title: string) =>
  screen.getByRole('heading', { level: 3, name: title }).closest('article')!;

describe('Genel', () => {
  it('shows every card in the legacy order, linking where legacy did', () => {
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    expect(screen.getByRole('heading', { level: 1, name: 'Talepler' })).toBeInTheDocument();
    // Talepler (was Genel): Makineler, Mesailer, İzin, İSG and Tartışmalarım moved out.
    expect(cardTitles()).toEqual(['Departman Talepleri', 'Vinç Talepleri', 'Fason']);
    expect(within(card('Fason')).getByRole('link')).toHaveAttribute('href', '/general/fason');
    expect(within(card('Vinç Talepleri')).getByRole('link')).toHaveAttribute(
      'href',
      '/general/crane-requests',
    );
  });

  it('flags what waits on the user, and only where something does', async () => {
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    await waitFor(() =>
      expect(card('Departman Talepleri')).toHaveTextContent('2 onayınızı bekliyor'),
    );
    // Nothing waiting for a crane approval: no pill at all.
    expect(card('Vinç Talepleri')).not.toHaveTextContent('bekliyor');
    const pending = calls().filter((url) => url.pathname.endsWith('/pending_approval/'));
    // Only the queues behind its own cards: department and crane requests.
    expect(pending.map((url) => url.pathname).sort()).toEqual([
      '/cranes/requests/pending_approval/',
      '/planning/department-requests/pending_approval/',
    ]);
  });

  it('carries no leave, İSG or approval panels: those live in the user menu and their own sections', async () => {
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    await waitFor(() =>
      expect(card('Departman Talepleri')).toHaveTextContent('2 onayınızı bekliyor'),
    );
    expect(screen.queryByRole('heading', { name: 'Sizi Bekleyenler' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bu Hafta İzinde' })).not.toBeInTheDocument();
    expect(document.getElementById('leave-left')).toBeNull();
    expect(document.getElementById('isg-mine')).toBeNull();
    const asked = calls().map((url) => url.pathname);
    expect(
      asked.some((path) => path.startsWith('/vacation-requests/') || path.startsWith('/isg/')),
    ).toBe(false);
  });

  it('shows a user without request grants no cards, and asks nothing', async () => {
    access.granted = new Set();
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    expect(screen.getByRole('heading', { level: 1, name: 'Talepler' })).toBeInTheDocument();
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(calls()).toHaveLength(0);
  });
});

describe('Genel sub-hubs', () => {
  it('Mesai Talepleri: six cards, the pending one with its count', async () => {
    renderWithProviders(<OvertimeHubPage />, { route: '/human_resources/overtime/' });

    expect(cardTitles()).toEqual([
      'Bekleyen Talepler',
      'Kayıt Defteri',
      'Mesai Kullanıcıları',
      'Talaşlı İmalat Mesai Raporu',
      'Kaynaklı İmalat Mesai Raporu',
      'Mesai Maliyet Raporu',
    ]);
    await waitFor(() =>
      expect(card('Bekleyen Talepler')).toHaveTextContent('5 onayınızı bekliyor'),
    );
  });

  it('Mesai Talepleri: the coming approved overtime and this month by status, with the registry filters', async () => {
    LISTS['/overtime/requests/?status=approved'] = [
      {
        id: 71,
        team_label: 'Kaynaklı İmalat',
        reason: 'Sevkiyat',
        start_at: '2026-11-05T18:00:00+03:00',
        end_at: '2026-11-05T22:00:00+03:00',
        duration_hours: 4,
        total_users: 6,
      },
    ];
    renderWithProviders(<OvertimeHubPage />, { route: '/human_resources/overtime/' });

    const upcoming = screen.getByRole('heading', { name: 'Yaklaşan Mesailer' }).closest('section')!;
    const row = await within(upcoming).findByRole('link', { name: /Kaynaklı İmalat/ });
    expect(row).toHaveAttribute('href', '/human_resources/overtime/registry?request=71');
    expect(row).toHaveTextContent('4 sa · 6 kişi');

    const list = calls().find(
      (url) => url.pathname === '/overtime/requests/' && url.searchParams.get('ordering'),
    )!;
    expect(list.searchParams.get('status')).toBe('approved');
    expect(list.searchParams.get('ordering')).toBe('start_at');
    expect(list.searchParams.get('start_at__gte')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const counted = calls().filter(
      (url) => url.pathname === '/overtime/requests/' && url.searchParams.get('page_size') === '1',
    );
    expect(counted.map((url) => url.searchParams.get('status')).sort()).toEqual([
      'approved',
      'rejected',
      'submitted',
    ]);
    expect(
      counted.every((url) => url.searchParams.get('start_at__lte')?.endsWith('T23:59:59')),
    ).toBe(true);
    const month = within(document.getElementById('overtime-month')!).getByRole('link');
    expect(month.getAttribute('href')).toMatch(
      /^\/human_resources\/overtime\/registry\?status=approved&start_date=\d{4}-\d{2}-01&end_date=/,
    );
    expect(calls().some((url) => url.pathname.startsWith('/overtime/users-for-date/'))).toBe(true);
  });

  it('Mesai Talepleri: a user with only the reports sees only those, and no count is asked for', () => {
    access.granted = new Set(['/human_resources/overtime/cost-report']);
    renderWithProviders(<OvertimeHubPage />, { route: '/human_resources/overtime/' });

    expect(cardTitles()).toEqual(['Mesai Maliyet Raporu']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('İzin Talepleri: two cards, the pending one counted', async () => {
    renderWithProviders(<VacationHubPage />, { route: '/general/vacation/' });

    expect(cardTitles()).toEqual(['İzin Taleplerim', 'Bekleyen Onaylar']);
    await waitFor(() => expect(card('Bekleyen Onaylar')).toHaveTextContent('0 onayınızı bekliyor'));
  });

  it("İzin Talepleri: the user's latest requests and the annual leave balance", async () => {
    BODIES['/vacation-requests/my-summary/'] = {
      annual_leave: { total_days: 20, used_days: 6, remaining_days: 14 },
      upcoming_leave: { leave_type_label: 'Yıllık İzin', start_date: '2026-11-20' },
    };
    LISTS['/vacation-requests/requests/'] = [
      {
        id: 8,
        leave_type_label: 'Yıllık İzin',
        status: 'submitted',
        status_label: 'Onay Bekliyor',
        start_date: '2026-11-20',
        end_date: '2026-11-21',
        duration_days: 2,
      },
    ];
    renderWithProviders(<VacationHubPage />, { route: '/general/vacation/' });

    await waitFor(() =>
      expect(card('İzin Taleplerim')).toHaveTextContent('14 gün izin hakkınız kaldı'),
    );
    const mine = screen.getByRole('heading', { name: 'Son Taleplerim' }).closest('section')!;
    const row = await within(mine).findByRole('link', { name: /Yıllık İzin/ });
    expect(row).toHaveAttribute('href', '/general/vacation/requests?request_id=8');
    expect(row).toHaveTextContent('Onay Bekliyor');
    const request = calls().find((url) => url.pathname === '/vacation-requests/requests/')!;
    expect(request.searchParams.get('mine')).toBe('true');

    const balance = screen
      .getByRole('heading', { name: 'Yıllık İzin Bakiyem' })
      .closest('section')!;
    expect(balance).toHaveTextContent('Kullanılan6');
    expect(balance).toHaveTextContent('Kalan14');
    expect(balance).toHaveTextContent('Sıradaki: Yıllık İzin');
  });
});
