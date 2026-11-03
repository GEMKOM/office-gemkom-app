import { authedFetch } from '@legacy/authService.js';
import { createEvent, fireEvent, within } from '@testing-library/react';
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

/** Row keys of the DataTable(s) and of the Gantt, top to bottom. */
export function tableOrder(container: ParentNode = document) {
  return [...container.querySelectorAll('tbody tr[data-row-id]')].map((tr) =>
    tr.getAttribute('data-row-id'),
  );
}
export function ganttOrder() {
  return [...document.querySelectorAll('div[data-row-id]')].map((el) =>
    el.getAttribute('data-row-id'),
  );
}

/**
 * Drags a DataTable row by its handle onto another row's top half (drop
 * before it). jsdom has no layout or DragEvent, so the target gets a box and
 * the events get clientY by hand.
 */
export function dragRowBefore(fromKey: string, toKey: string) {
  const row = (key: string) => document.querySelector<HTMLElement>(`tr[data-row-id="${key}"]`)!;
  const target = row(toKey);
  target.getBoundingClientRect = () => ({ top: 100, height: 40, bottom: 140 }) as DOMRect;
  const dataTransfer = {
    setData: vi.fn(),
    setDragImage: vi.fn(),
    effectAllowed: '',
    dropEffect: '',
  };
  fireEvent.dragStart(row(fromKey).querySelector('[data-drag-handle]')!, { dataTransfer });
  const cell = target.querySelector('td')!;
  for (const type of ['dragOver', 'drop'] as const) {
    const event = createEvent[type](cell, { dataTransfer });
    Object.defineProperty(event, 'clientY', { value: 105 });
    fireEvent(cell, event);
  }
}

/** Types a new "Sıra" into the row's order cell and presses Enter. */
export function typeOrder(key: string, value: string, label = 'Sıra') {
  const cell = document.querySelector<HTMLElement>(
    `tr[data-row-id="${key}"] td[data-col="plan_order"]`,
  )!;
  fireEvent.click(cell);
  const input = within(cell).getByRole('textbox', { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
}
