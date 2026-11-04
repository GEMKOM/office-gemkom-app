// Session, tokens and permissions: sign-in, the authenticated fetch with its
// token refresh, impersonation, the parked post-login URL and the permission
// cache. Ported from the legacy authService.js with the same localStorage /
// sessionStorage keys and the same cross-tab rules, so a session started by
// the old file carries on here untouched:
//   accessToken, refreshToken            the tokens (localStorage is the only copy)
//   user, userTeam                       cached /users/me/
//   permissions, permissionsFetchedAt    cached /users/me/permissions/
//   impersonatorAccessToken, impersonatorRefreshToken, impersonatorUser
//   purchaseRequestDraft                 dropped on sign-out
//   postLoginReturnUrl (sessionStorage)  the deep link to land on after login

import { backendBase } from '@/lib/backend';

const API_URL = backendBase;
const SUBDOMAIN = 'ofis.gemcore.com.tr';

export interface AuthUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  is_superuser?: boolean;
  is_admin?: boolean;
  is_lead?: boolean;
  must_reset_password?: boolean;
  department_code?: string | null;
  position?: { department_code?: string | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export type PermissionValue = boolean | { granted: boolean; name?: string };
export type PermissionMap = Record<string, PermissionValue>;

// localStorage is the only copy of the tokens. Every tab shares it; a tab that
// kept its own copy from page load would keep sending -- and, once rejected,
// wipe -- tokens another tab has since refreshed or replaced with a new login.
function currentAccessToken(): string | null {
  return localStorage.getItem('accessToken');
}

function currentRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

// Cached permissions dictionary for the current user
let cachedPermissions: PermissionMap | null = null;
let cachedGrantedPageRoutes: Set<string> | null = null; // normalized routes

function isGrantObject(v: unknown): v is { granted?: unknown; name?: unknown } {
  return !!v && typeof v === 'object';
}

function hasPermissionInPayload(perms: unknown, codename: string): boolean {
  if (!codename) return true;
  if (!perms) return false;
  if (Array.isArray(perms)) return perms.includes(codename);
  if (typeof perms === 'object') {
    const v = (perms as Record<string, unknown>)[codename];
    if (v === true) return true;
    if (isGrantObject(v) && v.granted === true) return true;
    return false;
  }
  return false;
}

// Centralized routing to prevent infinite redirects
export const ROUTES = {
  LOGIN: '/login/',
  RESET_PASSWORD: '/login/reset-password/',
  HOME: '/',
  ADMIN: '/admin/',
  MACHINING: '/manufacturing/machining/',
  MACHINING_TASKS: '/manufacturing/machining/tasks/',
  MAINTENANCE: '/manufacturing/maintenance/',
  MANUFACTURING: '/manufacturing/',
  MANUFACTURING_WELDED: '/manufacturing/welded/',
} as const;

// Track if we're currently redirecting to prevent loops
let isRedirecting = false;

// Set only by a successful login (or impersonation switch) and reset after the
// first department-based navigation, so manual navigation is never redirected.
let isFreshLogin = false;
let inFlightUserPromise: Promise<AuthUser> | null = null;

export async function getUser(): Promise<AuthUser> {
  if (inFlightUserPromise) return inFlightUserPromise;

  // During impersonation we prefer a fresh /users/me/ read, because the cached user
  // may reflect the impersonator identity until a full page reload completes.
  if (!isImpersonating()) {
    const cachedUser = localStorage.getItem('user');
    if (cachedUser) {
      try {
        return JSON.parse(cachedUser) as AuthUser;
      } catch {
        console.warn('Failed to parse cached user data, falling back to API');
        localStorage.removeItem('user'); // Remove corrupted data
      }
    }
  }

  // Not cached: fetch from the API (concurrent calls share one request)
  inFlightUserPromise = (async () => {
    try {
      const response = await authedFetch(`${backendBase}/users/me/`);
      const userData = (await response.json()) as AuthUser;
      localStorage.setItem('user', JSON.stringify(userData));
      return userData;
    } catch (error) {
      console.error('Failed to fetch user data from API:', error);
      throw error;
    } finally {
      inFlightUserPromise = null;
    }
  })();

  return inFlightUserPromise;
}

// --- Permissions helpers ----------------------------------------------------

/**
 * Fetch current user's permissions from backend and cache them.
 * Called on login and can be used to refresh permissions after admin changes.
 */
export async function fetchAndStorePermissions(): Promise<PermissionMap | null> {
  try {
    const response = await authedFetch(`${backendBase}/users/me/permissions/`);
    if (!response.ok) {
      console.error('Failed to fetch permissions, status:', response.status);
      return null;
    }
    const perms = (await response.json()) as PermissionMap;
    cachedPermissions = perms;
    cachedGrantedPageRoutes = null; // recompute lazily
    localStorage.setItem('permissions', JSON.stringify(perms));
    localStorage.setItem(PERMISSIONS_FETCHED_AT_KEY, String(Date.now()));
    return perms;
  } catch (error) {
    console.error('Failed to fetch permissions from API:', error);
    return null;
  }
}

/** Permissions from memory/localStorage without a network call. */
export function getPermissions(): PermissionMap {
  if (cachedPermissions) {
    return cachedPermissions;
  }
  try {
    const stored = localStorage.getItem('permissions');
    if (!stored) return {};
    const perms = JSON.parse(stored) as PermissionMap;
    cachedPermissions = perms;
    cachedGrantedPageRoutes = null; // recompute lazily
    return perms;
  } catch {
    console.warn('Failed to parse cached permissions, clearing them');
    localStorage.removeItem('permissions');
    cachedPermissions = null;
    cachedGrantedPageRoutes = null;
    return {};
  }
}

/** "/a/?q=1#x" -> "/a/": everything from the first "?" or "#" on is dropped. */
function stripQueryAndHash(path: string): string {
  return path.replace(/[?#][\s\S]*$/, '');
}

function normalizeRouteForPermission(route: string | null | undefined): string | null {
  if (!route) return null;
  const noQuery = stripQueryAndHash(String(route)).trim();
  if (!noQuery.startsWith('/')) return null;
  if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
  return noQuery || '/';
}

function extractPageRouteFromName(name: unknown): string | null {
  if (!name || typeof name !== 'string') return null;
  const idx = name.indexOf('Page:');
  if (idx === -1) return null;
  const after = name.slice(idx + 'Page:'.length).trim();
  if (!after) return null;
  // "Page: /planning/" -> "/planning"; text after the path is ignored.
  const firstToken = (after.split(/\s+/)[0] ?? '').trim();
  return normalizeRouteForPermission(firstToken);
}

/**
 * Normalized routes (no trailing slash) granted by "Page:" permissions, e.g.
 * `{ granted: true, name: "Page: /planning/" }` grants "/planning".
 */
export function getGrantedPageRoutes(): Set<string> {
  if (cachedGrantedPageRoutes instanceof Set) return cachedGrantedPageRoutes;
  const perms = getPermissions();
  const routes = new Set<string>();

  for (const v of Object.values(perms || {})) {
    if (v === true) continue; // boolean-only permissions don't encode routes
    if (!isGrantObject(v)) continue;
    if (v.granted !== true) continue;
    const route = extractPageRouteFromName(v.name);
    if (route) routes.add(route);
  }

  cachedGrantedPageRoutes = routes;
  return routes;
}

/** Whether the current user holds the given permission codename. */
export function hasPerm(codename: string): boolean {
  if (!codename) return true;
  const perms = getPermissions();
  const v: unknown = perms[codename];
  if (v === true) return true;
  if (isGrantObject(v)) return v.granted === true;
  return false;
}

/**
 * Ensure permissions are present in localStorage; if missing, fetch them.
 * Useful for direct URL access / F5 on protected pages.
 */
export async function ensurePermissions(): Promise<void> {
  if (!isLoggedIn()) {
    return;
  }
  if (!localStorage.getItem('permissions')) {
    await fetchAndStorePermissions();
  }
}

// --- Background permission refresh -----------------------------------------
//
// The payload used to be fetched at login only, and rotating refresh tokens
// keep a session alive for weeks, so a page granted later (by a migration or
// via IT > Yetkiler) stayed invisible -- no menu entry, no landing card, route
// guard refusing -- until the user signed out and back in. The cache is now
// refreshed in the background: on page load (AuthProvider kicks it off,
// throttled so rapid navigation does not refetch each time), after every
// successful token refresh (a busy page gets one every ~5 minutes), and when
// another tab stores a fresh payload. The first paint still comes from the
// cache; PERMISSIONS_REFRESHED_EVENT tells listeners when the grants changed so
// they can re-render. A failed refetch (5xx, network blip) leaves the old
// cache in place: an outage is not a logout, and nothing is revoked on a guess.
export const PERMISSIONS_REFRESHED_EVENT = 'permissions:refreshed';
const PERMISSIONS_FETCHED_AT_KEY = 'permissionsFetchedAt';
const PERMISSIONS_MAX_AGE_MS = 60 * 1000;

export interface PermissionsRefreshResult {
  /** False when the fetch was skipped or failed. */
  refreshed: boolean;
  /** Whether the granted set differs from what this page was rendered with. */
  changed: boolean;
}

let permissionsRefreshInFlight: Promise<PermissionsRefreshResult> | null = null;

// Everything the UI derives from the payload, order-independent: which
// codenames are granted and the "Page: /route/" names the menus are built from.
function permissionSignature(perms: unknown): string {
  if (!perms || typeof perms !== 'object') return '';
  const granted: string[] = [];
  for (const [codename, v] of Object.entries(perms as Record<string, unknown>)) {
    if (v === true) {
      granted.push(codename);
    } else if (isGrantObject(v) && v.granted === true) {
      granted.push(`${codename}=${typeof v.name === 'string' ? v.name : ''}`);
    }
  }
  return granted.sort().join('|');
}

function permissionsFetchedAt(): number {
  const raw = Number(localStorage.getItem(PERMISSIONS_FETCHED_AT_KEY));
  return Number.isFinite(raw) ? raw : 0;
}

function announcePermissionsRefreshed(detail: { changed: boolean; source: 'fetch' | 'storage' }) {
  try {
    window.dispatchEvent(new CustomEvent(PERMISSIONS_REFRESHED_EVENT, { detail }));
  } catch (error) {
    console.warn('Permission refresh listeners failed:', error);
  }
}

/**
 * Refetch the signed-in user's permissions in the background and swap the
 * cache when they arrive. Never throws and never signs the user out on its
 * own; a failed fetch leaves the cached payload untouched.
 *
 * @param options.maxAgeMs skip the fetch while the cache is younger than this
 *   (default one minute); 0 forces it.
 */
export function refreshPermissions({
  maxAgeMs = PERMISSIONS_MAX_AGE_MS,
}: { maxAgeMs?: number } = {}): Promise<PermissionsRefreshResult> {
  if (!isLoggedIn()) return Promise.resolve({ refreshed: false, changed: false });
  if (permissionsRefreshInFlight) return permissionsRefreshInFlight;
  if (localStorage.getItem('permissions') && Date.now() - permissionsFetchedAt() < maxAgeMs) {
    return Promise.resolve({ refreshed: false, changed: false });
  }

  permissionsRefreshInFlight = (async () => {
    const before = permissionSignature(getPermissions());
    const perms = await fetchAndStorePermissions(); // null on failure: old cache stays
    if (!perms) return { refreshed: false, changed: false };
    const changed = permissionSignature(perms) !== before;
    announcePermissionsRefreshed({ changed, source: 'fetch' });
    return { refreshed: true, changed };
  })().finally(() => {
    permissionsRefreshInFlight = null;
  });
  return permissionsRefreshInFlight;
}

// Fire-and-forget variant for code paths that must not wait on it (the token
// refresh). The in-flight guard above makes it a no-op when the permissions
// fetch is the very request that triggered the token refresh.
function schedulePermissionsRefresh() {
  setTimeout(() => {
    refreshPermissions({ maxAgeMs: 0 }).catch(() => {});
  }, 0);
}

// Another tab stored a fresh payload (or dropped it on logout / a new login):
// this tab's in-memory copy is stale, so re-read it and let the menus follow.
// The storage event only fires in the tabs that did not do the write.
window.addEventListener('storage', (event) => {
  if (event.key !== 'permissions') return;
  const before = permissionSignature(cachedPermissions || {});
  cachedPermissions = null;
  cachedGrantedPageRoutes = null;
  const changed = permissionSignature(getPermissions()) !== before;
  announcePermissionsRefreshed({ changed, source: 'storage' });
});

/** Drops the cached user, team, permissions and the purchase-request draft. */
export function clearCachedUser(): void {
  localStorage.removeItem('user');
  localStorage.removeItem('userTeam');
  localStorage.removeItem('permissions');
  localStorage.removeItem(PERMISSIONS_FETCHED_AT_KEY);
  cachedPermissions = null;
  cachedGrantedPageRoutes = null;
  inFlightUserPromise = null;
  localStorage.removeItem('purchaseRequestDraft');
}

/** The user's department code, or 'other'. */
export async function getUserTeam(): Promise<string> {
  try {
    const userData = await getUser();
    const departmentCode = userData?.position?.department_code || userData?.department_code || null;
    return departmentCode || 'other';
  } catch (error) {
    console.error('Failed to get user department code:', error);
    return 'other';
  }
}

function setTokens(newAccessToken: string, newRefreshToken?: string | null) {
  localStorage.setItem('accessToken', newAccessToken);
  if (newRefreshToken) {
    localStorage.setItem('refreshToken', newRefreshToken);
  }
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

interface TokenPair {
  access: string;
  refresh: string;
}

/** Signs in; throws Error('FORBIDDEN') for accounts without office_access. */
export async function login(username: string, password: string): Promise<TokenPair> {
  // Always force a fresh permission fetch for each new login.
  localStorage.removeItem('permissions');
  cachedPermissions = null;
  cachedGrantedPageRoutes = null;

  const response = await fetch(`${API_URL}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Subdomain': SUBDOMAIN },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('FORBIDDEN');
    }
    throw new Error('Login failed');
  }

  const data = (await response.json()) as TokenPair;
  setTokens(data.access, data.refresh);

  // Fetch user and permissions in parallel after we have tokens
  const [userData, initialPerms] = await Promise.all([getUser(), fetchAndStorePermissions()]);
  const perms = initialPerms || (await fetchAndStorePermissions());

  // Block non-office users. If the permissions endpoint is temporarily
  // unavailable, do not force a logout loop: office_access is enforced only
  // when the payload is available.
  if (perms && !hasPermissionInPayload(perms, 'office_access')) {
    logout();
    throw new Error('FORBIDDEN');
  }

  // getUser already stores it; kept explicit.
  if (userData) {
    localStorage.setItem('user', JSON.stringify(userData));
  }

  isFreshLogin = true;

  return data;
}

// rememberReturn is for sessions that ended on their own (expired refresh token,
// missing access token) -- there the user was in the middle of something and
// should come back to it. A deliberate sign-out passes nothing, so it keeps
// landing on the login screen with no pending redirect.
export function logout({ rememberReturn = false }: { rememberReturn?: boolean } = {}): void {
  if (rememberReturn) {
    rememberReturnUrl();
  }
  clearTokens();
  clearCachedUser();
  cachedPermissions = null;
  cachedGrantedPageRoutes = null;
  navigateTo(ROUTES.LOGIN);
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('refreshToken');
}

function storedUser(): Partial<AuthUser> {
  return JSON.parse(localStorage.getItem('user') || '{}') as Partial<AuthUser>;
}

export function mustResetPassword(): boolean {
  try {
    return storedUser().must_reset_password === true;
  } catch (error) {
    console.warn('Failed to parse user data for mustResetPassword check:', error);
    return false;
  }
}

export function isAdmin(): boolean {
  try {
    const user = storedUser();
    return !!(user?.is_superuser || user?.is_admin);
  } catch (error) {
    console.warn('Failed to parse user data for isAdmin check:', error);
    return false;
  }
}

export function isSuperuser(): boolean {
  try {
    return storedUser()?.is_superuser === true;
  } catch (error) {
    console.warn('Failed to parse user data for isSuperuser check:', error);
    return false;
  }
}

export function isLead(): boolean {
  try {
    return !!storedUser()?.is_lead;
  } catch (error) {
    console.warn('Failed to parse user data for isLead check:', error);
    return false;
  }
}

export function isImpersonating(): boolean {
  return !!localStorage.getItem('impersonatorRefreshToken');
}

function storeImpersonatorContextIfMissing() {
  if (localStorage.getItem('impersonatorRefreshToken')) return;
  const currentAccess = localStorage.getItem('accessToken') || '';
  const currentRefresh = localStorage.getItem('refreshToken') || '';
  const currentUserJson = localStorage.getItem('user') || '';
  localStorage.setItem('impersonatorAccessToken', currentAccess);
  localStorage.setItem('impersonatorRefreshToken', currentRefresh);
  if (currentUserJson) {
    localStorage.setItem('impersonatorUser', currentUserJson);
  }
}

function clearImpersonatorContext() {
  localStorage.removeItem('impersonatorAccessToken');
  localStorage.removeItem('impersonatorRefreshToken');
  localStorage.removeItem('impersonatorUser');
}

async function bootstrapSessionLikeLogin() {
  // Behaves like a fresh login: clear caches and fetch user/perms once.
  clearCachedUser();
  const [userData] = await Promise.all([getUser(), fetchAndStorePermissions()]);
  if (userData) {
    localStorage.setItem('user', JSON.stringify(userData));
  }
  isFreshLogin = true;
}

/** Signs in as another user (the admin's own tokens are parked for stopImpersonation). */
export async function impersonateUser(userId: number): Promise<void> {
  if (!userId && userId !== 0) {
    throw new Error('Missing user_id');
  }

  storeImpersonatorContextIfMissing();

  const resp = await authedFetch(`${backendBase}/users/impersonate/`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });

  if (resp.status === 403) {
    throw new Error('FORBIDDEN');
  }
  if (!resp.ok) {
    let msg = 'Impersonation failed';
    try {
      const data = (await resp.json()) as { detail?: string; error?: string } | null;
      msg = data?.detail || data?.error || msg;
    } catch {
      // keep the generic message
    }
    throw new Error(msg);
  }

  const data = (await resp.json()) as Partial<TokenPair> | null;
  if (!data?.access || !data?.refresh) {
    throw new Error('Invalid impersonation response');
  }

  // Swap tokens, then bootstrap session once (like login).
  setTokens(data.access, data.refresh);
  await bootstrapSessionLikeLogin();

  // Hard navigation ensures all modules pick up the new identity.
  navigateTo(ROUTES.HOME);
}

export async function stopImpersonation(): Promise<void> {
  const access = localStorage.getItem('impersonatorAccessToken');
  const refresh = localStorage.getItem('impersonatorRefreshToken');
  if (!refresh) {
    clearImpersonatorContext();
    return;
  }

  setTokens(access || '', refresh);
  clearImpersonatorContext();
  await bootstrapSessionLikeLogin();
  navigateTo(ROUTES.HOME);
}

/** Full page load to `path`; repeated calls within 100 ms are ignored. */
export function navigateTo(path: string): void {
  if (isRedirecting) return; // Prevent multiple simultaneous redirects

  isRedirecting = true;
  window.location.href = path;

  setTimeout(() => {
    isRedirecting = false;
  }, 100);
}

/** The department's home page, where a fresh login lands. */
export function teamLandingRoute(): string {
  try {
    const user = storedUser();

    const departmentCode = user?.position?.department_code || user?.department_code || null;

    if (isAdmin() || !departmentCode) {
      return ROUTES.HOME;
    }
    switch (departmentCode) {
      case 'machining':
        return ROUTES.MACHINING;
      case 'maintenance':
        return ROUTES.MAINTENANCE;
      case 'manufacturing':
        return ROUTES.MANUFACTURING;
      case 'planning':
        return '/manufacturing/machining/capacity/planning';
      case 'procurement':
        return '/procurement/purchase-requests';
      case 'finance':
        return '/finance/purchase-orders';
      case 'human_resources':
      case 'human_resouces':
        return '/human_resources/users';
      default:
        return ROUTES.HOME;
    }
  } catch (error) {
    console.warn('Failed to parse user data for department-based navigation:', error);
    return ROUTES.HOME;
  }
}

export function navigateByTeam(): void {
  navigateTo(teamLandingRoute());
}

/** Department-based navigation, only right after a login (never on manual navigation). */
export function navigateByTeamIfFreshLogin(): void {
  if (isFreshLogin) {
    isFreshLogin = false;
    navigateByTeam();
  }
}

// Notification e-mails deep-link into pages like
// /procurement/purchase-requests/pending/?talep=SAT-123, and the query string is
// what opens the right record. A recipient who is not signed in gets sent to the
// login screen; without parking the URL first, the deep link is lost and they
// land on their department home page. The login screen consumes it.
const RETURN_URL_KEY = 'postLoginReturnUrl';

// Only same-origin, path-relative targets come back out: absolute and
// protocol-relative ("//host") values are rejected so a crafted entry can never
// turn the login screen into an open redirect, and the auth pages themselves are
// rejected so we cannot bounce in a loop. ROUTES.RESET_PASSWORD lives under
// ROUTES.LOGIN, so the one prefix check covers both.
function sanitizeReturnUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.startsWith(ROUTES.LOGIN)) return null;
  return raw;
}

export function rememberReturnUrl(url?: string): void {
  const target = url ?? window.location.pathname + window.location.search + window.location.hash;
  const safe = sanitizeReturnUrl(target);
  if (!safe) return;
  try {
    sessionStorage.setItem(RETURN_URL_KEY, safe);
  } catch {
    // Storage disabled (private mode, locked-down browser): landing on the
    // deep link is a convenience, not a requirement.
  }
}

/** Read-and-clear: a parked URL is good for exactly one landing. */
export function takeReturnUrl(): string | null {
  try {
    const stored = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);
    return sanitizeReturnUrl(stored);
  } catch {
    return null;
  }
}

export function shouldBeOnLoginPage(): boolean {
  return !isLoggedIn();
}

export function shouldBeOnResetPasswordPage(): boolean {
  if (!isLoggedIn()) {
    return false;
  }
  return storedUser().must_reset_password === true;
}

export function shouldBeOnMainPage(): boolean {
  return isLoggedIn() && !mustResetPassword();
}

// One refresh per tab at a time: when the access token lapses, every request in
// flight gets a 401, and they should all wait on the same refresh.
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// Only a refresh token the server actually rejects (401/400) ends the session.
// A network blip or a 5xx just fails this request; the next one tries again.
async function requestNewAccessToken(): Promise<string> {
  const sentRefresh = currentRefreshToken();
  if (!sentRefresh) {
    logout({ rememberReturn: true });
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_URL}/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Subdomain': SUBDOMAIN },
    body: JSON.stringify({ refresh: sentRefresh }),
  });

  if (response.status === 401 || response.status === 400) {
    // Another tab may have logged in again while this was out -- typically
    // right after the same expiry sent it to the login screen. Carry on
    // with its tokens instead of wiping them.
    const latestRefresh = currentRefreshToken();
    if (latestRefresh && latestRefresh !== sentRefresh) {
      return requestNewAccessToken();
    }
    logout({ rememberReturn: true });
    throw new Error('Session expired');
  }
  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status})`);
  }

  const data = (await response.json()) as { access: string; refresh?: string };
  if (!currentRefreshToken()) {
    // Signed out in another tab while this was out: don't revive the session.
    logout();
    throw new Error('Not authenticated');
  }
  // The backend hands back a new refresh token on every refresh; keeping it is
  // what lets an active session outlive the refresh token's 7-day lifetime.
  setTokens(data.access, data.refresh || sentRefresh);
  // A renewed session is the natural moment to pick up permission changes
  // made since the last fetch; it never delays the request that needed the token.
  schedulePermissionsRefresh();
  return data.access;
}

/**
 * fetch() with the Bearer token and X-Subdomain header; refreshes the token
 * once on a 401 and retries. Returns the raw Response. Signs out (and throws
 * 'FORBIDDEN') when the API refuses the office portal itself.
 */
export async function authedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!currentRefreshToken()) {
    logout({ rememberReturn: true });
    throw new Error('Not authenticated');
  }

  // No access token (stopImpersonation can store an empty one) just means
  // the request has to wait for a refresh first.
  const sentAccess = currentAccessToken() || (await refreshAccessToken());

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${sentAccess}`,
    'X-Subdomain': SUBDOMAIN,
  };
  options.headers = headers;

  // Only set Content-Type if not already provided and not using FormData
  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response = await fetch(url, options);

  if (response.status === 401) {
    // A parallel request or another tab may already have replaced the token
    // this one went out with; use that rather than refreshing again.
    const latestAccess = currentAccessToken();
    const freshAccess =
      latestAccess && latestAccess !== sentAccess ? latestAccess : await refreshAccessToken();
    headers['Authorization'] = `Bearer ${freshAccess}`;
    response = await fetch(url, options); // Retry the request with the new token
  }

  if (response.status === 403 && (await isPortalRefusal(response))) {
    // The API says this account may not use the office portal at all -- the
    // same verdict the login screen enforces. It can only be reached by a
    // session that outlived its office_access (revoked mid-session, or let
    // through because /users/me/permissions/ was unreachable at login), and
    // every page would fail for it, so end the session here.
    logout();
    throw new Error('FORBIDDEN');
  }

  return response;
}

// Tells the portal gate's 403 apart from the ordinary per-page 403s the API
// returns all the time. Matches on the stable `code`, not the Turkish message.
async function isPortalRefusal(response: Response): Promise<boolean> {
  try {
    const body = (await response.clone().json()) as { code?: unknown } | null;
    return body?.code === 'portal_forbidden';
  } catch {
    return false; // not JSON, so not the portal gate
  }
}
