import { queryOptions, type QueryKey } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from './client';
import { toPaginated, type Paginated } from './types';

// Counts and short lists for the hub pages, from pages of the lists the
// pages behind the hubs already read. A one-row page carries the count.

/** A minute is fresh enough for a hub; the lists load their own. */
export const HUB_STALE_TIME = 60_000;

/** How many rows of `path` match `params`, from a one-row page. */
export function listCountQueryOptions(
  key: readonly unknown[],
  path: string,
  params: QueryParams = {},
  staleTime = HUB_STALE_TIME,
) {
  return queryOptions({
    queryKey: [...key, 'count', cleanParams(params)] as QueryKey,
    queryFn: async ({ signal }) =>
      toPaginated<unknown>(await apiFetch<unknown>(path, { params: { ...params, page_size: 1 }, signal }))
        .count,
    staleTime,
  });
}

/** The first `params.page_size` rows of `path`, e.g. the latest few requests. */
export function listPageQueryOptions<T>(
  key: readonly unknown[],
  path: string,
  params: QueryParams,
  staleTime = HUB_STALE_TIME,
) {
  return queryOptions({
    queryKey: [...key, 'hubPage', cleanParams(params)] as QueryKey,
    queryFn: async ({ signal }): Promise<Paginated<T>> =>
      toPaginated<T>(await apiFetch<unknown>(path, { params, signal })),
    staleTime,
  });
}
