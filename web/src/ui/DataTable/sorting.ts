import type { DataTableColumn, SortDir } from './types';

/** DRF `ordering`: ('created_at', 'desc') -> '-created_at'; no field -> undefined. */
export function toOrdering(sortBy: string | null | undefined, sortDir: SortDir): string | undefined {
  if (!sortBy) return undefined;
  return sortDir === 'desc' ? `-${sortBy}` : sortBy;
}

/** '-created_at' -> { sortBy: 'created_at', sortDir: 'desc' }. */
export function fromOrdering(ordering: string | null | undefined): {
  sortBy: string | null;
  sortDir: SortDir;
} {
  if (!ordering) return { sortBy: null, sortDir: 'asc' };
  return ordering.startsWith('-')
    ? { sortBy: ordering.slice(1), sortDir: 'desc' }
    : { sortBy: ordering, sortDir: 'asc' };
}

/** Legacy handleSort: the same field flips direction, a new field starts ascending. */
export function nextSort(
  current: { sortBy: string | null; sortDir: SortDir },
  field: string,
): { sortBy: string; sortDir: SortDir } {
  if (current.sortBy === field) {
    return { sortBy: field, sortDir: current.sortDir === 'asc' ? 'desc' : 'asc' };
  }
  return { sortBy: field, sortDir: 'asc' };
}

export function columnValue<T>(column: DataTableColumn<T>, row: T): unknown {
  const { accessor } = column;
  if (typeof accessor === 'function') return accessor(row);
  if (accessor !== undefined) return row[accessor];
  return (row as Record<string, unknown>)[column.key];
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

function sortable(value: unknown): number | string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  return String(value);
}

/** Ascending compare: numbers numerically, text Turkish-aware, empties last. */
export function compareValues(a: unknown, b: unknown): number {
  const x = sortable(a);
  const y = sortable(b);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return collator.compare(String(x), String(y));
}
