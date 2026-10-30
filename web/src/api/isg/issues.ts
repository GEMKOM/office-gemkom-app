import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';

/** Counters from GET /isg/issues/summary/ (the statistics cards on /isg/issues). */
export interface IsgSummary {
  total?: number;
  open?: number;
  in_progress?: number;
  resolved?: number;
  closed?: number;
  /** Past the due date and not closed. */
  overdue?: number;
  critical_open?: number;
  /** Not closed and assigned to the signed-in user. */
  mine_open?: number;
}

/** Issues change a few times a day; a minute is fresh enough for a hub. */
export const ISG_STALE_TIME = 60_000;

/** Port of getISGSummary() without filters: every issue the user can see. */
export async function getIsgSummary(signal?: AbortSignal): Promise<IsgSummary> {
  return apiFetch<IsgSummary>('/isg/issues/summary/', { signal });
}

export function isgSummaryQueryOptions() {
  return queryOptions({
    queryKey: ['isg', 'summary'] as const,
    queryFn: ({ signal }) => getIsgSummary(signal),
    staleTime: ISG_STALE_TIME,
  });
}
