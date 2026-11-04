// The session rules the legacy authService.js had, checked on the TypeScript
// port: the same storage keys, one shared token refresh, the cross-tab cases
// and the permission cache. A session started before the port carries on.

type AuthModule = typeof import('./authService');

const API = 'http://127.0.0.1:8001';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let auth: AuthModule;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function calls(path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url) === `${API}${path}`);
}

function authHeader(call: Parameters<typeof fetch>) {
  return (call[1]?.headers as Record<string, string>)['Authorization'];
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  vi.resetModules();
  auth = await import('./authService');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function signIn(access = 'a1', refresh = 'r1') {
  localStorage.setItem('accessToken', access);
  localStorage.setItem('refreshToken', refresh);
}

describe('authedFetch', () => {
  it('sends the bearer token, the subdomain and a JSON content type', async () => {
    signIn();
    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await auth.authedFetch(`${API}/x/`);
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers).toMatchObject({
      Authorization: 'Bearer a1',
      'X-Subdomain': 'ofis.gemcore.com.tr',
      'Content-Type': 'application/json',
    });
  });

  it('leaves the content type to the browser for FormData', async () => {
    signIn();
    fetchMock.mockResolvedValueOnce(json({}));
    await auth.authedFetch(`${API}/upload/`, { method: 'POST', body: new FormData() });
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('refreshes once for parallel 401s, keeps the rotated refresh token and retries', async () => {
    signIn();
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === `${API}/token/refresh/`) return json({ access: 'a2', refresh: 'r2' });
      if (String(url) === `${API}/users/me/permissions/`) return json({});
      const token = (init?.headers as Record<string, string>)['Authorization'];
      return token === 'Bearer a2' ? json({ ok: true }) : json({}, 401);
    });

    const [one, two] = await Promise.all([
      auth.authedFetch(`${API}/one/`),
      auth.authedFetch(`${API}/two/`),
    ]);

    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(calls('/token/refresh/')).toHaveLength(1);
    expect(JSON.parse(String(calls('/token/refresh/')[0]![1]!.body))).toEqual({ refresh: 'r1' });
    expect(localStorage.getItem('accessToken')).toBe('a2');
    expect(localStorage.getItem('refreshToken')).toBe('r2');
  });

  it("uses another tab's newer access token instead of refreshing again", async () => {
    signIn();
    fetchMock.mockImplementationOnce(async () => {
      localStorage.setItem('accessToken', 'from-other-tab');
      return json({}, 401);
    });
    fetchMock.mockResolvedValueOnce(json({ ok: true }));

    const res = await auth.authedFetch(`${API}/x/`);

    expect(res.status).toBe(200);
    expect(calls('/token/refresh/')).toHaveLength(0);
    expect(authHeader(fetchMock.mock.calls[1]!)).toBe('Bearer from-other-tab');
  });

  it("carries on with another tab's new login when its own refresh token is rejected", async () => {
    signIn('a1', 'old');
    fetchMock.mockImplementation(async (url, init) => {
      const u = String(url);
      if (u === `${API}/token/refresh/`) {
        const sent = JSON.parse(String(init?.body)).refresh;
        if (sent === 'old') {
          localStorage.setItem('refreshToken', 'new-login');
          return json({ detail: 'expired' }, 401);
        }
        return json({ access: 'a-new' });
      }
      if (u === `${API}/users/me/permissions/`) return json({});
      const token = (init?.headers as Record<string, string>)['Authorization'];
      return token === 'Bearer a-new' ? json({ ok: true }) : json({}, 401);
    });

    const res = await auth.authedFetch(`${API}/x/`);

    expect(res.status).toBe(200);
    expect(localStorage.getItem('refreshToken')).toBe('new-login');
    expect(localStorage.getItem('accessToken')).toBe('a-new');
  });

  it('ends the session when the refresh token is rejected, parking the page to come back to', async () => {
    window.history.replaceState(null, '', '/sales/offers/?offer_no=7#x');
    signIn();
    localStorage.setItem('permissions', '{}');
    localStorage.setItem('user', '{"id":1}');
    fetchMock.mockImplementation(async (url) =>
      String(url) === `${API}/token/refresh/` ? json({}, 401) : json({}, 401),
    );

    await expect(auth.authedFetch(`${API}/x/`)).rejects.toThrow('Session expired');

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('permissions')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(auth.takeReturnUrl()).toBe('/sales/offers/?offer_no=7#x');
    window.history.replaceState(null, '', '/');
  });

  it('keeps the session through a refresh outage (5xx)', async () => {
    signIn();
    fetchMock.mockImplementation(async (url) =>
      String(url) === `${API}/token/refresh/` ? json({}, 503) : json({}, 401),
    );

    await expect(auth.authedFetch(`${API}/x/`)).rejects.toThrow('Token refresh failed (503)');

    expect(localStorage.getItem('refreshToken')).toBe('r1');
    expect(localStorage.getItem('accessToken')).toBe('a1');
  });

  it('refreshes first when there is no access token (after stopImpersonation)', async () => {
    signIn('', 'r1');
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === `${API}/token/refresh/`) return json({ access: 'a2' });
      return json({ ok: true });
    });

    await auth.authedFetch(`${API}/x/`);

    expect(authHeader(calls('/x/')[0]!)).toBe('Bearer a2');
    expect(localStorage.getItem('refreshToken')).toBe('r1');
  });

  it('signs out on the portal gate 403 but not on an ordinary 403', async () => {
    signIn();
    fetchMock.mockResolvedValueOnce(json({ detail: 'nope' }, 403));
    const res = await auth.authedFetch(`${API}/x/`);
    expect(res.status).toBe(403);
    expect(auth.isLoggedIn()).toBe(true);

    fetchMock.mockResolvedValueOnce(json({ code: 'portal_forbidden' }, 403));
    await expect(auth.authedFetch(`${API}/x/`)).rejects.toThrow('FORBIDDEN');
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('throws without a refresh token', async () => {
    await expect(auth.authedFetch(`${API}/x/`)).rejects.toThrow('Not authenticated');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('stores the tokens, the user and the permissions', async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u === `${API}/token/`) return json({ access: 'a1', refresh: 'r1' });
      if (u === `${API}/users/me/`) return json({ id: 5, username: 'ayse' });
      if (u === `${API}/users/me/permissions/`)
        return json({ office_access: true, p1: { granted: true, name: 'Page: /sales/' } });
      return json({}, 404);
    });

    await auth.login('ayse', 'pw');

    expect(localStorage.getItem('accessToken')).toBe('a1');
    expect(localStorage.getItem('refreshToken')).toBe('r1');
    expect(JSON.parse(localStorage.getItem('user')!)).toMatchObject({ id: 5 });
    expect(auth.getGrantedPageRoutes()).toEqual(new Set(['/sales']));
    expect(Number(localStorage.getItem('permissionsFetchedAt'))).toBeGreaterThan(0);
  });

  it('refuses an account without office_access and signs it out', async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u === `${API}/token/`) return json({ access: 'a1', refresh: 'r1' });
      if (u === `${API}/users/me/`) return json({ id: 5 });
      return json({ something_else: true });
    });

    await expect(auth.login('x', 'y')).rejects.toThrow('FORBIDDEN');
    expect(auth.isLoggedIn()).toBe(false);
  });
});

describe('permission cache', () => {
  it('reads the cached payload: booleans, granted objects and "Page:" routes', () => {
    localStorage.setItem(
      'permissions',
      JSON.stringify({
        office_access: true,
        a: { granted: true, name: 'Page: /planning/ (Planlama)' },
        b: { granted: false, name: 'Page: /sales/' },
        c: { granted: true, name: 'Page: /reports?tab=1' },
      }),
    );
    expect(auth.hasPerm('office_access')).toBe(true);
    expect(auth.hasPerm('a')).toBe(true);
    expect(auth.hasPerm('b')).toBe(false);
    expect(auth.hasPerm('')).toBe(true);
    expect(auth.getGrantedPageRoutes()).toEqual(new Set(['/planning', '/reports']));
  });

  it('drops a corrupt payload', () => {
    localStorage.setItem('permissions', '{nope');
    expect(auth.getPermissions()).toEqual({});
    expect(localStorage.getItem('permissions')).toBeNull();
  });

  it("follows another tab's new payload and says whether the grants changed", () => {
    localStorage.setItem('permissions', JSON.stringify({ a: true }));
    expect(auth.hasPerm('b')).toBe(false);
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(auth.PERMISSIONS_REFRESHED_EVENT, listener);

    localStorage.setItem('permissions', JSON.stringify({ a: true, b: true }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'permissions' }));
    window.removeEventListener(auth.PERMISSIONS_REFRESHED_EVENT, listener);

    expect(auth.hasPerm('b')).toBe(true);
    expect(seen).toContainEqual({ changed: true, source: 'storage' });
  });

  it('refetches at most once a minute unless forced, and keeps the cache on failure', async () => {
    signIn();
    localStorage.setItem('permissions', JSON.stringify({ a: true }));
    localStorage.setItem('permissionsFetchedAt', String(Date.now()));

    expect(await auth.refreshPermissions()).toEqual({ refreshed: false, changed: false });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(json({}, 500));
    expect(await auth.refreshPermissions({ maxAgeMs: 0 })).toEqual({
      refreshed: false,
      changed: false,
    });
    expect(auth.hasPerm('a')).toBe(true);

    fetchMock.mockResolvedValueOnce(json({ a: true, b: true }));
    expect(await auth.refreshPermissions({ maxAgeMs: 0 })).toEqual({
      refreshed: true,
      changed: true,
    });
    expect(auth.hasPerm('b')).toBe(true);
  });
});

describe('session helpers', () => {
  it('reads roles from the cached user', () => {
    localStorage.setItem(
      'user',
      JSON.stringify({ is_superuser: true, must_reset_password: true, is_lead: true }),
    );
    expect(auth.isAdmin()).toBe(true);
    expect(auth.isSuperuser()).toBe(true);
    expect(auth.isLead()).toBe(true);
    expect(auth.mustResetPassword()).toBe(true);
  });

  it('lands each department on its home page', () => {
    const landing = (user: object) => {
      localStorage.setItem('user', JSON.stringify(user));
      return auth.teamLandingRoute();
    };
    expect(landing({ position: { department_code: 'procurement' } })).toBe(
      '/procurement/purchase-requests',
    );
    expect(landing({ department_code: 'machining' })).toBe('/manufacturing/machining/');
    expect(landing({ is_admin: true, department_code: 'machining' })).toBe('/');
    expect(landing({ department_code: 'design' })).toBe('/');
  });

  it('parks only same-origin, non-login paths, and hands each out once', () => {
    auth.rememberReturnUrl('//evil.example/x');
    expect(auth.takeReturnUrl()).toBeNull();
    auth.rememberReturnUrl('/login/reset-password/');
    expect(auth.takeReturnUrl()).toBeNull();
    auth.rememberReturnUrl('/procurement/?talep=SAT-1');
    expect(sessionStorage.getItem('postLoginReturnUrl')).toBe('/procurement/?talep=SAT-1');
    expect(auth.takeReturnUrl()).toBe('/procurement/?talep=SAT-1');
    expect(auth.takeReturnUrl()).toBeNull();
  });

  it("keeps the admin's own tokens while impersonating and restores them after", async () => {
    signIn('admin-a', 'admin-r');
    localStorage.setItem('user', JSON.stringify({ id: 1, is_superuser: true }));
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u === `${API}/users/impersonate/`) return json({ access: 'u-a', refresh: 'u-r' });
      if (u === `${API}/users/me/`) return json({ id: 9 });
      return json({ office_access: true });
    });

    await auth.impersonateUser(9);
    expect(auth.isImpersonating()).toBe(true);
    expect(localStorage.getItem('refreshToken')).toBe('u-r');
    expect(localStorage.getItem('impersonatorRefreshToken')).toBe('admin-r');
    expect(JSON.parse(localStorage.getItem('impersonatorUser')!)).toMatchObject({ id: 1 });

    fetchMock.mockImplementation(async (url) =>
      String(url) === `${API}/users/me/` ? json({ id: 1 }) : json({ office_access: true }),
    );
    await auth.stopImpersonation();
    expect(auth.isImpersonating()).toBe(false);
    expect(localStorage.getItem('accessToken')).toBe('admin-a');
    expect(localStorage.getItem('refreshToken')).toBe('admin-r');
  });
});
