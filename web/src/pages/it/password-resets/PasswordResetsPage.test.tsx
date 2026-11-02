import { authedFetch } from '@legacy/authService.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PasswordResetsPage } from './PasswordResetsPage';

vi.mock('@legacy/authService.js', () => ({ authedFetch: vi.fn() }));
vi.mock('@legacy/base.js', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, username: 'admin' }, isAdmin: auth.isAdmin }) }));

const fetchMock = vi.mocked(authedFetch);

const REQUESTS = [
  { id: 7, username: 'ayse', first_name: 'Ayşe', last_name: 'Kaya', email: 'ayse@gemkom.com', team: 'machining', user_groups: ['Operatör'] },
  { id: 8, username: 'mehmet', first_name: 'Mehmet', last_name: 'Demir', email: 'mehmet@gemkom.com', team: 'welding' },
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({ path: new URL(String(url)).pathname, method: init?.method ?? 'GET' }));

beforeEach(() => {
  auth.isAdmin = true;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/users/forgot-password/list/') return json(REQUESTS);
    if (init?.method === 'POST' && path === '/users/forgot-password/7') return json({ temp_password: 'Gk-48213' });
    if (init?.method === 'POST') return json({ detail: 'Kullanıcı bulunamadı.' }, 404);
    return json({ detail: 'not mocked' }, 404);
  });
});

it('lists the requests with the legacy columns', async () => {
  renderWithProviders(<PasswordResetsPage />);
  expect(screen.getByText('Şifre Sıfırlama Talepleri')).toBeInTheDocument();
  expect(await screen.findByText('ayse')).toBeInTheDocument();
  expect(screen.getByText('mehmet@gemkom.com')).toBeInTheDocument();
  for (const header of ['Kullanıcı Adı', 'Ad', 'Soyad', 'E-posta', 'Takım']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }
  expect(within(document.getElementById('password-reset-count')!).getByText('2')).toBeInTheDocument();
});

it('resets only after the confirm and shows the temporary password once', async () => {
  renderWithProviders(<PasswordResetsPage />);
  await screen.findByText('ayse');

  fireEvent.click(screen.getAllByRole('button', { name: 'Şifreyi Sıfırla' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Şifre Sıfırlama Onayı' });
  expect(within(dialog).getByText('Ayşe Kaya')).toBeInTheDocument();
  expect(within(dialog).getByText('Operatör')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'POST')).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Şifreyi Sıfırla' }));
  expect(await screen.findByText('Şifre Başarıyla Sıfırlandı')).toBeInTheDocument();
  expect(screen.getByTestId('temp-password')).toHaveTextContent('Gk-48213');
  expect(calls().filter((c) => c.method === 'POST').map((c) => c.path)).toEqual(['/users/forgot-password/7']);
  // The list reloads, as legacy did after a reset.
  await waitFor(() => expect(calls().filter((c) => c.path === '/users/forgot-password/list/')).toHaveLength(2));
});

it('shows the backend detail when the reset fails', async () => {
  renderWithProviders(<PasswordResetsPage />);
  await screen.findByText('mehmet');
  fireEvent.click(screen.getAllByRole('button', { name: 'Şifreyi Sıfırla' })[1]!);
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Şifreyi Sıfırla' }));
  expect(await screen.findByText('Şifre Sıfırlama Hatası')).toBeInTheDocument();
  expect(screen.getByText('Kullanıcı bulunamadı.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tekrar Dene' })).toBeInTheDocument();
});

it('is closed to non-admins, as the legacy isAdmin() check was', () => {
  auth.isAdmin = false;
  renderWithProviders(<PasswordResetsPage />);
  expect(screen.getByText('Erişim yetkiniz yok')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
