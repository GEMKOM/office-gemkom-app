import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { theme } from '@/theme';
import { LoginPage, LOGIN_MESSAGES } from './LoginPage';
import { RESET_MESSAGES, ResetPasswordPage } from './ResetPasswordPage';

const legacy = vi.hoisted(() => ({
  loggedIn: false,
  mustReset: false,
  returnUrl: null as string | null,
  teamLanding: '/',
  login: vi.fn<(username: string, password: string) => Promise<unknown>>(),
  resetPassword: vi.fn<(password: string) => Promise<Response>>(),
  forgotPassword: vi.fn<(username: string) => Promise<Response>>(),
  getUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('@/auth/authService', () => ({
  ROUTES: { LOGIN: '/login/', RESET_PASSWORD: '/login/reset-password/', HOME: '/' },
  login: legacy.login,
  isLoggedIn: () => legacy.loggedIn,
  mustResetPassword: () => legacy.mustReset,
  shouldBeOnLoginPage: () => !legacy.loggedIn,
  shouldBeOnResetPasswordPage: () => legacy.loggedIn && legacy.mustReset,
  teamLandingRoute: () => legacy.teamLanding,
  // Read-and-clear, like the real one.
  takeReturnUrl: () => {
    const url = legacy.returnUrl;
    legacy.returnUrl = null;
    return url;
  },
  getUser: legacy.getUser,
  logout: legacy.logout,
}));

vi.mock('@/api/users', () => ({
  resetPassword: legacy.resetPassword,
  forgotPassword: legacy.forgotPassword,
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/login/reset-password', element: <ResetPasswordPage /> },
      { path: '/', element: <p>ana sayfa</p> },
      { path: '/sales/customers', element: <p>müşteriler sayfası</p> },
      { path: '/manufacturing/machining', element: <p>talaşlı imalat</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <MantineProvider theme={theme}>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
  return router;
}

function fillLogin(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: username } });
  fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Giriş Yap' }));
}

// login() leaves a signed-in session behind, as the real one does.
function loginSucceeds({ mustReset = false } = {}) {
  legacy.login.mockImplementation(async () => {
    legacy.loggedIn = true;
    legacy.mustReset = mustReset;
    return {};
  });
}

beforeEach(() => {
  legacy.loggedIn = false;
  legacy.mustReset = false;
  legacy.returnUrl = null;
  legacy.teamLanding = '/';
  legacy.login.mockReset();
  legacy.resetPassword.mockReset();
  legacy.forgotPassword.mockReset();
  legacy.getUser.mockReset();
  legacy.logout.mockReset();
  localStorage.clear();
});

describe('LoginPage', () => {
  it('signs in with the trimmed username and returns to the page that sent the user', async () => {
    legacy.returnUrl = '/sales/customers?musteri=12';
    loginSucceeds();
    const router = renderAt('/login');

    fillLogin('  ayse  ', ' gizli ');

    expect(await screen.findByText('müşteriler sayfası')).toBeInTheDocument();
    expect(legacy.login).toHaveBeenCalledWith('ayse', ' gizli ');
    expect(router.state.location.search).toBe('?musteri=12');
  });

  it("lands on the department's page when nothing is parked", async () => {
    legacy.teamLanding = '/manufacturing/machining/';
    loginSucceeds();
    renderAt('/login');

    fillLogin('ayse', 'gizli');

    expect(await screen.findByText('talaşlı imalat')).toBeInTheDocument();
  });

  it('shows the legacy message on a wrong password and stays on the form', async () => {
    legacy.login.mockRejectedValue(new Error('Login failed'));
    renderAt('/login');

    fillLogin('ayse', 'yanlis');

    expect(await screen.findByText(LOGIN_MESSAGES.badCredentials)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giriş Yap' })).toBeEnabled();
    // Typing again clears it.
    fireEvent.change(screen.getByLabelText('Şifre'), { target: { value: 'yeni' } });
    expect(screen.queryByText(LOGIN_MESSAGES.badCredentials)).not.toBeInTheDocument();
  });

  it('asks for the username, then the password, before calling the API', () => {
    renderAt('/login');

    fillLogin('   ', 'gizli');
    expect(screen.getByText(LOGIN_MESSAGES.noUsername)).toBeInTheDocument();
    expect(screen.getByLabelText('Kullanıcı Adı')).toHaveFocus();

    fillLogin('ayse', '   ');
    expect(screen.getByText(LOGIN_MESSAGES.noPassword)).toBeInTheDocument();
    expect(screen.getByLabelText('Şifre')).toHaveFocus();
    expect(legacy.login).not.toHaveBeenCalled();
  });

  it('sends a user who must reset the password to the reset page, keeping the parked URL', async () => {
    legacy.returnUrl = '/sales/customers';
    loginSucceeds({ mustReset: true });
    renderAt('/login');

    fillLogin('ayse', 'gecici');

    expect(await screen.findByRole('heading', { name: 'Şifre Sıfırla' })).toBeInTheDocument();
    expect(legacy.returnUrl).toBe('/sales/customers');
  });

  it('tells an account without office access that it is being sent away', async () => {
    legacy.login.mockRejectedValue(new Error('FORBIDDEN'));
    renderAt('/login');

    fillLogin('saha.user', 'gizli');

    expect(
      await screen.findByText('Bu sisteme erişim yetkiniz bulunmamaktadır.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tamam \(5\)/ })).toBeInTheDocument();
  });

  it('moves a signed-in user on to the parked URL', async () => {
    legacy.loggedIn = true;
    legacy.returnUrl = '/sales/customers';
    renderAt('/login');

    expect(await screen.findByText('müşteriler sayfası')).toBeInTheDocument();
  });

  it('warns about Caps Lock and can show the password', () => {
    renderAt('/login');
    const password = screen.getByLabelText('Şifre');

    fireEvent.keyDown(password, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock açık')).toBeInTheDocument();
    fireEvent.keyUp(password, { key: 'CapsLock', modifierCapsLock: false });
    expect(screen.queryByText('Caps Lock açık')).not.toBeInTheDocument();

    expect(password).toHaveAttribute('type', 'password');
    // Keyboard users reach the toggle with Tab and press it with Enter or Space.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Şifreyi göster' }), { key: 'Enter' });
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Şifreyi gizle' })).toBeInTheDocument();
  });

  it('sends a forgot-password request for the typed username', async () => {
    legacy.forgotPassword.mockResolvedValue(new Response('{}', { status: 200 }));
    renderAt('/login');

    fireEvent.change(screen.getByLabelText('Kullanıcı Adı'), { target: { value: 'ayse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Şifremi Unuttum' }));
    const dialog = await screen.findByRole('dialog', { name: 'Şifremi Unuttum' });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));

    expect(await screen.findByText(LOGIN_MESSAGES.forgotSent)).toBeInTheDocument();
    expect(legacy.forgotPassword).toHaveBeenCalledWith('ayse');
    expect(dialog).toBeInTheDocument();
  });
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    legacy.loggedIn = true;
    legacy.mustReset = true;
  });

  function fillReset(password: string, confirm: string) {
    fireEvent.change(screen.getByLabelText('Yeni Şifre'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Yeni Şifre (Tekrar)'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
  }

  it('saves the new password, clears the flag and goes on to the app', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 7, must_reset_password: true }));
    legacy.getUser.mockResolvedValue({ id: 7, username: 'ayse', must_reset_password: true });
    legacy.resetPassword.mockResolvedValue(new Response('{}', { status: 200 }));
    renderAt('/login/reset-password');

    fillReset('yenisifre', 'yenisifre');

    expect(await screen.findByText(RESET_MESSAGES.doneHome)).toBeInTheDocument();
    expect(legacy.resetPassword).toHaveBeenCalledWith('yenisifre');
    expect(JSON.parse(localStorage.getItem('user')!)).toMatchObject({
      id: 7,
      must_reset_password: false,
    });
    expect(await screen.findByText('ana sayfa', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('goes back to the parked URL after the reset', async () => {
    legacy.returnUrl = '/sales/customers';
    legacy.getUser.mockResolvedValue({ id: 7 });
    legacy.resetPassword.mockResolvedValue(new Response('{}', { status: 200 }));
    renderAt('/login/reset-password');

    fillReset('yenisifre', 'yenisifre');

    expect(await screen.findByText(RESET_MESSAGES.doneReturning)).toBeInTheDocument();
    expect(
      await screen.findByText('müşteriler sayfası', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it('checks length and match before calling the API', () => {
    renderAt('/login/reset-password');

    fillReset('  12345  ', '12345');
    expect(screen.getByText(RESET_MESSAGES.tooShort)).toBeInTheDocument();

    fillReset('123456', '1234567');
    expect(screen.getByText(RESET_MESSAGES.mismatch)).toBeInTheDocument();
    expect(legacy.resetPassword).not.toHaveBeenCalled();
  });

  it("shows the server's message when the reset is refused", async () => {
    legacy.resetPassword.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bu şifre çok yaygın.' }), { status: 400 }),
    );
    renderAt('/login/reset-password');

    fillReset('123456', '123456');

    expect(await screen.findByText('Bu şifre çok yaygın.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kaydet' })).toBeEnabled();
  });

  it('sends a signed-out visitor to the login page', async () => {
    legacy.loggedIn = false;
    renderAt('/login/reset-password');

    expect(await screen.findByRole('heading', { name: 'Ofis Çalışanları' })).toBeInTheDocument();
  });

  it('sends a user who needs no reset to the app', async () => {
    legacy.mustReset = false;
    renderAt('/login/reset-password');

    await waitFor(() => expect(screen.getByText('ana sayfa')).toBeInTheDocument());
  });
});
