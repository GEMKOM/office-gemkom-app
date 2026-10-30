/** DRF PageNumberPagination envelope. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Port of apis/paginationHelper.js `extractResultsFromResponse`: accepts a bare
 * array or an envelope keyed results / data / items / list, else the first
 * array property. Anything else gives [].
 */
export function extractResults<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data !== 'object') return [];
  const body = data as Record<string, unknown>;
  for (const key of ['results', 'data', 'items', 'list']) {
    if (Array.isArray(body[key])) return body[key] as T[];
  }
  const firstArray = Object.values(body).find(Array.isArray);
  return (firstArray as T[] | undefined) ?? [];
}

/** Wraps a bare array as a single page so callers always get one shape. */
export function toPaginated<T>(data: unknown): Paginated<T> {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'results' in data) {
    const page = data as Partial<Paginated<T>>;
    const results = Array.isArray(page.results) ? page.results : [];
    return {
      count: typeof page.count === 'number' ? page.count : results.length,
      next: page.next ?? null,
      previous: page.previous ?? null,
      results,
    };
  }
  const results = extractResults<T>(data);
  return { count: results.length, next: null, previous: null, results };
}
