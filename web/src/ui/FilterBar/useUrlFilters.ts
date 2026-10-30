import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/** A date range as the legacy filters returned it; '' = open end. */
export interface DateRange {
  start: string;
  end: string;
}

export type FilterValue = string | boolean | string[] | DateRange;
export type FilterValues = Record<string, FilterValue>;

/** Widens literal defaults (`status: ''`) to their value types. */
export type WidenFilters<T extends FilterValues> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends boolean
      ? boolean
      : T[K] extends readonly string[]
        ? string[]
        : DateRange;
};

export function isDateRange(value: unknown): value is DateRange {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'start' in value;
}

// A date range uses two params, so `?created_start=2026-01-01` reads naturally.
const startKey = (key: string) => `${key}_start`;
const endKey = (key: string) => `${key}_end`;

function readValue(params: URLSearchParams, key: string, fallback: FilterValue): FilterValue {
  if (isDateRange(fallback)) {
    const start = params.get(startKey(key));
    const end = params.get(endKey(key));
    if (start === null && end === null) return fallback;
    return { start: start ?? '', end: end ?? '' };
  }
  if (Array.isArray(fallback)) {
    if (!params.has(key)) return fallback;
    // An explicit empty selection is written as `key=` so it can differ from a non-empty default.
    return params.getAll(key).filter((v) => v !== '');
  }
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (typeof fallback === 'boolean') return raw === 'true' || raw === '1';
  return raw;
}

function sameValue(a: FilterValue, b: FilterValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function clearKey(params: URLSearchParams, key: string) {
  params.delete(key);
  params.delete(startKey(key));
  params.delete(endKey(key));
}

function writeValue(params: URLSearchParams, key: string, value: FilterValue, fallback: FilterValue) {
  clearKey(params, key);
  // Only what differs from the default goes in the URL, so it stays short.
  if (sameValue(value, fallback)) return;
  if (isDateRange(value)) {
    if (value.start) params.set(startKey(key), value.start);
    if (value.end) params.set(endKey(key), value.end);
    // Both cleared while the default has a range: keep an explicit empty marker.
    if (!value.start && !value.end) params.set(startKey(key), '');
  } else if (Array.isArray(value)) {
    if (value.length === 0) params.set(key, '');
    else value.forEach((v) => params.append(key, v));
  } else {
    params.set(key, String(value));
  }
}

export interface UrlFilters<T extends FilterValues> {
  /** The applied values: URL params over the defaults. Stable until the URL changes. */
  values: WidenFilters<T>;
  /** Merges `next` over the current values and writes them to the URL. */
  apply: (next: Partial<WidenFilters<T>>) => void;
  /** Drops every filter param, back to the defaults. */
  reset: () => void;
}

/**
 * Applied filter values kept in the URL query (`replace: true`, so filtering
 * does not fill the history). Other params in the URL are left alone.
 *
 *   const filters = useUrlFilters({ search: '', status: [] as string[], active: false,
 *     created: { start: '', end: '' } });
 *   <FilterBar filters={config} values={filters.values} onApply={filters.apply} onClear={filters.reset} />
 *   useQuery({ queryKey: ['users', filters.values], ... })
 */
export function useUrlFilters<T extends FilterValues>(defaults: T): UrlFilters<T> {
  const [searchParams, setSearchParams] = useSearchParams();
  // Callers usually pass an inline literal; key on its content, not identity.
  const defaultsKey = JSON.stringify(defaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableDefaults = useMemo(() => defaults, [defaultsKey]);
  const paramsKey = searchParams.toString();

  const values = useMemo(() => {
    const result: FilterValues = {};
    for (const [key, fallback] of Object.entries(stableDefaults)) {
      result[key] = readValue(searchParams, key, fallback);
    }
    return result as WidenFilters<T>;
    // searchParams is a new object on every navigation; its string is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey, stableDefaults]);

  const apply = useCallback(
    (next: Partial<WidenFilters<T>>) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          for (const [key, fallback] of Object.entries(stableDefaults)) {
            const current = readValue(prev, key, fallback);
            const value = (next as FilterValues)[key] ?? current;
            writeValue(params, key, value, fallback);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams, stableDefaults],
  );

  const reset = useCallback(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        for (const key of Object.keys(stableDefaults)) clearKey(params, key);
        return params;
      },
      { replace: true },
    );
  }, [setSearchParams, stableDefaults]);

  return { values, apply, reset };
}
