import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page, type Request, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Constants

/** What base.js picks when the page is served from localhost / 127.0.0.1. */
export const BACKEND = 'http://127.0.0.1:8001';

/** Never let a test reach the production API, whatever a page asks for. */
const PRODUCTION_BACKEND = /^https:\/\/gemkom-backend-[^/]*\.run\.app\//;

/** Obviously fake session values. None of them is accepted by any real backend. */
export const FAKE = {
  accessToken: 'e2e-fake-access-token-1',
  refreshToken: 'e2e-fake-refresh-token-1',
  refreshedAccessToken: 'e2e-fake-access-token-2',
  refreshedRefreshToken: 'e2e-fake-refresh-token-2',
} as const;

/** Migrated routes, normalized the same way scripts/routes.mjs does it. */
export function migratedRoutes(): string[] {
  const file = fileURLToPath(new URL('../src/routes/migrated-routes.json', import.meta.url));
  const routes = JSON.parse(readFileSync(file, 'utf8')) as string[];
  return [
    ...new Set(
      routes.map((r) => {
        const bare = r.split(/[?#]/)[0] || '/';
        return bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare;
      }),
    ),
  ];
}

/** "/sales/customers" -> "/sales/customers/" (what the static server serves without a 301). */
export function pageUrl(route: string): string {
  return route === '/' ? '/' : `${route.replace(/\/$/, '')}/`;
}

// ---------------------------------------------------------------------------
// Session

export interface SessionOptions {
  /** Admins pass every route check. Default false. */
  admin?: boolean;
  /** Page routes to grant, e.g. ['/sales/customers/']; written as "Page: <route>" permissions. */
  grants?: string[];
  /** Extra fields merged into the user object. */
  user?: Record<string, unknown>;
}

export interface SeededSession {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
  permissions: Record<string, true | { granted: boolean; name: string }>;
}

export function buildSession(options: SessionOptions = {}): SeededSession {
  const admin = options.admin ?? false;
  const permissions: SeededSession['permissions'] = { office_access: true };
  for (const route of options.grants ?? []) {
    const withSlash = route.endsWith('/') ? route : `${route}/`;
    const codename = `e2e_page${withSlash.replace(/[/-]+/g, '_').replace(/_$/, '')}`;
    permissions[codename] = { granted: true, name: `Page: ${withSlash}` };
  }
  return {
    accessToken: FAKE.accessToken,
    refreshToken: FAKE.refreshToken,
    user: {
      id: 990001,
      username: admin ? 'e2e.admin' : 'e2e.user',
      first_name: 'E2E',
      last_name: admin ? 'Admin' : 'Kullanıcı',
      email: admin ? 'e2e-admin@example.test' : 'e2e-user@example.test',
      is_admin: admin,
      is_superuser: false,
      is_lead: false,
      must_reset_password: false,
      department_code: null,
      ...options.user,
    },
    permissions,
  };
}

/**
 * Writes a fake signed-in session to localStorage before any page script runs.
 * It is written once per tab (marked in sessionStorage), so later full page
 * loads see whatever the app itself left there: that is what lets the tests
 * check that the session survives navigation and that a token refresh sticks.
 */
export async function seedSession(
  page: Page,
  options: SessionOptions = {},
): Promise<SeededSession> {
  const session = buildSession(options);
  await page.addInitScript((s) => {
    if (!/^https?:$/.test(location.protocol)) return;
    if (sessionStorage.getItem('__e2eSessionSeeded')) return;
    localStorage.setItem('accessToken', s.accessToken);
    localStorage.setItem('refreshToken', s.refreshToken);
    localStorage.setItem('user', JSON.stringify(s.user));
    localStorage.setItem('permissions', JSON.stringify(s.permissions));
    localStorage.setItem('permissionsFetchedAt', String(Date.now()));
    sessionStorage.setItem('__e2eSessionSeeded', '1');
  }, session);
  return session;
}

/** The session keys as the page currently has them. */
export async function readSession(page: Page) {
  return page.evaluate(() => ({
    accessToken: localStorage.getItem('accessToken'),
    refreshToken: localStorage.getItem('refreshToken'),
    user: localStorage.getItem('user'),
    permissions: localStorage.getItem('permissions'),
  }));
}

// ---------------------------------------------------------------------------
// Backend mock

export interface MockRequest {
  method: string;
  url: URL;
  /** Path relative to the backend, e.g. "/projects/customers/". */
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  /** Parsed JSON body, or the raw text, or undefined. */
  body: unknown;
  /** How many earlier calls this handler key has answered (0 on the first). */
  callIndex: number;
}

export interface MockResponse {
  status?: number;
  /** Serialized as JSON. Ignored when `body` is set. */
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
}

export type MockHandler =
  MockResponse | ((req: MockRequest) => MockResponse | Promise<MockResponse>);

/**
 * Keys are "METHOD /path/" (exact path, query ignored) or just "/path/" for any
 * method. A method-specific key wins over a bare one.
 */
export type MockHandlers = Record<string, MockHandler>;

export interface RecordedCall {
  method: string;
  path: string;
  query: string;
  authorization: string | undefined;
  body: unknown;
  status: number;
  /** "handler" when a test or default mock answered, "fallback" otherwise. */
  answeredBy: 'handler' | 'fallback';
}

export interface MockBackend {
  calls: RecordedCall[];
  /** Calls to one backend path, optionally one method. */
  callsTo(path: string, method?: string): RecordedCall[];
  /** Paths that no handler covered: worth a mock if a page depends on them. */
  unhandled(): string[];
}

export const paginated = <T>(
  results: T[],
  extra: Partial<{ next: string | null; previous: string | null; count: number }> = {},
) => ({
  count: extra.count ?? results.length,
  next: extra.next ?? null,
  previous: extra.previous ?? null,
  results,
});

export const MOCK_CUSTOMERS = [
  {
    id: 9101,
    code: 'E2E-001',
    name: 'Test Müşteri Alfa A.Ş.',
    short_name: 'Alfa',
    is_active: true,
    default_currency: 'EUR',
  },
  {
    id: 9102,
    code: 'E2E-002',
    name: 'Test Müşteri Beta Ltd.',
    short_name: 'Beta',
    is_active: true,
    default_currency: 'TRY',
  },
  {
    id: 9103,
    code: 'E2E-003',
    name: 'Test Müşteri Gama GmbH',
    short_name: 'Gama',
    is_active: true,
    default_currency: 'USD',
  },
];

/** Mocks every page needs, built from the seeded session (admin by default). */
export function defaultHandlers(
  session: SeededSession = buildSession({ admin: true }),
): MockHandlers {
  return {
    'GET /users/me/': { json: session.user },
    'GET /users/me/permissions/': { json: session.permissions },
    'GET /notifications/unread_count/': { json: { count: 0 } },
    'GET /projects/customers/': { json: paginated(MOCK_CUSTOMERS) },
  };
}

// GETs that return one object rather than a list.
const SINGULAR_LAST_SEGMENTS = new Set([
  'me',
  'today',
  'unread_count',
  'summary',
  'stats',
  'statistics',
  'my-permissions',
  'permissions',
  'count',
]);

function looksLikeList(method: string, path: string): boolean {
  if (method !== 'GET') return false;
  const segments = path.split('/').filter(Boolean);
  const last = segments.at(-1) ?? '';
  return !/^\d+$/.test(last) && !SINGULAR_LAST_SEGMENTS.has(last);
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Subdomain',
};

function parseBody(request: Request): unknown {
  const raw = request.postData();
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Intercepts every request to the backend. Unknown endpoints answer 200: an
 * empty DRF page for list-looking GETs, {} otherwise, so legacy pages render
 * without a server. Every call is recorded.
 *
 * Handlers passed here are layered over defaultHandlers(session).
 */
export async function mockBackend(
  page: Page,
  handlers: MockHandlers = {},
  options: { session?: SeededSession } = {},
): Promise<MockBackend> {
  const all: MockHandlers = { ...defaultHandlers(options.session), ...handlers };
  const counters = new Map<string, number>();
  const calls: RecordedCall[] = [];

  await page.route(PRODUCTION_BACKEND, (route) => route.abort('blockedbyclient'));

  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }

    const key =
      all[`${method} ${path}`] !== undefined
        ? `${method} ${path}`
        : all[path] !== undefined
          ? path
          : null;
    const headers = request.headers();
    const body = parseBody(request);

    let response: MockResponse;
    if (key) {
      const callIndex = counters.get(key) ?? 0;
      counters.set(key, callIndex + 1);
      const handler = all[key]!;
      response =
        typeof handler === 'function'
          ? await handler({ method, url, path, query: url.searchParams, headers, body, callIndex })
          : handler;
    } else {
      response = { json: looksLikeList(method, path) ? paginated([]) : {} };
    }

    const status = response.status ?? 200;
    calls.push({
      method,
      path,
      query: url.search,
      authorization: headers['authorization'],
      body,
      status,
      answeredBy: key ? 'handler' : 'fallback',
    });

    await route.fulfill({
      status,
      headers: { ...CORS_HEADERS, ...response.headers },
      contentType: response.body !== undefined ? undefined : 'application/json',
      body: response.body ?? (status === 204 ? '' : JSON.stringify(response.json ?? {})),
    });
  });

  return {
    calls,
    callsTo: (path, method) =>
      calls.filter((c) => c.path === path && (!method || c.method === method.toUpperCase())),
    unhandled: () => [
      ...new Set(
        calls.filter((c) => c.answeredBy === 'fallback').map((c) => `${c.method} ${c.path}`),
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
// Console errors

// Noise that says nothing about the app under test.
const BENIGN_CONSOLE_ERRORS: RegExp[] = [
  // Browsers ask for /favicon.ico on their own.
  /favicon\.ico/i,
  // Third-party CDNs (Bootstrap, Font Awesome, fonts) offline or slow on a runner.
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_(REFUSED|RESET|TIMED_OUT)|TIMED_OUT)/,
  // The production-API guard above aborts on purpose.
  /net::ERR_BLOCKED_BY_CLIENT/,
];

export interface ConsoleErrors {
  /** Every error-level console message and uncaught page error, benign ones excluded. */
  readonly errors: string[];
  /** Ignore messages matching this from now on (e.g. the browser's log line for a 401 a test provokes). */
  allow(pattern: RegExp): void;
  /** Fails the test with the collected errors, if any. */
  expectNone(): void;
}

export function collectConsoleErrors(page: Page, extraBenign: RegExp[] = []): ConsoleErrors {
  const benign = [...BENIGN_CONSOLE_ERRORS, ...extraBenign];
  const errors: string[] = [];
  const keep = (text: string) => !benign.some((re) => re.test(text));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    const text = `${message.text()}${location.url ? ` (${location.url}:${location.lineNumber})` : ''}`;
    if (keep(text)) errors.push(`[console.error] ${text}`);
  });
  page.on('pageerror', (error) => {
    const text = `${error.name}: ${error.message}`;
    if (keep(text)) errors.push(`[pageerror] ${text}\n${error.stack ?? ''}`);
  });
  return {
    errors,
    allow(pattern) {
      benign.push(pattern);
    },
    expectNone() {
      expect(errors, `console errors on ${page.url()}`).toEqual([]);
    },
  };
}

// ---------------------------------------------------------------------------
// Test with a console collector attached to every page

export const test = base.extend<{ consoleErrors: ConsoleErrors }>({
  consoleErrors: async ({ page }, provide) => {
    await provide(collectConsoleErrors(page));
  },
});

export { expect };
