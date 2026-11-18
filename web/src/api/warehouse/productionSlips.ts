import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// İmalattan İade (backend /warehouse/production-slips/): material brought back
// from production, booked against the job's handed-over İmalata Çıkış Talebi
// lines; what comes back can be pulled again. Material goes to production only
// on a request now, so new slips are returns; the old direct "İmalata çıkış"
// slips still list. A slip is posted when saved; cancelling reverses it.

export type SlipKind = 'issue' | 'return';
export type SlipWarehouse = 'HAMMADDE' | 'IS_EMRI';

export interface ProductionSlipLine {
  id: number;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  quantity: string | number;
  note: string;
  /** Returns: the İmalata Çıkış Talebi line it brings back (null on old slips). */
  pull_item?: number | null;
  pull_request?: number | null;
  pull_request_number?: string | null;
  /** Bars brought back as lots in the job's İş Emri. */
  pieces?: { piece: number; length_mm: string; quantity: number }[];
}

export interface ProductionSlip {
  id: number;
  number: string;
  kind: SlipKind | string;
  kind_label: string;
  warehouse_code: SlipWarehouse | string;
  warehouse_name: string;
  job_no: string;
  recipient: string;
  note: string;
  status: 'posted' | 'cancelled' | string;
  status_label: string;
  created_by_name: string | null;
  created_at: string;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  lines: ProductionSlipLine[];
}

export interface ProductionSlipsParams {
  page?: number;
  page_size?: number;
  kind?: string;
  status?: string;
  job_no?: string;
  search?: string;
}

export interface ReturnBar {
  length_mm: string;
  quantity: number;
}

/** An İmalattan İade: each line names the handed-over request line; bars by length × count. */
export interface ProductionSlipInput {
  job_no: string;
  recipient?: string;
  note?: string;
  lines: ({ pull_item: number; quantity: string } | { pull_item: number; pieces: ReturnBar[] })[];
}

/** A job's handed-over İmalata Çıkış Talebi line, for the return form. */
export interface ReturnableLine {
  id: number;
  pull_request: number;
  pull_request_number: string;
  destination_name: string;
  transferred_at: string | null;
  item_code: string;
  item_name: string;
  item_unit: string;
  job_no: string;
  is_bar: boolean;
  quantity: string;
  returned_quantity: string;
  returnable_quantity: string;
  pieces: { id: number; piece: number; quantity: number; length_mm: string | null }[];
}

const BASE = '/warehouse/production-slips/';

export const slipKeys = {
  all: ['productionSlips'] as const,
  list: (params: ProductionSlipsParams) => ['productionSlips', 'list', params] as const,
  detail: (id: number) => ['productionSlips', 'detail', id] as const,
  returnable: (jobNo: string) => ['productionSlips', 'returnable', jobNo] as const,
};

export function productionSlipsQueryOptions(params: ProductionSlipsParams) {
  return queryOptions({
    queryKey: slipKeys.list(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
        toPaginated<ProductionSlip>(data),
      ),
  });
}

export function productionSlipQueryOptions(id: number) {
  return queryOptions({
    queryKey: slipKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<ProductionSlip>(`${BASE}${id}/`, { signal }),
  });
}

export function returnableLinesQueryOptions(jobNo: string) {
  return queryOptions({
    queryKey: slipKeys.returnable(jobNo),
    queryFn: ({ signal }) =>
      apiFetch<ReturnableLine[]>(`${BASE}returnable/`, { params: { job_no: jobNo }, signal }),
  });
}

export function createProductionSlip(data: ProductionSlipInput) {
  return apiFetch<ProductionSlip>(BASE, { method: 'POST', body: data });
}

export function cancelProductionSlip(id: number) {
  return apiFetch<ProductionSlip>(`${BASE}${id}/cancel/`, { method: 'POST' });
}
