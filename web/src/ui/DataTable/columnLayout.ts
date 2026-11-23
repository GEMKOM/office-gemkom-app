// A user's layout of a table: the column order and the columns they turned on
// or off. Saved per user on the backend (/users/me/table-preferences/) under
// the table's `columnsKey`, with a copy in this browser so a table opens in the
// user's layout before the request returns.

import { useCallback, useSyncExternalStore } from 'react';
import { apiFetch } from '@/api/client';
import { notify } from '../notify';

/** One column of a layout; `visible` left out means "as the table shows it by default". */
export interface ColumnPref {
  key: string;
  visible?: boolean;
}

export type ColumnLayout = readonly ColumnPref[];

// ---- pure helpers -----------------------------------------------------------

/**
 * The columns in the layout's order. Columns the layout does not know (added
 * to the page since it was saved) go right after the column they follow by
 * default; layout entries for columns the page no longer has are skipped.
 */
export function arrangeColumns<C extends { key: string }>(
  columns: readonly C[],
  layout: ColumnLayout | undefined,
): C[] {
  if (!layout || layout.length === 0) return [...columns];
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const result: C[] = [];
  for (const pref of layout) {
    const column = byKey.get(pref.key);
    if (column && !result.includes(column)) result.push(column);
  }
  columns.forEach((column, i) => {
    if (result.includes(column)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const before = result.indexOf(columns[j] as C);
      if (before >= 0) {
        at = before + 1;
        break;
      }
    }
    result.splice(at, 0, column);
  });
  return result;
}

/** The on/off choices of a layout: column key -> shown. */
export function layoutChoices(layout: ColumnLayout | undefined): Record<string, boolean> {
  const choices: Record<string, boolean> = {};
  for (const pref of layout ?? []) {
    if (typeof pref.visible === 'boolean') choices[pref.key] = pref.visible;
  }
  return choices;
}

/** A layout from the columns in their order and the on/off choices. */
export function buildLayout(
  ordered: readonly { key: string }[],
  choices: Record<string, boolean>,
): ColumnPref[] {
  return ordered.map(({ key }) =>
    typeof choices[key] === 'boolean' ? { key, visible: choices[key] } : { key },
  );
}

/** `keys` with `key` moved to position `to` (clamped). */
export function moveKey(keys: readonly string[], key: string, to: number): string[] {
  const from = keys.indexOf(key);
  if (from < 0) return [...keys];
  const next = keys.filter((k) => k !== key);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, key);
  return next;
}

function parseLayout(value: unknown): ColumnPref[] | null {
  if (!Array.isArray(value)) return null;
  const out: ColumnPref[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { key, visible } = entry as { key?: unknown; visible?: unknown };
    if (typeof key !== 'string' || !key) continue;
    out.push(typeof visible === 'boolean' ? { key, visible } : { key });
  }
  return out;
}

/** The list endpoint's answer, { key: { columns } }; null for anything else. */
export function parseLayouts(data: unknown): Record<string, ColumnPref[]> | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const out: Record<string, ColumnPref[]> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const columns =
      value && typeof value === 'object' ? (value as { columns?: unknown }).columns : undefined;
    const layout = parseLayout(columns);
    if (layout) out[key] = layout;
  }
  return out;
}

// ---- the store ----------------------------------------------------------------

const ENDPOINT = '/users/me/table-preferences/';
const CACHE_PREFIX = 'gk.tableLayouts.';
/** The visibility-only choices the Sütunlar menu kept in this browser before. */
const LEGACY_PREFIX = 'gk.tableColumns.';
/** Clicks in a row (moving a column three places) go out as one request. */
const SAVE_DELAY = 400;

interface StoreState {
  /** Whose layouts these are; 'anon' before sign-in (tests, previews). */
  owner: string;
  layouts: Record<string, ColumnPref[]>;
  /** Keys changed here since the last load began; a load keeps these. */
  touched: Set<string>;
  status: 'idle' | 'loading' | 'loaded';
}

const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const legacyCache = new Map<string, ColumnPref[] | undefined>();
let state: StoreState | null = null;
let warned = false;

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the server copy is enough.
  }
}

function currentOwner(): string {
  const user = readStorage('user') as { id?: unknown } | undefined;
  return user && (typeof user.id === 'number' || typeof user.id === 'string')
    ? String(user.id)
    : 'anon';
}

function signedIn(): boolean {
  try {
    return Boolean(localStorage.getItem('accessToken'));
  } catch {
    return false;
  }
}

/** The state for whoever is signed in now; a different user starts over. */
function current(): StoreState {
  const owner = currentOwner();
  if (!state || state.owner !== owner) {
    state = {
      owner,
      layouts: parseLayouts(readStorage(CACHE_PREFIX + owner)) ?? {},
      touched: new Set(),
      status: 'idle',
    };
    legacyCache.clear();
  }
  return state;
}

function emit() {
  for (const listener of listeners) listener();
}

/** The browser copy, in the list endpoint's shape so parseLayouts reads both. */
function writeCache(s: StoreState) {
  const entries = Object.entries(s.layouts);
  writeStorage(
    CACHE_PREFIX + s.owner,
    entries.length
      ? Object.fromEntries(entries.map(([key, columns]) => [key, { columns }]))
      : undefined,
  );
}

function load() {
  const s = current();
  if (s.status !== 'idle' || s.owner === 'anon' || !signedIn()) return;
  s.status = 'loading';
  s.touched.clear();
  apiFetch<unknown>(ENDPOINT).then(
    (data) => {
      if (state !== s) return;
      const server = parseLayouts(data);
      s.status = 'loaded';
      if (!server) return;
      const kept = Object.fromEntries(
        [...s.touched].filter((k) => s.layouts[k]).map((k) => [k, s.layouts[k] as ColumnPref[]]),
      );
      s.layouts = { ...server, ...kept };
      writeCache(s);
      emit();
    },
    () => {
      // Offline or an old backend: the browser copy stays in use.
      if (state === s) s.status = 'loaded';
    },
  );
}

function legacyLayout(columnsKey: string): ColumnPref[] | undefined {
  if (!legacyCache.has(columnsKey)) {
    const stored = readStorage(LEGACY_PREFIX + columnsKey);
    const layout =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? Object.entries(stored as Record<string, unknown>)
            .filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean')
            .map(([key, visible]) => ({ key, visible }))
        : [];
    legacyCache.set(columnsKey, layout.length ? layout : undefined);
  }
  return legacyCache.get(columnsKey);
}

export function getColumnLayout(columnsKey: string): ColumnLayout | undefined {
  return current().layouts[columnsKey] ?? legacyLayout(columnsKey);
}

function send(s: StoreState, columnsKey: string) {
  timers.delete(columnsKey);
  if (s.owner === 'anon' || !signedIn()) return;
  const layout = s.layouts[columnsKey];
  const path = `${ENDPOINT}${encodeURIComponent(columnsKey)}/`;
  const request = layout
    ? apiFetch(path, { method: 'PUT', body: { columns: layout } })
    : apiFetch(path, { method: 'DELETE' });
  request.catch((error: unknown) => {
    // A backend without the endpoint yet: the browser copy is all there is.
    if ((error as { status?: unknown } | null)?.status === 404) return;
    if (warned) return;
    warned = true;
    notify.warning('Sütun düzeni sunucuya kaydedilemedi; bu tarayıcıda hatırlanacak.');
    console.warn('table preference save failed', error);
  });
}

/** Saves a layout for the signed-in user; null goes back to the table's default. */
export function setColumnLayout(columnsKey: string, layout: ColumnLayout | null) {
  const s = current();
  const next = { ...s.layouts };
  if (layout && layout.length) next[columnsKey] = [...layout];
  else delete next[columnsKey];
  s.layouts = next;
  s.touched.add(columnsKey);
  writeCache(s);
  writeStorage(LEGACY_PREFIX + columnsKey, undefined);
  legacyCache.set(columnsKey, undefined);
  emit();
  const pending = timers.get(columnsKey);
  if (pending) clearTimeout(pending);
  timers.set(
    columnsKey,
    setTimeout(() => send(s, columnsKey), SAVE_DELAY),
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

/** The saved layout of a table and a setter; nothing without a key. */
export function useColumnLayout(
  columnsKey: string | undefined,
): [ColumnLayout | undefined, (layout: ColumnLayout | null) => void] {
  const layout = useSyncExternalStore(
    subscribe,
    () => (columnsKey ? getColumnLayout(columnsKey) : undefined),
    () => undefined,
  );
  const set = useCallback(
    (next: ColumnLayout | null) => {
      if (columnsKey) setColumnLayout(columnsKey, next);
    },
    [columnsKey],
  );
  return [layout, set];
}

/** Forget everything in memory (tests; the browser copy is up to the caller). */
export function resetColumnLayoutStore() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  legacyCache.clear();
  state = null;
  warned = false;
}
