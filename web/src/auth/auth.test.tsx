import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { theme } from '@/theme';
import { AuthProvider } from './AuthProvider';
import { RequireRoute, type RouteAccessHandle } from './RequireRoute';

const legacy = vi.hoisted(() => ({
  loggedIn: true,
  mustReset: false,
  allowedRoutes: new Set<string>(['/sales/customers']),
  grantedPages: new Set<string>(),
  permissions: {} as Record<string, boolean>,
  navigateTo: vi.fn(),
  rememberReturnUrl: vi.fn(),
}));

vi.mock('@legacy/authService.js', () => ({
  ROUTES: { LOGIN: '/login/', RESET_PASSWORD: '/login/reset-password/', HOME: '/' },
  PERMISSIONS_REFRESHED_EVENT: 'permissions:refreshed',
  isLoggedIn: () => legacy.loggedIn,
  mustResetPassword: () => legacy.mustReset,
  isAdmin: () => false,
  isImpersonating: () => false,
  hasPerm: (code: string) => legacy.permissions[code] === true,
  getPermissions: () => legacy.permissions,
  getGrantedPageRoutes: () => legacy.grantedPages,
  ensurePermissions: async () => {},
  refreshPermissions: async () => ({ refreshed: false, changed: false }),
  getUser: async () => ({ id: 1, username: 'ayse' }),
  navigateTo: legacy.navigateTo,
  rememberReturnUrl: legacy.rememberReturnUrl,
}));

vi.mock('@legacy/apis/accessControl.js', () => ({
  hasRouteAccess: (route: string) => legacy.allowedRoutes.has(route),
}));

function renderGuarded(path: string, handle?: RouteAccessHandle) {
  const router = createMemoryRouter(
    [
      {
        path,
        handle,
        element: (
          <AuthProvider>
            <RequireRoute>
              <p>sayfa içeriği</p>
            </RequireRoute>
          </AuthProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  return render(
    <MantineProvider theme={theme}>
      <RouterProvider router={router} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  Object.assign(legacy, {
    loggedIn: true,
    mustReset: false,
    allowedRoutes: new Set(['/sales/customers']),
    grantedPages: new Set(),
    permissions: {},
  });
  legacy.navigateTo.mockClear();
  legacy.rememberReturnUrl.mockClear();
});

describe('AuthProvider + RequireRoute', () => {
  it('renders the page for a signed-in user with access', async () => {
    renderGuarded('/sales/customers');
    expect(await screen.findByText('sayfa içeriği')).toBeInTheDocument();
  });

  it('sends a signed-out user to login and remembers the page', () => {
    legacy.loggedIn = false;
    renderGuarded('/sales/customers');
    expect(legacy.rememberReturnUrl).toHaveBeenCalled();
    expect(legacy.navigateTo).toHaveBeenCalledWith('/login/');
    expect(screen.queryByText('sayfa içeriği')).not.toBeInTheDocument();
  });

  it('sends a user who must reset their password to the reset page', () => {
    legacy.mustReset = true;
    renderGuarded('/sales/customers');
    expect(legacy.navigateTo).toHaveBeenCalledWith('/login/reset-password/');
  });

  it('explains instead of rendering when the route is not granted', async () => {
    legacy.allowedRoutes = new Set();
    renderGuarded('/sales/customers');
    await waitFor(() => expect(screen.getByText('Erişim yetkiniz yok')).toBeInTheDocument());
    expect(screen.queryByText('sayfa içeriği')).not.toBeInTheDocument();
  });
});

describe('hub routes', () => {
  it('open for a user granted any page under them', async () => {
    legacy.allowedRoutes = new Set();
    legacy.grantedPages = new Set(['/sales/customers']);
    renderGuarded('/sales', { access: 'hub' });
    expect(await screen.findByText('sayfa içeriği')).toBeInTheDocument();
  });

  it('open for legacy boolean codenames under them', async () => {
    legacy.allowedRoutes = new Set();
    legacy.permissions = { access_sales_customers: true };
    renderGuarded('/sales', { access: 'hub' });
    expect(await screen.findByText('sayfa içeriği')).toBeInTheDocument();
  });

  it('stay closed when nothing under them is granted', async () => {
    legacy.allowedRoutes = new Set();
    legacy.grantedPages = new Set(['/salesforce', '/finance/purchase-orders']);
    renderGuarded('/sales', { access: 'hub' });
    expect(await screen.findByText('Erişim yetkiniz yok')).toBeInTheDocument();
  });

  it('need the page grant itself without the hub handle', async () => {
    legacy.allowedRoutes = new Set();
    legacy.grantedPages = new Set(['/sales/customers']);
    renderGuarded('/sales');
    expect(await screen.findByText('Erişim yetkiniz yok')).toBeInTheDocument();
  });
});
