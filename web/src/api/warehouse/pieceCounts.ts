import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';
import type { WarehouseCode } from '../procurement/stock';
import { pieceKeys, type PieceKind } from './pieces';

// Sac ve boy sayımı (backend /warehouse/piece-counts/): plate / boy pieces
// counted in one warehouse. Lines are lots, prefilled from what the system
// holds or added for pieces it did not know. Posting sets counted lots and
// opens new ones (origin "count"): the plate / boy opening stock.

export interface PieceCount {
  id: number;
  number: string;
  warehouse: number;
  warehouse_code: WarehouseCode | string;
  warehouse_name: string;
  status: 'draft' | 'posted' | 'cancelled' | string;
  status_label: string;
  counted_on: string;
  note: string;
  created_by_name: string | null;
  created_at: string;
  posted_by_name: string | null;
  posted_at: string | null;
  line_count: number;
  counted_count: number;
  difference_count: number;
  counted_pieces: number | null;
  /** One count's detail only: counted kg where the card has the data. */
  totals: { kg: string; pieces_without_weight: number } | null;
}

export interface PieceCountLine {
  id: number;
  item: number;
  item_code: string;
  item_name: string;
  kind: PieceKind | null;
  /** The lot this line counts; null = pieces the system did not know. */
  piece: number | null;
  width_mm: string | null;
  length_mm: string;
  job_no: string;
  counted_quantity: number | null;
  /** Draft: what the lot holds now. Posted: frozen at posting. */
  system_quantity: number;
  difference: number | null;
  unit_kg: string | null;
  counted_kg: string | null;
  heat_number: string;
  certificate_no: string;
  note: string;
  result_piece: number | null;
}

export interface PieceCountLineInput {
  id?: number;
  item?: number;
  width_mm?: string | null;
  length_mm?: string;
  job_no?: string;
  counted_quantity?: number | null;
  heat_number?: string;
  certificate_no?: string;
  note?: string;
}

export interface PieceCountsParams {
  page?: number;
  page_size?: number;
  status?: string;
  warehouse__code?: string;
}

export interface PieceCountLinesParams {
  page?: number;
  page_size?: number;
  search?: string;
  uncounted?: 'true';
}

export interface PiecePrefillInput {
  kind?: PieceKind;
  category_code?: string;
  code_prefix?: string;
  job_no?: string;
}

/** One card: the piece stock vs Mikro's balance, in the card's unit. */
export interface MikroComparisonRow {
  item: number | null;
  code: string;
  name: string;
  unit: string;
  kind: PieceKind | null;
  category_code: string;
  pieces: number;
  kg: string | number | null;
  metre: string | number;
  /** What is compared: kg, metre or adet ('' for a code with no card). */
  basis: 'kg' | 'metre' | 'adet' | '';
  stock: string | number | null;
  mikro: string | number;
  difference: string | number | null;
  missing: string;
  in_app: boolean;
}

export interface MikroComparisonParams {
  page?: number;
  page_size?: number;
  kind?: PieceKind | '';
  search?: string;
  only_diff?: 'true';
}

const BASE = '/warehouse/piece-counts/';
const detail = (id: number) => `${BASE}${id}/`;

export const pieceCountKeys = {
  all: ['pieceCounts'] as const,
  list: (params: PieceCountsParams) => ['pieceCounts', 'list', params] as const,
  detail: (id: number) => ['pieceCounts', 'detail', id] as const,
  lines: (id: number, params: PieceCountLinesParams) =>
    ['pieceCounts', 'lines', id, params] as const,
  mikro: (params: MikroComparisonParams) => ['pieces', 'mikro', params] as const,
};

export function pieceCountsQueryOptions(params: PieceCountsParams) {
  return queryOptions({
    queryKey: pieceCountKeys.list(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
        toPaginated<PieceCount>(data),
      ),
  });
}

export function pieceCountQueryOptions(id: number) {
  return queryOptions({
    queryKey: pieceCountKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<PieceCount>(detail(id), { signal }),
  });
}

export function pieceCountLinesQueryOptions(id: number, params: PieceCountLinesParams) {
  return queryOptions({
    queryKey: pieceCountKeys.lines(id, params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(`${detail(id)}lines/`, { params: { ...params }, signal }).then((data) =>
        toPaginated<PieceCountLine>(data),
      ),
  });
}

export function mikroComparisonQueryOptions(params: MikroComparisonParams) {
  return queryOptions({
    queryKey: pieceCountKeys.mikro(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>('/warehouse/pieces/mikro-comparison/', {
        params: { ...params },
        signal,
      }).then((data) => toPaginated<MikroComparisonRow>(data)),
  });
}

export function createPieceCount(data: {
  warehouse_code: WarehouseCode;
  counted_on?: string;
  note?: string;
}) {
  return apiFetch<PieceCount>(BASE, { method: 'POST', body: data });
}

export function setPieceCountLines(id: number, lines: PieceCountLineInput[]) {
  return apiFetch<PieceCount>(`${detail(id)}lines/`, { method: 'POST', body: lines });
}

export function removePieceCountLines(id: number, ids: number[]) {
  return apiFetch<{ removed: number }>(`${detail(id)}remove-lines/`, {
    method: 'POST',
    body: { ids },
  });
}

export function prefillPieceCount(id: number, data: PiecePrefillInput) {
  return apiFetch<{ added: number }>(`${detail(id)}prefill/`, { method: 'POST', body: data });
}

export function postPieceCount(id: number) {
  return apiFetch<PieceCount>(`${detail(id)}post/`, { method: 'POST' });
}

export function cancelPieceCount(id: number) {
  return apiFetch<PieceCount>(`${detail(id)}cancel/`, { method: 'POST' });
}

/** Every count mutation refreshes the counts; posting also changes the pieces. */
export function usePieceCountMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  options: { movesPieces?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pieceCountKeys.all });
      if (options.movesPieces) void queryClient.invalidateQueries({ queryKey: pieceKeys.all });
    },
  });
}
