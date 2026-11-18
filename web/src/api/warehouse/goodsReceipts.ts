import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults, toPaginated } from '../types';

// Mal kabul (backend /warehouse/goods-receipts/): goods received against one
// purchase order, with the irsaliye. A PO line with a planning line books the
// receipt there; one without posts the stock by its job allocations. Job
// numbers for general work (1000, 5715) land in Hammadde. Cancelling undoes it.
// Plate / boy lines (piece-level stock) are received with their pieces: size,
// count, heat number, certificate; they become lots where the line lands.

/** A piece lot a receipt line brought. */
export interface ReceiptPiece {
  id: number;
  width_mm: string | null;
  length_mm: string;
  /** How many arrived (the receipt movement). */
  quantity: number;
  /** What of them is still in that lot. */
  in_stock: number;
  unit_kg: string | null;
  heat_number: string;
  certificate_no: string;
}

export interface ReceiptPieceInput {
  width_mm?: string | null;
  length_mm: string;
  quantity: number;
  heat_number?: string;
  certificate_no?: string;
}

export interface GoodsReceiptLine {
  id: number;
  po_line: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  quantity: string | number;
  job_no: string | null;
  delivery: number | null;
  note: string;
  pieces: ReceiptPiece[];
  /** Weight of the pieces that arrived; null when none, or some weigh nothing. */
  pieces_kg: string | null;
}

export interface GoodsReceipt {
  id: number;
  number: string;
  purchase_order: number;
  supplier_name: string;
  pr_number: string;
  irsaliye_no: string;
  irsaliye_date: string | null;
  note: string;
  status: 'posted' | 'cancelled' | string;
  status_label: string;
  created_by_name: string | null;
  created_at: string;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  lines: GoodsReceiptLine[];
}

export interface ReceivableOrder {
  id: number;
  supplier_name: string;
  pr_number: string;
  pr_title: string;
  status: string;
  status_label: string;
  created_at: string;
  line_count: number;
}

/** One PO line as Mal kabul sees it. Quantities are decimal strings. */
export interface OrderLineState {
  po_line: number;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  ordered: string;
  received: string;
  outstanding: string;
  /** What this receipt may take (0 when it cannot be received; see `reason`). */
  receivable: string;
  planning_item: number | null;
  job_no: string | null;
  /** "İş Emri · 254-01", "Hammadde", or both for a split direct line. */
  destination: string;
  reason: string;
  /** Plate / boy lines are received with their pieces; null for other cards. */
  piece_kind?: 'plate' | 'boy' | null;
  plate_thickness_mm?: string | null;
  kg_per_m?: string | null;
  /** What the card lacks for its pieces to weigh something ('' if nothing). */
  weight_missing?: string;
  /** Sized lines: what was ordered as one text ("1500×6000 mm × 2 adet · 1.413 kg"). */
  size_summary?: string;
  /** Sized lines: the pieces still to come, to start the pieces form from. */
  outstanding_pieces?: { width_mm: string | null; length_mm: string; count: number | null } | null;
}

export interface GoodsReceiptsParams {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}

export interface GoodsReceiptInput {
  purchase_order: number;
  irsaliye_no: string;
  irsaliye_date: string | null;
  note?: string;
  lines: { po_line: number; quantity: string; pieces?: ReceiptPieceInput[] }[];
}

/** Bekleyen Siparişler: a PO line still to arrive. Quantities are decimal strings. */
export interface PendingLine {
  po_line: number;
  purchase_order: number;
  supplier: number;
  supplier_name: string;
  pr_number: string;
  /** Order date (YYYY-MM-DD). */
  ordered_at: string;
  item: number;
  item_code: string;
  item_name: string;
  item_unit: string;
  ordered: string;
  received: string;
  remaining: string;
  delivery_days: number | null;
  /** Order date + delivery days (YYYY-MM-DD), null without delivery days. */
  expected_date: string | null;
  overdue: boolean;
  job_no: string;
  destination: string;
  piece_kind: 'plate' | 'boy' | null;
  size_summary?: string;
}

export interface PendingSupplier {
  id: number;
  name: string;
  lines: number;
}

export interface PendingLinesPage {
  count: number;
  results: PendingLine[];
  overdue_count: number;
  suppliers: PendingSupplier[];
}

export interface PendingLinesParams {
  page?: number;
  page_size?: number;
  supplier?: number;
  search?: string;
  overdue?: 'true' | 'false';
  /** Orders placed on or after this day (YYYY-MM-DD). */
  ordered_since?: string;
}

const BASE = '/warehouse/goods-receipts/';

export const receiptKeys = {
  all: ['goodsReceipts'] as const,
  list: (params: GoodsReceiptsParams) => ['goodsReceipts', 'list', params] as const,
  detail: (id: number) => ['goodsReceipts', 'detail', id] as const,
  orders: ['goodsReceipts', 'orders'] as const,
  orderLines: (po: number) => ['goodsReceipts', 'orderLines', po] as const,
  pending: (params: PendingLinesParams) => ['goodsReceipts', 'pending', params] as const,
};

export function pendingLinesQueryOptions(params: PendingLinesParams) {
  return queryOptions({
    queryKey: receiptKeys.pending(params),
    queryFn: ({ signal }) =>
      apiFetch<PendingLinesPage>(`${BASE}pending-lines/`, { params: { ...params }, signal }),
  });
}

export function goodsReceiptsQueryOptions(params: GoodsReceiptsParams) {
  return queryOptions({
    queryKey: receiptKeys.list(params),
    queryFn: ({ signal }) =>
      apiFetch<unknown>(BASE, { params: { ...params }, signal }).then((data) =>
        toPaginated<GoodsReceipt>(data),
      ),
  });
}

export function goodsReceiptQueryOptions(id: number) {
  return queryOptions({
    queryKey: receiptKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<GoodsReceipt>(`${BASE}${id}/`, { signal }),
  });
}

export function orderLinesQueryOptions(purchaseOrder: number) {
  return queryOptions({
    queryKey: receiptKeys.orderLines(purchaseOrder),
    queryFn: ({ signal }) =>
      apiFetch<OrderLineState[]>(`${BASE}order-lines/`, {
        params: { purchase_order: purchaseOrder },
        signal,
      }),
  });
}

export function orderLabel(order: ReceivableOrder): string {
  return `#${order.id} · ${order.supplier_name} · ${order.pr_number} ${order.pr_title}`.trim();
}

/** SelectRemote search over the purchase orders to receive against. */
export async function searchReceivableOrders(term: string, signal?: AbortSignal) {
  const data = await apiFetch<unknown>(`${BASE}orders/`, {
    params: { search: term, page_size: 20 },
    signal,
  });
  return extractResults<ReceivableOrder>(data).map((order) => ({
    value: String(order.id),
    label: orderLabel(order),
  }));
}

export function createGoodsReceipt(data: GoodsReceiptInput) {
  return apiFetch<GoodsReceipt>(BASE, { method: 'POST', body: data });
}

export function cancelGoodsReceipt(id: number) {
  return apiFetch<GoodsReceipt>(`${BASE}${id}/cancel/`, { method: 'POST' });
}
