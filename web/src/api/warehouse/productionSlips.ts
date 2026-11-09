import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// İmalata çıkış / iade (backend /warehouse/production-slips/): material handed
// to production for a job without a Depo çekme, or brought back. A slip is
// posted to the stock ledger when it is saved; cancelling reverses it.

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

export interface ProductionSlipInput {
  kind: SlipKind;
  warehouse_code: SlipWarehouse;
  job_no: string;
  recipient?: string;
  note?: string;
  lines: { item: number; quantity: string; note?: string }[];
}

const BASE = '/warehouse/production-slips/';

export const slipKeys = {
  all: ['productionSlips'] as const,
  list: (params: ProductionSlipsParams) => ['productionSlips', 'list', params] as const,
  detail: (id: number) => ['productionSlips', 'detail', id] as const,
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

export function createProductionSlip(data: ProductionSlipInput) {
  return apiFetch<ProductionSlip>(BASE, { method: 'POST', body: data });
}

export function cancelProductionSlip(id: number) {
  return apiFetch<ProductionSlip>(`${BASE}${id}/cancel/`, { method: 'POST' });
}
