import { queryOptions } from '@tanstack/react-query';
import { HUB_STALE_TIME } from '../counts';
import { apiFetch } from '../client';

// GET /welding/hub-summary/: the welding work the İmalat hub shows, in a few
// aggregate queries. Welding work = the Kaynaklı İmalat subtasks assigned to
// a subcontractor or an internal team (paint and closed jobs left out).

/** A subcontractor or internal team with open welding work or progress this month. */
export interface WeldingHubResource {
  resource_type: 'subcontractor' | 'team' | string;
  id: number;
  name: string;
  short_name?: string | null;
  open_tasks: number;
  overdue_tasks: number;
  open_kg: number;
  overdue_kg: number;
  /** Welding progressed this month, as kg of the allocated weight. */
  month_kg: number;
}

export interface WeldingHubSummary {
  today?: string;
  month_start?: string;
  open_tasks: number;
  open_kg: number;
  /** Open and past their target date. */
  overdue_tasks: number;
  overdue_kg: number;
  month_welded_kg: number;
  /** Job-level, the management report's manufactured tonnage. */
  month_manufactured_kg?: number;
  /** Overdue first, then the heaviest open work. */
  resources: WeldingHubResource[];
}

export function weldingHubSummaryQueryOptions() {
  return queryOptions({
    queryKey: ['welding', 'hubSummary'] as const,
    queryFn: ({ signal }) => apiFetch<WeldingHubSummary>('/welding/hub-summary/', { signal }),
    staleTime: HUB_STALE_TIME,
  });
}
