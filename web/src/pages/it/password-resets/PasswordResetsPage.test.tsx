import { authedFetch } from '@/auth/authService';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { notify } from '@/ui';
import { PasswordResetsPage } from './PasswordResetsPage';

vi.mock('@/auth/authService', () => ({ authedFetch: vi.fn() }));
vi.mock('@/lib/backend', () => ({ backendBase: 'https://api.test' }));
const auth = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, username: 'admin' }, isAdmin: auth.isAdmin }) }));

const fetchMock = vi.mocked(authedFetch);

// The real /users/forgot-password/list/ shape: an envelope, department_code (no team).
const user = (id: number, username: string, first_name: string, last_name: string, department_code: string) => ({
  id,
  username,
  first_name,
  last_name,
  email: `${username}@gemkom.com`,
  is_superuser: false,
  department_code,
  reset_password_request: true,
  must_reset_password: false,
});
const REQUESTS = {
  count: 2,
  next: null,
  previous: null,
  results: [user(7, 'ayse', 'Ayşe', 'Kaya', 'rollingmill'), user(8, 'mehmet', 'Mehmet', 'Demir', 'accounting')],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => ({ path: new URL(String(url)).pathname, method: init?.method ?? 'GET' }));

const cancelled = new Set<number>();

beforeEach(() => {
  auth.isAdmin = true;
  cancelled.clear();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === '/users/forgot-password/list/') {
      const results = REQUESTS.results.filter((r) => !cancelled.has(r.id));
      return json({ ...REQUESTS, count: results.length, results });
    }
    if (init?.method === 'POST' && path === '/users/forgot-password/7') return json({ temp_password: 'Gk-48213' });
    if (init?.method === 'DELETE' && path === '/users/forgot-password/7') {
      cancelled.add(7);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (init?.method === 'DELETE') return json({ detail: 'Yetkiniz yok.' }, 403);
    if (init?.method === 'POST') return json({ detail: 'Kullanıcı bulunamadı.' }, 404);
    return json({ detail: 'not mocked' }, 404);
  });
});

it('lists the requests with the legacy columns', async () => {
  renderWithProviders(<PasswordResetsPage />);
  expect(screen.getByText('Şifre Sıfırlama Talepleri')).toBeInTheDocument();
  expect(await screen.findByText('ayse')).toBeInTheDocument();
  expect(screen.getByText('mehmet@gemkom.com')).toBeInTheDocument();
  for (const header of ['Kullanıcı Adı', 'Ad', 'Soyad', 'E-posta', 'Departman']) {
    expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
  }
  expect(screen.getByText('Haddehane')).toBeInTheDocument();
  expect(screen.getByText('Muhasebe')).toBeInTheDocument();
  expect(within(document.getElementById('password-reset-count')!).getByText('2')).toBeInTheDocument();
});

it('resets only after the confirm and shows the temporary password once', async () => {
  renderWithProviders(<PasswordResetsPage />);
  await screen.findByText('ayse');

  fireEvent.click(screen.getAllByRole('button', { name: 'Şifreyi Sıfırla' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Şifre Sıfırlama Onayı' });
  expect(within(dialog).getByText('Ayşe Kaya')).toBeInTheDocument();
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

const withModals = () =>
  renderWithProviders(
    <ModalsProvider>
      <PasswordResetsPage />
    </ModalsProvider>,
  );

it('cancels a request only after the confirm, without touching the password', async () => {
  withModals();
  await screen.findByText('ayse');

  fireEvent.click(screen.getAllByRole('button', { name: 'İptal Et' })[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Talebi İptal Et' });
  expect(within(dialog).getByText('Ayşe Kaya (ayse)')).toBeInTheDocument();
  expect(calls().some((c) => c.method === 'DELETE')).toBe(false);

  fireEvent.click(within(dialog).getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() => expect(screen.queryByText('ayse')).not.toBeInTheDocument());
  expect(screen.getByText('mehmet')).toBeInTheDocument();
  expect(calls().filter((c) => c.method !== 'GET')).toEqual([{ path: '/users/forgot-password/7', method: 'DELETE' }]);
});

it('puts the row back when the cancel fails', async () => {
  const error = vi.spyOn(notify, 'error');
  withModals();
  await screen.findByText('mehmet');
  fireEvent.click(screen.getAllByRole('button', { name: 'İptal Et' })[1]!);
  const dialog = await screen.findByRole('dialog', { name: 'Talebi İptal Et' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Evet, İptal Et' }));
  await waitFor(() => expect(error).toHaveBeenCalledWith('Yetkiniz yok.'));
  expect(await screen.findByText('mehmet')).toBeInTheDocument();
});

it('is closed to non-admins, as the legacy isAdmin() check was', () => {
  auth.isAdmin = false;
  renderWithProviders(<PasswordResetsPage />);
  expect(screen.getByText('Erişim yetkiniz yok')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
