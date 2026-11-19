import { authedFetch } from '@/auth/authService';
import { fireEvent, screen, within } from '@testing-library/react';
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
// Everything waiting on the user, from the menu's approval counts (navBadges).
const waiting = vi.hoisted(() => ({ total: 0, anyQueue: false }));
vi.mock('./navBadges', () => ({ useWaitingSummary: () => waiting }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('./AppLink', () => ({ useAppNavigate: () => navigate }));

const fetchMock = vi.mocked(authedFetch);

// The dropdown is still in its open transition (display: none) in jsdom.
const item = (menu: HTMLElement, label: string) => within(menu).getByText(label).closest('button')!;

beforeEach(() => {
  fetchMock.mockReset();
  navigate.mockReset();
});

it('holds the user’s own requests and one Onaylar entry with every approval waiting, counted on the avatar too', async () => {
  access.open = new Set(['/general/vacation/requests', '/human_resources/overtime/registry']);
  waiting.total = 9;
  waiting.anyQueue = true;
  renderWithProviders(<UserMenu />);
  // The avatar wears everything waiting, not only leave and overtime.
  const avatar = screen.getByRole('button', { name: 'Ayşe Yılmaz, 9 onay bekliyor' });
  fireEvent.click(avatar);
  const menu = await screen.findByRole('menu', { hidden: true });
  expect(item(menu, 'İzin Taleplerim')).toBeInTheDocument();
  expect(item(menu, 'Mesai Taleplerim')).toBeInTheDocument();
  expect(within(menu).queryByText('Onayımı Bekleyenler')).not.toBeInTheDocument();
  expect(within(menu).queryByText('İzin Onayları')).not.toBeInTheDocument();
  const approvals = item(menu, 'Onaylar');
  expect(approvals).toHaveTextContent('9');
  fireEvent.click(approvals);
  expect(navigate).toHaveBeenCalledWith('/approvals');
  // The counts are the menu's own: the pop-up asks for nothing.
  expect(fetchMock).not.toHaveBeenCalled();
});

it('shows Onaylar without a bubble when nothing waits', async () => {
  access.open = new Set();
  waiting.total = 0;
  waiting.anyQueue = true;
  renderWithProviders(<UserMenu />);
  fireEvent.click(screen.getByRole('button', { name: 'Ayşe Yılmaz' }));
  const menu = await screen.findByRole('menu', { hidden: true });
  expect(item(menu, 'Onaylar')).not.toHaveTextContent(/\d/);
});

it('shows no Onaylar to someone who approves nothing', async () => {
  access.open = new Set(['/general/vacation/requests']);
  waiting.total = 0;
  waiting.anyQueue = false;
  renderWithProviders(<UserMenu />);
  fireEvent.click(screen.getByRole('button', { name: /Ayşe Yılmaz/ }));
  const menu = await screen.findByRole('menu', { hidden: true });
  expect(item(menu, 'İzin Taleplerim')).toBeInTheDocument();
  expect(within(menu).queryByText('Onaylar')).not.toBeInTheDocument();
  expect(within(menu).queryByText('Mesai Taleplerim')).not.toBeInTheDocument();
});
