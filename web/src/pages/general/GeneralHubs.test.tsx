import { authedFetch } from '@/auth/authService';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CraneRequestsHubPage } from './CraneRequestsHubPage';
import { DepartmentRequestsHubPage } from './DepartmentRequestsHubPage';
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

    expect(screen.getByRole('heading', { level: 1, name: 'Genel Modülü' })).toBeInTheDocument();
    expect(cardTitles()).toEqual([
      'Makineler',
      'Mesailer',
      'İzin Talepleri',
      'Departman Talepleri',
      'Vinç Talepleri',
      'İSG Bildirimleri',
      'Tartışmalarım',
    ]);
    expect(within(card('Vinç Talepleri')).getByRole('link')).toHaveAttribute(
      'href',
      '/general/crane-requests',
    );
    expect(within(card('İSG Bildirimleri')).getByRole('link')).toHaveAttribute(
      'href',
      '/isg/issues',
    );
  });

  it('flags what waits on the user, and only where something does', async () => {
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    await waitFor(() => expect(card('Mesailer')).toHaveTextContent('5 onayınızı bekliyor'));
    await waitFor(() => expect(card('İSG Bildirimleri')).toHaveTextContent('3 size atanmış'));
    await waitFor(() =>
      expect(card('Departman Talepleri')).toHaveTextContent('2 onayınızı bekliyor'),
    );
    // Nothing waiting for a vacation approval: no pill at all.
    expect(card('İzin Talepleri')).not.toHaveTextContent('bekliyor');
    const pending = calls().filter((url) => url.pathname.endsWith('/pending_approval/'));
    expect(pending.map((url) => url.searchParams.get('page_size'))).toEqual(['1', '1', '1', '1']);
  });

  it('gathers every queue waiting on the user in Sizi Bekleyenler, each linking to its list', async () => {
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    const panel = screen.getByRole('heading', { name: 'Sizi Bekleyenler' }).closest('section')!;
    const row = (name: RegExp) => within(panel).getByRole('link', { name });
    await waitFor(() => expect(row(/Mesai talepleri/)).toHaveTextContent('5'));
    expect(row(/Mesai talepleri/)).toHaveAttribute('href', '/general/overtime/pending');
    await waitFor(() => expect(row(/Departman talepleri/)).toHaveTextContent('2'));
    await waitFor(() => expect(row(/Vinç talepleri/)).toHaveAttribute('data-idle', 'true'));
    expect(row(/İSG aksiyonları/)).toHaveAttribute('href', '/isg/issues?mine=true');
  });

  it('shows the leave balance on the band and who is away this week', async () => {
    BODIES['/vacation-requests/my-summary/'] = {
      annual_leave: { total_days: 20, used_days: 7.5, remaining_days: 12.5 },
    };
    BODIES['/vacation-requests/upcoming-leaves/'] = {
      count: 1,
      results: [
        {
          id: 3,
          full_name: 'Ayşe Yılmaz',
          team_label: 'Satın Alma',
          leave_type_label: 'Yıllık İzin',
          start_date: '2026-11-04',
          end_date: '2026-11-06',
        },
      ],
    };
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    await waitFor(() => expect(document.getElementById('leave-left')).toHaveTextContent('12,5'));
    const away = screen.getByRole('heading', { name: 'Bu Hafta İzinde' }).closest('section')!;
    await within(away).findByText('Ayşe Yılmaz');
    expect(away).toHaveTextContent('Satın Alma · Yıllık İzin');
    const leaves = calls().find((url) => url.pathname === '/vacation-requests/upcoming-leaves/')!;
    const from = leaves.searchParams.get('from_date')!;
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(leaves.searchParams.get('to_date')! >= from).toBe(true);
  });

  it('shows a user without Genel grants only the open cards, and asks nothing it cannot show', async () => {
    access.granted = new Set();
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    expect(cardTitles()).toEqual(['İSG Bildirimleri', 'Tartışmalarım']);
    await waitFor(() => expect(card('İSG Bildirimleri')).toHaveTextContent('3 size atanmış'));
    expect(calls().map((url) => url.pathname)).toEqual(['/isg/issues/summary/']);
    expect(screen.queryByRole('heading', { name: 'Bu Hafta İzinde' })).not.toBeInTheDocument();
    expect(document.getElementById('leave-left')).toBeNull();
  });
});

describe('Genel sub-hubs', () => {
  it('Mesai Talepleri: six cards, the pending one with its count', async () => {
    renderWithProviders(<OvertimeHubPage />, { route: '/general/overtime/' });

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
    renderWithProviders(<OvertimeHubPage />, { route: '/general/overtime/' });

    const upcoming = screen.getByRole('heading', { name: 'Yaklaşan Mesailer' }).closest('section')!;
    const row = await within(upcoming).findByRole('link', { name: /Kaynaklı İmalat/ });
    expect(row).toHaveAttribute('href', '/general/overtime/registry?request=71');
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
      /^\/general\/overtime\/registry\?status=approved&start_date=\d{4}-\d{2}-01&end_date=/,
    );
    expect(calls().some((url) => url.pathname.startsWith('/overtime/users-for-date/'))).toBe(true);
  });

  it('Mesai Talepleri: a user with only the reports sees only those, and no count is asked for', () => {
    access.granted = new Set(['/general/overtime/cost-report']);
    renderWithProviders(<OvertimeHubPage />, { route: '/general/overtime/' });

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

  it("Vinç Talepleri: the user's own requests and the requests by status", async () => {
    COUNTS['/cranes/requests/?status=approved'] = 4;
    BODIES['/cranes/requests/my_requests/'] = {
      count: 1,
      results: [
        {
          id: 5,
          request_number: 'VT-0005',
          crane_type_name: 'Mobil Vinç 50t',
          job_no: '265-01',
          status: 'approved',
          needed_date: '2026-11-07',
        },
      ],
    };
    renderWithProviders(<CraneRequestsHubPage />, { route: '/general/crane-requests/' });

    const mine = screen.getByRole('heading', { name: 'Son Taleplerim' }).closest('section')!;
    const row = await within(mine).findByRole('link', { name: /VT-0005/ });
    expect(row).toHaveAttribute('href', '/general/crane-requests/list?request=5');
    expect(within(mine).getByRole('link', { name: /Tümü/ })).toHaveAttribute(
      'href',
      '/general/crane-requests/list?requestor=42',
    );
    await waitFor(() => expect(document.getElementById('crane-approved')).toHaveTextContent('4'));
    const status = screen.getByRole('heading', { name: 'Talep Durumu' }).closest('section')!;
    expect(within(status).getByRole('link', { name: /Tamamlandı/ })).toHaveAttribute(
      'href',
      '/general/crane-requests/list?status=completed',
    );
    delete COUNTS['/cranes/requests/?status=approved'];
  });

  it('Vinç and Departman Talepleri: their cards and links', () => {
    const { unmount } = renderWithProviders(<CraneRequestsHubPage />, {
      route: '/general/crane-requests/',
    });
    expect(cardTitles()).toEqual(['Tüm Talepler', 'Bekleyen Talepler', 'Fiyat Listesi']);
    expect(within(card('Fiyat Listesi')).getByRole('link')).toHaveAttribute(
      'href',
      '/general/crane-requests/prices',
    );
    unmount();

    renderWithProviders(<DepartmentRequestsHubPage />, { route: '/general/department-requests/' });
    expect(cardTitles()).toEqual(['Tüm Talepler', 'Bekleyen Talepler']);
    expect(within(card('Bekleyen Talepler')).getByRole('link')).toHaveAttribute(
      'href',
      '/general/department-requests/pending',
    );
  });
});
