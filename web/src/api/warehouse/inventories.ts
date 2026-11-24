import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';
import type { MaterialPiece } from './pieces';
import type { TransferSlip } from './transfers';

// The warehouse's two daily inventories (backend warehouse.inventories):
// Hammadde (free stock) and İş Emri per job ('' = atanmamış, not tied to a
// job). Cards come from /warehouse/stock-balances/, plate / bar lots from
// /warehouse/pieces/. A move takes cards and lots from one place to another in
// one call: cards as a Depo transferi slip, lots moved with the slip number in
// their history. Lines over the source balance answer 409 with the shortages
// until sent again with allow_negative.

export type InventoryWarehouse = 'HAMMADDE' | 'IS_EMRI';

/** A place stock sits in: Hammadde, or İş Emri on a job ('' = atanmamış). */
export interface InventoryPlace {
  warehouse: InventoryWarehouse;
  jobNo: string;
}

/** What İş Emri holds for one job (GET /warehouse/inventories/jobs/). */
export interface JobHolding {
  /** '' = atanmamış. */
  job_no: string;
  job_title: string;
  /** The job order's status (null: no job order with this number). */
  job_status?: string | null;
  /** The job order is completed or cancelled but still holds stock here. */
  job_closed?: boolean;
  /** Cards with a balance above zero on the job. */
  cards: number;
  /** Cards below zero (issued before they were received or counted). */
  negative_cards: number;
  lots: number;
  pieces: number;
  /** kg of the lots that have a weight. */
  kg: string;
  /** Some lot has no weight (its card lacks thickness or kg/m). */
  kg_unknown: boolean;
}

/** A card's balance at one place (/warehouse/stock-balances/). */
export interface PlaceBalance {
  id: number;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  warehouse_code: string;
  job_no: string;
  quantity: string;
  updated_at: string;
}

export interface PlaceBalancesParams {
  page?: number;
  page_size?: number;
  search?: string;
}

export interface MoveInput {
  from_warehouse_code: InventoryWarehouse;
  from_job_no: string;
  to_warehouse_code: InventoryWarehouse;
  to_job_no: string;
  note?: string;
  allow_negative?: boolean;
  lines: { item: number; quantity: string }[];
  pieces: { piece: number; quantity: number }[];
}

export interface MoveResult {
  /** The Depo transferi slip of the card lines; null when only lots moved. */
  slip: TransferSlip | null;
  pieces: MaterialPiece[];
}

export const inventoryKeys = {
  all: ['inventories'] as const,
  jobs: (search: string, closed?: boolean) => ['inventories', 'jobs', search, closed] as const,
  balances: (place: InventoryPlace, params: PlaceBalancesParams) =>
    ['inventories', 'balances', place, params] as const,
};

/** Query params that select a place on the stock-balances and pieces lists. */
export function placeParams(place: InventoryPlace) {
  if (place.warehouse === 'HAMMADDE') return { warehouse: 'HAMMADDE' };
  return place.jobNo
    ? { warehouse: 'IS_EMRI', job_no: place.jobNo }
    : { warehouse: 'IS_EMRI', unassigned: 'true' as const };
}

/**
 * İş Emri's jobs. `closed`: leave it out for every job; false leaves out the
 * completed / cancelled jobs (job_closed), true keeps only those. The
 * unassigned bucket is always listed.
 */
export function jobHoldingsQueryOptions(search = '', closed?: boolean) {
  return queryOptions({
    queryKey: inventoryKeys.jobs(search, closed),
    queryFn: ({ signal }) =>
      apiFetch<unknown>('/warehouse/inventories/jobs/', {
        params: {
          ...(search ? { search } : {}),
          ...(closed === undefined ? {} : { closed: String(closed) }),
        },
        signal,
      }).then((data) => extractResults<JobHolding>(data)),
  });
}

export function placeBalancesQueryOptions(place: InventoryPlace, params: PlaceBalancesParams) {
  const { warehouse, ...rest } = placeParams(place);
  return queryOptions({
    queryKey: inventoryKeys.balances(place, params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>('/warehouse/stock-balances/', {
        params: { ...params, ...rest, warehouse__code: warehouse, ordering: 'item__code' },
        signal,
      }).then((data) => toPaginated<PlaceBalance>(data)),
  });
}

export function moveStock(data: MoveInput) {
  return apiFetch<MoveResult>('/warehouse/inventories/move/', { method: 'POST', body: data });
}

/** "Hammadde", "İş Emri · 254-01", "İş Emri · atanmamış". */
export function placeText(place: InventoryPlace): string {
  if (place.warehouse === 'HAMMADDE') return 'Hammadde';
  return `İş Emri · ${place.jobNo || 'atanmamış'}`;
}
