import { queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { toPaginated } from '../types';

/** A row of `/cnc_cutting/parts/search/` (apis/cnc_cutting/parts.js searchCncParts). */
export interface CncPartSearchRow {
  id: number;
  job_no?: string | null;
  image_no?: string | null;
  position_no?: string | null;
  weight_kg?: string | number | null;
  quantity?: number | string | null;
  nesting_id?: string | null;
  material?: string | null;
  thickness_mm?: string | number | null;
  planning_request_item?: unknown;
  plate_item_name?: string | null;
  plate_item_code?: string | null;
  plate_item_quantity?: string | number | null;
  plate_item_delivered_quantity?: string | number | null;
  plate_item_is_delivered?: boolean | null;
  has_remnant_plate?: boolean | null;
  planned_start_ms?: number | null;
  planned_end_ms?: number | null;
  completion_date?: string | number | null;
  [key: string]: unknown;
}

export type CncPartsSearchParams = {
  job_no?: string;
  image_no?: string;
  position_no?: string;
  page?: number;
  page_size?: number;
};

export function cncPartsSearchQueryOptions(params: CncPartsSearchParams) {
  return queryOptions({
    queryKey: ['cncParts', 'search', cleanParams(params)] as const,
    queryFn: async ({ signal }) =>
      toPaginated<CncPartSearchRow>(
        await apiFetch<unknown>('/cnc_cutting/parts/search/', { params, signal }),
      ),
  });
}
