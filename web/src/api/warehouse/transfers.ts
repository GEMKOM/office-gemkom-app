import { queryOptions } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { toPaginated } from '../types';
import type { WarehouseCode } from '../procurement/stock';

// Depo transferi (backend /warehouse/transfers/): stock moved by hand between
// Hammadde, İş Emri (per job, '' = unassigned) and Mamul. Posted when saved;
// cancelling reverses it. Lines over the source balance answer 409 with the
// shortages until the request is sent again with allow_negative.

export interface TransferLine {
  id: number;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  quantity: string | number;
  note: string;
}

export interface TransferSlip {
  id: number;
  number: string;
  from_warehouse_code: WarehouseCode | string;
  from_warehouse_name: string;
  from_job_no: string;
  to_warehouse_code: WarehouseCode | string;
  to_warehouse_name: string;
  to_job_no: string;
  note: string;
  went_negative: boolean;
  status: 'posted' | 'cancelled' | string;
  status_label: string;
  created_by_name: string | null;
  created_at: string;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  lines: TransferLine[];
}

export interface TransfersParams {
  page?: number;
  page_size?: number;
  status?: string;
  job_no?: string;
  warehouse?: string;
  search?: string;
}

export interface TransferInput {
  from_warehouse_code: WarehouseCode;
  from_job_no: string;
  to_warehouse_code: WarehouseCode;
  to_job_no: string;
  note?: string;
  allow_negative?: boolean;
  lines: { item: number; quantity: string }[];
}

export interface TransferShortage {
  item: number;
  item_code: string;
  item_name: string;
  available: string;
  quantity: string;
}

const BASE = '/warehouse/transfers/';

export const transferKeys = {
  all: ['transfers'] as const,
  list: (params: TransfersParams) => ['transfers', 'list', params] as const,
  detail: (id: number) => ['transfers', 'detail', id] as const,
};

export function transfersQueryOptions(params: TransfersParams) {
  return queryOptions({
    queryKey: transferKeys.list(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
        toPaginated<TransferSlip>(data),
      ),
  });
}

export function transferQueryOptions(id: number) {
  return queryOptions({
    queryKey: transferKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<TransferSlip>(`${BASE}${id}/`, { signal }),
  });
}

export function createTransfer(data: TransferInput) {
  return apiFetch<TransferSlip>(BASE, { method: 'POST', body: data });
}

export function cancelTransfer(id: number) {
  return apiFetch<TransferSlip>(`${BASE}${id}/cancel/`, { method: 'POST' });
}

/** The shortages of a 409 answer, or null for any other error. */
export function transferShortages(error: unknown): TransferShortage[] | null {
  if (!isApiError(error) || error.status !== 409) return null;
  const data = error.data as { shortages?: TransferShortage[] } | undefined;
  return Array.isArray(data?.shortages) ? data.shortages : null;
}

/** "İş Emri · 254-01", "İş Emri · atanmamış", "Hammadde". */
export function sideLabel(name: string, code: string, jobNo: string): string {
  if (code !== 'IS_EMRI') return name;
  return `${name} · ${jobNo || 'atanmamış'}`;
}
