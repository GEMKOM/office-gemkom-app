import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { toPaginated } from '../types';
import { stockKeys, type WarehouseCode } from '../procurement/stock';

// Sayım (stock counts): backend /warehouse/stock-counts/. A count covers one
// warehouse; posting turns each line's difference into a count adjustment.

export type StockCountStatus = 'draft' | 'posted' | 'cancelled';

export interface StockCount {
  id: number;
  number: string;
  warehouse: number;
  warehouse_code: WarehouseCode | string;
  warehouse_name: string;
  status: StockCountStatus | string;
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
}

export interface StockCountLine {
  id: number;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  /** İş Emri only; '' = the unassigned bucket. */
  job_no: string;
  counted_quantity: string | number | null;
  /** Draft: what the ledger holds now. Posted: frozen at posting. */
  system_quantity: string | number;
  difference: string | number | null;
  note: string;
}

export interface StockCountsParams {
  page?: number;
  page_size?: number;
  status?: string;
  warehouse__code?: string;
  ordering?: string;
}

export interface StockCountLinesParams {
  page?: number;
  page_size?: number;
  search?: string;
  uncounted?: 'true';
}

export interface StockCountLineInput {
  item: number;
  job_no?: string;
  counted_quantity?: string | null;
  note?: string;
}

export interface PrefillInput {
  category_code?: string;
  code_prefix?: string;
  job_no?: string;
}

const BASE = '/warehouse/stock-counts/';
const detail = (id: number) => `${BASE}${id}/`;

export const countKeys = {
  all: ['stockCounts'] as const,
  list: (params: StockCountsParams) => ['stockCounts', 'list', params] as const,
  detail: (id: number) => ['stockCounts', 'detail', id] as const,
  lines: (id: number, params: StockCountLinesParams) =>
    ['stockCounts', 'lines', id, params] as const,
};

/** The backend's `detail` message, else the fallback. */
export function countErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const data = error.data as { detail?: unknown } | unknown[] | undefined;
    if (data && !Array.isArray(data) && typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data)) return JSON.stringify(data);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function getStockCounts(params: StockCountsParams, signal?: AbortSignal) {
  return apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
    toPaginated<StockCount>(data),
  );
}

export function stockCountsQueryOptions(params: StockCountsParams) {
  return queryOptions({
    queryKey: countKeys.list(params),
    queryFn: ({ signal }) => getStockCounts(params, signal),
  });
}

export function stockCountQueryOptions(id: number) {
  return queryOptions({
    queryKey: countKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<StockCount>(detail(id), { signal }),
  });
}

export function stockCountLinesQueryOptions(id: number, params: StockCountLinesParams) {
  return queryOptions({
    queryKey: countKeys.lines(id, params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(`${detail(id)}lines/`, { params: { ...params }, signal }).then((data) =>
        toPaginated<StockCountLine>(data),
      ),
  });
}

export function createStockCount(data: {
  warehouse_code: WarehouseCode;
  counted_on?: string;
  note?: string;
}) {
  return apiFetch<StockCount>(BASE, { method: 'POST', body: data });
}

export function setStockCountLines(id: number, lines: StockCountLineInput[]) {
  return apiFetch<StockCount>(`${detail(id)}lines/`, { method: 'POST', body: lines });
}

export function removeStockCountLines(id: number, ids: number[]) {
  return apiFetch<{ removed: number }>(`${detail(id)}remove-lines/`, {
    method: 'POST',
    body: { ids },
  });
}

export function prefillStockCount(id: number, data: PrefillInput) {
  return apiFetch<{ added: number }>(`${detail(id)}prefill/`, { method: 'POST', body: data });
}

export function postStockCount(id: number) {
  return apiFetch<StockCount>(`${detail(id)}post/`, { method: 'POST' });
}

export function cancelStockCount(id: number) {
  return apiFetch<StockCount>(`${detail(id)}cancel/`, { method: 'POST' });
}

/** Every count mutation refreshes the counts; posting also moves stock. */
export function useCountMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  options: { movesStock?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: countKeys.all });
      if (options.movesStock) {
        void queryClient.invalidateQueries({ queryKey: stockKeys.all });
        void queryClient.invalidateQueries({ queryKey: ['procurementItems'] });
      }
    },
  });
}
