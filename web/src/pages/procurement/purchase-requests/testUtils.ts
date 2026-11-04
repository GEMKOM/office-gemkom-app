import { authedFetch } from '@/auth/authService';

// Shared fetch mock for the purchase-request page tests.

export type Call = { url: URL; method: string; body: unknown };

export function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
}

export function calls(): Call[] {
  return vi.mocked(authedFetch).mock.calls.map(([url, init]) => ({
    url: new URL(String(url)),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

export const callsTo = (path: string, method = 'GET') =>
  calls().filter((c) => c.url.pathname === path && c.method === method);

export const page = <T,>(results: T[]) => ({ count: results.length, next: null, previous: null, results });
