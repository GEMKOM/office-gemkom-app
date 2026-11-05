import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// The stock ledger (backend warehouse app): warehouses, balances per card /
// warehouse / job, and the movements. Read-only here; the backend posts
// movements when goods are received, given from stock or pulled to production.

export type WarehouseCode = 'HAMMADDE' | 'IS_EMRI' | 'MAMUL';

export const WAREHOUSE_LABELS: Record<WarehouseCode, string> = {
  HAMMADDE: 'Hammadde',
  IS_EMRI: 'İş Emri',
  MAMUL: 'Mamul',
};

export function warehouseLabel(code: string | null | undefined): string {
  if (!code) return '-';
  return WAREHOUSE_LABELS[code as WarehouseCode] ?? code;
}

export interface StockBalance {
  id: number;
  item: number;
  warehouse_code: string;
  warehouse_name: string;
  /** İş Emri only; '' = not assigned to a job (Mikro's opening). */
  job_no: string;
  quantity: number | string;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  movement_type: string;
  movement_type_label: string;
  item: number;
  quantity: number | string;
  from_warehouse_code: string | null;
  from_job_no: string;
  to_warehouse_code: string | null;
  to_job_no: string;
  occurred_at: string;
  created_by_name: string | null;
  note: string;
  planning_request_number: string | null;
  pull_request_number: string | null;
  reverses: number | null;
}

export const stockKeys = {
  all: ['stockLedger'] as const,
  balances: (itemId: number) => ['stockLedger', 'balances', itemId] as const,
  movements: (itemId: number, page: number) => ['stockLedger', 'movements', itemId, page] as const,
};

export function getItemBalances(itemId: number, signal?: AbortSignal): Promise<StockBalance[]> {
  return apiFetch<unknown>('/warehouse/stock-balances/', {
    params: { item: itemId, page_size: 500 },
    signal,
  }).then((data) => extractResults<StockBalance>(data));
}

export function itemBalancesQueryOptions(itemId: number) {
  return queryOptions({
    queryKey: stockKeys.balances(itemId),
    queryFn: ({ signal }) => getItemBalances(itemId, signal),
  });
}

export function getItemMovements(
  itemId: number,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
) {
  return apiFetch<unknown>('/warehouse/stock-movements/', {
    params: { item: itemId, page, page_size: pageSize },
    signal,
  }).then((data) => toPaginated<StockMovement>(data));
}

export function itemMovementsQueryOptions(itemId: number, page: number, pageSize = 20) {
  return queryOptions({
    queryKey: stockKeys.movements(itemId, page),
    queryFn: ({ signal }) => getItemMovements(itemId, page, pageSize, signal),
  });
}
