/** Reference lists change rarely; refetch at most every 5 minutes. */
export const REFERENCE_STALE_TIME = 5 * 60_000;
/** Teams/groups change even less often. */
export const SLOW_REFERENCE_STALE_TIME = 10 * 60_000;

/**
 * Overrides a caller may pass to a reference hook. Kept to plain values: for
 * select or anything fancier, spread the matching `*QueryOptions()` factory
 * into useQuery directly.
 */
export type ReferenceQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number | false;
};
