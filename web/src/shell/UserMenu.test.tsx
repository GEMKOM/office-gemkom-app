import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { UserMenu } from './UserMenu';

vi.mock('@/auth/authService', () => ({
  authedFetch: vi.fn(),
  logout: vi.fn(),
  stopImpersonation: vi.fn(),
}));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const access = vi.hoisted(() => ({ open: new Set<string>() }));
vi.mock('@/auth/accessControl', () => ({
  hasRouteAccess: (path: string) => access.open.has(path),
}));
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: 7, username: 'ayse', department_code: 'imalat' },
    isImpersonating: false,
  }),
  displayName: () => 'Ayşe Yılmaz',
}));
// The menu's approval counts (navBadges): 3 leave approvals, 2 overtime.
vi.mock('./navBadges', () => ({
  useNavBadgeCount:
    () =>
    (path: string): number =>
      ({ '/general/vacation/pending': 3, '/human_resources/overtime/pending': 2 })[path] ?? 0,
}));

const fetchMock = vi.mocked(authedFetch);

// The dropdown is still in its open transition (display: none) in jsdom.
const item = (menu: HTMLElement, label: string) => within(menu).getByText(label).closest('button')!;

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => {
    const path = new URL(String(url)).pathname;
    const count = path.startsWith('/vacation-requests/') ? 3 : 2;
    return json({ count, next: null, previous: null, results: [] });
  });
});

it('holds the user’s own requests and the approvals waiting on them, counted', async () => {
  access.open = new Set([
    '/general/vacation/requests',
    '/human_resources/overtime/registry',
    '/general/vacation/pending',
    '/human_resources/overtime/pending',
  ]);
  renderWithProviders(<UserMenu />);
  // The avatar wears the approvals waiting in the pop-up.
  const avatar = screen.getByRole('button', { name: 'Ayşe Yılmaz, 5 onay bekliyor' });
  fireEvent.click(avatar);
  const menu = await screen.findByRole('menu', { hidden: true });
  expect(item(menu, 'İzin Taleplerim')).toBeInTheDocument();
  expect(item(menu, 'Mesai Taleplerim')).toBeInTheDocument();
  expect(within(menu).getByText('Onayımı Bekleyenler')).toBeInTheDocument();
  await waitFor(() => expect(item(menu, 'İzin Onayları')).toHaveTextContent('3'));
  await waitFor(() => expect(item(menu, 'Mesai Onayları')).toHaveTextContent('2'));
});

it('shows no approvals section to someone who approves nothing', async () => {
  access.open = new Set(['/general/vacation/requests']);
  renderWithProviders(<UserMenu />);
  fireEvent.click(screen.getByRole('button', { name: /Ayşe Yılmaz/ }));
  const menu = await screen.findByRole('menu', { hidden: true });
  expect(item(menu, 'İzin Taleplerim')).toBeInTheDocument();
  expect(within(menu).queryByText('Onayımı Bekleyenler')).not.toBeInTheDocument();
  expect(within(menu).queryByText('Mesai Taleplerim')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
