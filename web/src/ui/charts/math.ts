// Small calculations dashboards share. Kept pure so they are unit-tested.

/** Percent change from `previous` to `current`; null when there is no base (0, null). */
export function percentChange(
  current: number | null | undefined,
  previous: number | null | undefined,
): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined)
    return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Trailing moving average over `window` points; null until the window is full
 * (the legacy dashboards start the 4-week average at the fourth week).
 */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, index) => {
    if (index < window - 1) return null;
    const slice = values.slice(index - window + 1, index + 1);
    const numbers = slice.filter((v): v is number => v !== null && Number.isFinite(v));
    if (!numbers.length) return null;
    return numbers.reduce((sum, v) => sum + v, 0) / numbers.length;
  });
}

/** Sum of a field over rows, treating missing values as 0. */
export function sumBy<Row>(rows: Row[], pick: (row: Row) => number | null | undefined): number {
  return rows.reduce((sum, row) => {
    const v = pick(row);
    return sum + (v !== null && v !== undefined && Number.isFinite(v) ? v : 0);
  }, 0);
}

/** Keeps the first `limit` items and folds the rest into one "Diğer" item. */
export function foldTail<T>(items: T[], limit: number, fold: (rest: T[]) => T): T[] {
  if (items.length <= limit) return items;
  return [...items.slice(0, limit), fold(items.slice(limit))];
}
