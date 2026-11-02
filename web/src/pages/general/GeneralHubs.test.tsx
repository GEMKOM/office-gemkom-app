import { authedFetch } from '@legacy/authService.js';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { CraneRequestsHubPage } from './CraneRequestsHubPage';
import { DepartmentRequestsHubPage } from './DepartmentRequestsHubPage';
import { GeneralHubPage } from './GeneralHubPage';
import { OvertimeHubPage } from './OvertimeHubPage';
import { VacationHubPage } from './VacationHubPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));

// null: every route opens (admin); a set: only those routes (and the always-open ones).
const access = vi.hoisted(() => ({ granted: null as Set<string> | null }));
vi.mock('@legacy/apis/accessControl.js', () => ({
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
};

const calls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url)));

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  access.granted = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/isg/issues/summary/') return json({ total: 12, open: 4, overdue: 2, mine_open: 3 });
    return json({ count: COUNTS[pathname] ?? 0, next: null, previous: null, results: [] });
  });
});

const cardTitles = () =>
  screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

const card = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('article')!;

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
    expect(within(card('Vinç Talepleri')).getByRole('link')).toHaveAttribute('href', '/general/crane-requests');
    expect(within(card('İSG Bildirimleri')).getByRole('link')).toHaveAttribute('href', '/isg/issues');
  });

  it('flags what waits on the user, and only where something does', async () => {
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    await waitFor(() => expect(card('Mesailer')).toHaveTextContent('5 onayınızı bekliyor'));
    await waitFor(() => expect(card('İSG Bildirimleri')).toHaveTextContent('3 size atanmış'));
    // Nothing waiting for a vacation approval: no pill at all.
    expect(card('İzin Talepleri')).not.toHaveTextContent('bekliyor');
    const pending = calls().filter((url) => url.pathname.endsWith('/pending_approval/'));
    expect(pending.map((url) => url.searchParams.get('page_size'))).toEqual(['1', '1']);
  });

  it('shows a user without Genel grants only the open cards, and asks nothing it cannot show', async () => {
    access.granted = new Set();
    renderWithProviders(<GeneralHubPage />, { route: '/general/' });

    expect(cardTitles()).toEqual(['İSG Bildirimleri', 'Tartışmalarım']);
    await waitFor(() => expect(card('İSG Bildirimleri')).toHaveTextContent('3 size atanmış'));
    expect(calls().map((url) => url.pathname)).toEqual(['/isg/issues/summary/']);
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
    await waitFor(() => expect(card('Bekleyen Talepler')).toHaveTextContent('5 onayınızı bekliyor'));
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

  it('Vinç and Departman Talepleri: their cards and links', () => {
    const { unmount } = renderWithProviders(<CraneRequestsHubPage />, { route: '/general/crane-requests/' });
    expect(cardTitles()).toEqual(['Tüm Talepler', 'Bekleyen Talepler', 'Fiyat Listesi']);
    expect(within(card('Fiyat Listesi')).getByRole('link')).toHaveAttribute('href', '/general/crane-requests/prices');
    unmount();

    renderWithProviders(<DepartmentRequestsHubPage />, { route: '/general/department-requests/' });
    expect(cardTitles()).toEqual(['Tüm Talepler', 'Bekleyen Talepler']);
    expect(within(card('Bekleyen Talepler')).getByRole('link')).toHaveAttribute(
      'href',
      '/general/department-requests/pending',
    );
  });
});
