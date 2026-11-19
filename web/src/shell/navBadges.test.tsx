import { authedFetch } from '@/auth/authService';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { badgeCount, NavBadgesProvider, useNavBadgeCount, useWaitingSummary } from './navBadges';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
vi.mock('@/auth/accessControl', () => ({ hasRouteAccess: () => true }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 7, username: 'ayse', department_code: 'procurement' } }) }));

const fetchMock = vi.mocked(authedFetch);
const body = (count: number) => ({ count, next: null, previous: null, results: [] });

const leaf = { label: 'Bekleyenler', icon: 'fas fa-clock', children: {} };
const section = { label: 'Satın Alma', icon: 'fas fa-cart', children: { '/procurement/purchase-requests/pending': leaf } };

describe('badgeCount', () => {
  const waiting = new Map([['/procurement/purchase-requests/pending', 4], ['/procurement/payment-lists', 2]]);

  it('counts an entry\'s own queue and everything below it', () => {
    expect(badgeCount('/procurement/purchase-requests/pending', leaf, waiting)).toBe(4);
    expect(badgeCount('/procurement', section, waiting)).toBe(4);
    expect(badgeCount('/procurement', { ...section, children: { ...section.children, '/procurement/payment-lists': leaf } }, waiting)).toBe(6);
  });

  it('is zero for entries with nothing waiting', () => {
    expect(badgeCount('/sales', { label: 'Satış', icon: '', children: {} }, waiting)).toBe(0);
  });
});

function Probe() {
  const countFor = useNavBadgeCount();
  const { total, anyQueue } = useWaitingSummary();
  return (
    <>
      <output aria-label="Satın Alma">{countFor('/procurement', section)}</output>
      <output aria-label="Toplam">{anyQueue ? total : '-'}</output>
    </>
  );
}

describe('NavBadgesProvider', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('reads the waiting approvals (and the unread count) the home page reads, and shows them on the sections that hold them', async () => {
    fetchMock.mockImplementation((url) => {
      const { pathname } = new URL(String(url));
      const json =
        pathname === '/procurement/purchase-requests/pending_approval/'
          ? body(5)
          : pathname === '/notifications/unread_count/'
            ? { count: 2 }
            : pathname === '/approvals/inbox/'
              ? []
              : body(0);
      return Promise.resolve(new Response(JSON.stringify(json), { status: 200 }));
    });
    renderWithProviders(
      <NavBadgesProvider>
        <Probe />
      </NavBadgesProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText('Satın Alma')).toHaveTextContent('5'));
  });

  it('sums every queue for the avatar and Onaylar, the cross-domain inbox included', async () => {
    fetchMock.mockImplementation((url) => {
      const { pathname } = new URL(String(url));
      const json =
        pathname === '/procurement/purchase-requests/pending_approval/'
          ? body(5)
          : pathname === '/overtime/requests/pending_approval/'
            ? body(2)
            : pathname === '/notifications/unread_count/'
              ? { count: 0 }
              : pathname === '/approvals/inbox/'
                ? [{ workflow_id: 1, subject_type: 'procurement.paymentlist', subject_id: 4 }]
                : body(0);
      return Promise.resolve(new Response(JSON.stringify(json), { status: 200 }));
    });
    renderWithProviders(
      <NavBadgesProvider>
        <Probe />
      </NavBadgesProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('Toplam')).toHaveTextContent('8'));
  });
});
