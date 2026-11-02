// Row / bar bookkeeping for the Gantt: grouping bars by row and keyboard
// navigation between bars. Pure functions; see layout.test.ts.

export interface BarLike {
  id: string;
  rowId: string;
  start: number;
  end: number;
}

export interface RowLike {
  id: string;
}

/** Bars per row id, each list sorted by start (then end, then id). */
export function groupBarsByRow<B extends BarLike>(bars: readonly B[]): Map<string, B[]> {
  const out = new Map<string, B[]>();
  for (const bar of bars) {
    let list = out.get(bar.rowId);
    if (!list) {
      list = [];
      out.set(bar.rowId, list);
    }
    list.push(bar);
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }
  return out;
}

/** Same items in the same order (by identity). Lets memoized rows skip work. */
export function shallowEqualArrays<T>(
  a: readonly T[] | undefined,
  b: readonly T[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export type NavKey = 'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'pageUp' | 'pageDown';

/**
 * The bar keyboard focus moves to. Left/right walk the bars of a row in time;
 * up/down (and page up/down, 10 rows) go to the nearest row that has bars and
 * pick the bar closest in time; home/end jump to the row's first/last bar.
 * Without a current bar, the first bar of the first row is chosen.
 */
export function navigate<B extends BarLike>(
  rows: readonly RowLike[],
  barsByRow: ReadonlyMap<string, readonly B[]>,
  currentId: string | null,
  key: NavKey,
): B | null {
  const rowIndex = new Map(rows.map((r, i) => [r.id, i]));
  let current: B | null = null;
  if (currentId) {
    for (const list of barsByRow.values()) {
      const found = list.find((b) => b.id === currentId);
      if (found) {
        current = found;
        break;
      }
    }
  }
  if (!current) {
    for (const row of rows) {
      const first = barsByRow.get(row.id)?.[0];
      if (first) return first;
    }
    return null;
  }
  const list = barsByRow.get(current.rowId) ?? [];
  const at = list.indexOf(current);
  switch (key) {
    case 'left':
      return list[at - 1] ?? current;
    case 'right':
      return list[at + 1] ?? current;
    case 'home':
      return list[0] ?? current;
    case 'end':
      return list.at(-1) ?? current;
    default: {
      const step = key === 'up' || key === 'pageUp' ? -1 : 1;
      const distance = key === 'pageUp' || key === 'pageDown' ? 10 : 1;
      const from = rowIndex.get(current.rowId) ?? 0;
      const pick = (index: number): B | null => {
        const row = rows[index];
        const candidates = row ? barsByRow.get(row.id) : undefined;
        if (!candidates?.length) return null;
        let best = candidates[0]!;
        for (const b of candidates) {
          if (Math.abs(b.start - current.start) < Math.abs(best.start - current.start)) best = b;
        }
        return best;
      };
      // Page keys: land on the first row with bars at or past the distance.
      let fallback: B | null = null;
      for (let i = from + step; i >= 0 && i < rows.length; i += step) {
        const found = pick(i);
        if (!found) continue;
        if (Math.abs(i - from) >= distance) return found;
        fallback = found;
        if (distance === 1) return found;
      }
      return fallback ?? current;
    }
  }
}

/** Moves one item of a list before/after another (row reordering). */
export function moveRow<T extends RowLike>(
  list: readonly T[],
  fromId: string,
  targetId: string,
  position: 'before' | 'after',
): T[] {
  const item = list.find((r) => r.id === fromId);
  if (!item || fromId === targetId) return [...list];
  const rest = list.filter((r) => r.id !== fromId);
  const target = rest.findIndex((r) => r.id === targetId);
  if (target < 0) return [...list];
  rest.splice(position === 'before' ? target : target + 1, 0, item);
  return rest;
}
