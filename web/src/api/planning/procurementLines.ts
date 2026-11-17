import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Procurement (material cost) lines from apis/projects/cost.js, for
// planning/procurement-lines: the job orders still waiting for lines, the ones
// that have some, the lines of one job order (saved or previewed), the
// replace-all submit and the cost_not_applicable flag.

export type Decimal = string | number;

export interface ProcurementJobOrder {
  job_no: string;
  title?: string | null;
  customer_name?: string | null;
  status?: string | null;
  target_completion_date?: string | null;
  /** On has_procurement rows. */
  cost_not_applicable?: boolean | null;
}

export interface ProcurementJobOrdersParams {
  status?: string;
  search?: string;
  /** has_procurement only: 'true' / 'false'. */
  cost_not_applicable?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
}

/** price_source values of saved and preview lines. */
export type PriceSource =
  | 'po_line'
  | 'recommended_offer'
  | 'any_offer'
  | 'historical_po'
  | 'cut_lot'
  | 'cuts_mixed'
  | 'none'
  | (string & {});

/** One saved line (GET /projects/procurement-lines/?job_order=). */
export interface ProcurementLine {
  id?: number;
  item?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  item_description?: string | null;
  quantity?: Decimal | null;
  unit_price?: Decimal | null;
  amount_eur?: Decimal | null;
  planning_request_item?: number | null;
  order?: number | null;
  price_source?: PriceSource | null;
  price_date?: string | null;
  /** 'cuts': saved from a preview line from cuts; '' otherwise (older lines too). */
  source?: string | null;
  /** The breakdown key of a cut line (?group=). */
  cut_group?: string | null;
}

/**
 * Flags of a cut line or breakdown row: fire_unknown (no fire share charged),
 * no_weight (a part without weight), cut_no_weight (no part on the cut has a
 * weight), partly_priced (lines: some kg has no price).
 */
export type CutFlag = 'fire_unknown' | 'no_weight' | 'cut_no_weight' | 'partly_priced' | (string & {});

/** One preview line (pre-filled from planning and purchase history, not saved). */
export interface ProcurementLinePreview {
  item?: number | null;
  item_code?: string | null;
  item_name?: string | null;
  item_unit?: string | null;
  item_description?: string | null;
  quantity?: Decimal | null;
  unit_price_eur?: Decimal | null;
  planning_request_item?: number | null;
  order?: number | null;
  price_source?: PriceSource | null;
  price_date?: string | null;
  /**
   * 'cuts': a plate card's kg from the job's finished CNC cuts (its parts + their
   * share of the fire); plate is not suggested from the plates bought for the job.
   */
  source?: 'planning' | 'cuts';
  cut_count?: number | null;
  /** Some cut was finished before its fire was booked: the fire is estimated from its size. */
  fire_estimated?: boolean;
  /** 'cuts' only: the breakdown key ('item:<id>', or 'material:<label>' without a card). */
  cut_group?: string | null;
  /** 'cuts' only: kg with no price (the unit price averages the priced kg). */
  unpriced_kg?: Decimal | null;
  flags?: CutFlag[];
}

/** One part of the job on a finished CNC cut, behind a plate line's kg. */
export interface CutBreakdownRow {
  cnc_task: string;
  nesting_id: string | null;
  finished_on: string | null;
  item: number | null;
  item_code: string | null;
  item_name: string | null;
  group: string;
  material: string;
  thickness_mm: string | null;
  lot: string;
  /** The lot the sheet came from; a cut on several lots has one row per lot. */
  lot_id: number | null;
  /** This lot's share of the cut (1 for a single lot). */
  lot_share: string;
  part: number;
  image_no: string | null;
  position_no: string | null;
  parts_kg: string;
  fire_kg: string;
  kg: string;
  fire_estimated: boolean;
  flags: CutFlag[];
  unit_price_eur: string | null;
  original_unit_price: string | null;
  original_currency: string | null;
  price_source: PriceSource;
  price_date: string | null;
}

/** One line as submit/ takes it: item or item_description is required. */
export interface ProcurementLineInput {
  item?: number;
  item_description?: string;
  quantity: string;
  unit_price: string;
  planning_request_item?: number;
  order: number;
  /** A line from cuts keeps its source and breakdown key. */
  source?: 'cuts';
  cut_group?: string;
}

export const procurementLineKeys = {
  all: ['procurementLines'] as const,
  pending: (params: ProcurementJobOrdersParams) =>
    ['procurementLines', 'pending', cleanParams({ ...params })] as const,
  hasProcurement: (params: ProcurementJobOrdersParams) =>
    ['procurementLines', 'hasProcurement', cleanParams({ ...params })] as const,
};

const STALE_TIME = 30_000;

/** Job orders waiting for procurement lines (getProcurementPendingJobOrders). */
export function procurementPendingQueryOptions(params: ProcurementJobOrdersParams) {
  return queryOptions({
    queryKey: procurementLineKeys.pending(params),
    queryFn: async ({ signal }) =>
      toPaginated<ProcurementJobOrder>(
        await apiFetch<unknown>('/projects/job-orders/procurement_pending/', {
          params: { ...params },
          signal,
        }),
      ),
    staleTime: STALE_TIME,
  });
}

/** Job orders with at least one procurement line (getJobOrdersHasProcurement). */
export function jobOrdersHasProcurementQueryOptions(params: ProcurementJobOrdersParams) {
  return queryOptions({
    queryKey: procurementLineKeys.hasProcurement(params),
    queryFn: async ({ signal }) =>
      toPaginated<ProcurementJobOrder>(
        await apiFetch<unknown>('/projects/job-orders/has_procurement/', {
          params: { ...params },
          signal,
        }),
      ),
    staleTime: STALE_TIME,
  });
}

/** Saved lines of a job order (getProcurementLines). Fetched imperatively by the editor. */
export async function fetchProcurementLines(jobNo: string): Promise<ProcurementLine[]> {
  return extractResults<ProcurementLine>(
    await apiFetch<unknown>('/projects/procurement-lines/', { params: { job_order: jobNo } }),
  );
}

/** Preview lines of a job order (getProcurementLinesPreview). */
export async function fetchProcurementLinesPreview(
  jobNo: string,
): Promise<ProcurementLinePreview[]> {
  return extractResults<ProcurementLinePreview>(
    await apiFetch<unknown>('/projects/procurement-lines/preview/', {
      params: { job_order: jobNo },
    }),
  );
}

/** The cuts and parts behind a plate line, by its cut_group. */
export function cutBreakdownQueryOptions(jobNo: string, group: string) {
  return queryOptions({
    queryKey: [...procurementLineKeys.all, 'cut-breakdown', jobNo, group] as const,
    queryFn: async ({ signal }) =>
      extractResults<CutBreakdownRow>(
        await apiFetch<unknown>('/projects/procurement-lines/cut-breakdown/', {
          params: { job_order: jobNo, group },
          signal,
        }),
      ),
  });
}

/** Replaces every procurement line of the job order (submitProcurementLines); [] clears them. */
export function useSubmitProcurementLines() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNo, lines }: { jobNo: string; lines: ProcurementLineInput[] }) =>
      apiFetch<unknown>('/projects/procurement-lines/submit/', {
        method: 'POST',
        body: { job_order: jobNo, lines },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: procurementLineKeys.all }),
  });
}

/** PATCH cost_summary with cost_not_applicable (patchJobCostSummary). */
export function useSetCostNotApplicable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobNo, value }: { jobNo: string; value: boolean }) =>
      apiFetch<unknown>(`/projects/job-orders/${encodeURIComponent(jobNo)}/cost_summary/`, {
        method: 'PATCH',
        body: { cost_not_applicable: value },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: procurementLineKeys.all }),
  });
}
