import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { extractResults, toPaginated, type Paginated } from '../types';
import type { Supplier } from './suppliers';

// Port of apis/purchaseOrders.js and the DBS-payment / evaluation calls of
// apis/procurement.js, as finance/purchase-orders (Finans İşlemleri) uses them.

/** Decimals arrive as strings. */
type Decimal = string | number | null | undefined;

export interface PaymentSchedule {
  id: number;
  purchase_order?: number;
  sequence?: number;
  label?: string;
  basis?: string;
  offset_days?: number;
  percentage?: Decimal;
  amount?: Decimal;
  currency?: string;
  due_date?: string | null;
  is_paid?: boolean;
  paid_at?: string | null;
  paid_by?: number | null;
  paid_with_tax?: boolean;
  base_tax?: Decimal;
  effective_tax_due?: Decimal;
}

export interface PurchaseOrderAllocation {
  id?: number;
  job_no?: string;
  quantity?: Decimal;
  amount?: Decimal;
}

export interface PurchaseOrderLine {
  id: number;
  item_code?: string;
  item_name?: string;
  item_description?: string;
  quantity?: Decimal;
  unit_price?: Decimal;
  total_price?: Decimal;
  delivery_days?: number | null;
  notes?: string | null;
  allocations?: PurchaseOrderAllocation[];
}

export interface PurchaseOrder {
  id: number;
  pr?: number | null;
  purchase_request_number?: string | null;
  supplier?: number;
  supplier_name?: string | null;
  currency?: string;
  total_amount?: Decimal;
  tax_rate?: Decimal;
  total_tax_amount?: Decimal;
  status?: string;
  status_label?: string | null;
  priority?: string;
  created_at?: string;
  line_count?: number;
  payment_schedules?: PaymentSchedule[];
  tax_outstanding?: Decimal;
  next_unpaid_due?: string | null;
  /** Detail only. */
  lines?: PurchaseOrderLine[];
}

/**
 * The backend filters on status, supplier and pr and orders on id,
 * created_at and total_amount; anything else is ignored.
 */
export type PurchaseOrdersParams = {
  status?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export interface DbsPayment {
  id: number;
  supplier?: number;
  amount?: Decimal;
  currency?: string;
  note?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  paid_by_username?: string | null;
}

export const purchaseOrderKeys = {
  all: ['purchaseOrders'] as const,
  list: (params: PurchaseOrdersParams) =>
    ['purchaseOrders', 'list', cleanParams(params as QueryParams)] as const,
  detail: (id: number | string) => ['purchaseOrders', 'detail', String(id)] as const,
  dbsSuppliers: ['dbsSuppliers'] as const,
  dbsPayments: (supplierId: number) => ['dbsPayments', supplierId] as const,
};

const BASE = '/procurement/purchase-orders/';

// ---- purchase orders ---------------------------------------------------------------

export function getPurchaseOrders(
  params: PurchaseOrdersParams = {},
  signal?: AbortSignal,
): Promise<Paginated<PurchaseOrder>> {
  return apiFetch<unknown>(BASE, { params: params as QueryParams, signal }).then((data) =>
    toPaginated<PurchaseOrder>(data),
  );
}

export function purchaseOrdersQueryOptions(params: PurchaseOrdersParams) {
  return queryOptions({
    queryKey: purchaseOrderKeys.list(params),
    queryFn: ({ signal }) => getPurchaseOrders(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function getPurchaseOrder(
  id: number | string,
  signal?: AbortSignal,
): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>(`${BASE}${id}/`, { signal });
}

export function purchaseOrderQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: purchaseOrderKeys.detail(id),
    queryFn: ({ signal }) => getPurchaseOrder(id, signal),
  });
}

/** Admin only on the backend; it also cancels the order's purchase request. */
export function deletePurchaseOrder(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}${id}/`, { method: 'DELETE' });
}

export function markSchedulePaid(
  orderId: number,
  scheduleId: number,
  paidWithTax: boolean,
): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>(`${BASE}${orderId}/mark_schedule_paid/`, {
    method: 'POST',
    body: { schedule_id: scheduleId, paid_with_tax: paidWithTax },
  });
}

/** GET /procurement/supplier-evaluations/?purchase_order=: the order's evaluation, if any. */
export async function listOrderEvaluations(orderId: number): Promise<unknown[]> {
  return extractResults<unknown>(
    await apiFetch<unknown>('/procurement/supplier-evaluations/', {
      params: { purchase_order: orderId },
    }),
  );
}

// ---- DBS (direct debit) suppliers ----------------------------------------------------

/** Legacy getSuppliers({ has_dbs: true }), which always asked for 1000 rows. */
export function dbsSuppliersQueryOptions() {
  return queryOptions({
    queryKey: purchaseOrderKeys.dbsSuppliers,
    queryFn: async ({ signal }) =>
      extractResults<Supplier>(
        await apiFetch<unknown>('/procurement/suppliers/', {
          params: { has_dbs: true, page_size: 1000 },
          signal,
        }),
      ),
  });
}

export function dbsPaymentsQueryOptions(supplierId: number) {
  return queryOptions({
    queryKey: purchaseOrderKeys.dbsPayments(supplierId),
    queryFn: async ({ signal }) =>
      extractResults<DbsPayment>(
        await apiFetch<unknown>('/procurement/dbs-payments/', {
          params: { supplier: supplierId },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

export function createDbsPayment(payload: {
  supplier: number;
  amount: string;
  note?: string;
}): Promise<DbsPayment> {
  return apiFetch<DbsPayment>('/procurement/dbs-payments/', { method: 'POST', body: payload });
}

/** Cancels a payment; the backend gives the amount back to the supplier's used credit. */
export function deleteDbsPayment(paymentId: number): Promise<void> {
  return apiFetch<void>(`/procurement/dbs-payments/${paymentId}/`, { method: 'DELETE' });
}
