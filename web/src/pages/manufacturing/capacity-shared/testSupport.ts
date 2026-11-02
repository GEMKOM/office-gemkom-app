import { authedFetch } from '@legacy/authService.js';
import { vi } from 'vitest';

// Helpers for the planner and report page tests. The tests mock
// '@legacy/authService.js' (authedFetch) and '@legacy/base.js' themselves.

/** jsdom has no layout; give elements a size so the Gantt's virtualizer renders rows. */
export function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1400,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 700,
  });
  return () => {
    for (const key of ['clientWidth', 'clientHeight'])
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  };
}

export function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

export type Handler = (url: URL, method: string, body: unknown) => Promise<Response> | undefined;

/** Routes authedFetch to `handler` (404 when it returns nothing) and records calls. */
export function mockBackend(handler: Handler) {
  const fetchMock = vi.mocked(authedFetch);
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    return handler(u, init?.method ?? 'GET', body) ?? json({ detail: 'not mocked' }, 404);
  });
  return {
    calls: () =>
      fetchMock.mock.calls.map(([url, init]) => ({
        url: new URL(String(url)),
        method: (init as RequestInit | undefined)?.method ?? 'GET',
        body:
          typeof (init as RequestInit | undefined)?.body === 'string'
            ? (JSON.parse((init as RequestInit).body as string) as unknown)
            : undefined,
      })),
  };
}

export function bar(id: string) {
  return document.querySelector<HTMLElement>(`[data-bar-id="${id}"]`);
}
