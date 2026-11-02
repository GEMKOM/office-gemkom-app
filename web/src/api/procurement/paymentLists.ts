import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import {
  ApiError,
  apiFetch,
  cleanParams,
  isApiError,
  type ApiFetchOptions,
  type QueryParams,
} from '../client';
import { toPaginated, type Paginated } from '../types';
import { extractErrorMessage } from './suppliers';

// Port of apis/procurement/paymentLists.js: the pool of unpaid instalments,
// weekly payment lists, schedule tools (split / bulk mark paid) and order
// proforma attachments. Every request throws an ApiError whose message is the
// backend's text through extractErrorMessage, so pages show it verbatim.

// ---- types -------------------------------------------------------------------

export interface PaymentJobRef {
  job_no?: string | null;
  customer_name?: string | null;
  customer_short_name?: string | null;
}

/** Decimals arrive as strings; go through num() before math. */
export type Decimal = string | number | null | undefined;

/** One unpaid instalment of a purchase order (GET /procurement/payment-pool/). */
export interface PoolRow {
  schedule_id: number;
  sequence?: number | null;
  schedule_sequence?: number | null;
  schedule_count?: number | null;
  label?: string | null;
  basis?: string | null;
  basis_label?: string | null;
  percentage?: Decimal;
  currency?: string | null;
  net_amount?: Decimal;
  gross_amount?: Decimal;
  amount_eur?: Decimal;
  gross_amount_eur?: Decimal;
  due_date?: string | null;
  is_paid?: boolean;
  items_summary?: string | null;
  line_count?: number | null;
  gs_numbers?: string[] | null;
  jobs?: PaymentJobRef[] | null;
  supplier?: { id?: number; name?: string | null; has_dbs?: boolean } | null;
  po: {
    id: number;
    gross_total?: Decimal;
    currency?: string | null;
    created_at?: string | null;
    proforma_count?: number | null;
  };
  pr?: { id?: number; request_number?: string | null } | null;
  terms?: { name?: string | null } | null;
  open_list?: { id: number; title: string; status: string; status_label?: string | null } | null;
}

/** An item of a payment list: a pool row plus its state on the list. */
export interface PaymentListItem extends PoolRow {
  id: number;
  note?: string | null;
  is_urgent?: boolean;
  is_excluded?: boolean;
  exclusion_reason?: string | null;
  excluded_by_name?: string | null;
  paid_at?: string | null;
  paid_by_name?: string | null;
  po_cancelled?: boolean;
  amount_changed?: boolean;
  live?: { gross?: Decimal } | null;
}

export interface PaymentListTotals {
  total_eur?: Decimal;
  paid_eur?: Decimal;
  remaining_eur?: Decimal;
  included_count?: number | null;
  excluded_count?: number | null;
  paid_count?: number | null;
  proforma_missing?: number | null;
  missing_rate_count?: number | null;
  cancelled_po_count?: number | null;
  over_budget?: boolean;
}

export interface ApprovalUser {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

export interface ApprovalDecision {
  decision: string;
  approver_detail?: ApprovalUser | string | null;
  decided_at?: string | null;
  comment?: string | null;
}

export interface ApprovalStage {
  order: number;
  name: string;
  is_complete?: boolean;
  is_rejected?: boolean;
  approved_count?: number;
  required_approvals?: number;
  approvers?: (ApprovalUser | string)[] | null;
  decisions?: ApprovalDecision[] | null;
}

export interface PaymentList {
  id: number;
  title: string;
  list_date?: string | null;
  status: string;
  status_label?: string | null;
  budget_eur?: Decimal;
  notes?: string | null;
  created_by_name?: string | null;
  totals?: PaymentListTotals | null;
  current_stage_name?: string | null;
  pending_approver_names?: string[] | null;
  finance_email_error?: string | null;
  finance_email_sent_at?: string | null;
  submitted_at?: string | null;
  submitted_by_name?: string | null;
  approved_at?: string | null;
  sent_to_finance_at?: string | null;
  sent_to_finance_by_name?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  can_decide?: boolean;
  /** What the current user may do; combines status, permission and approver membership. */
  allowed_actions?: string[] | null;
  fx?: {
    source?: string | null;
    eur_try?: Decimal;
    usd_try?: Decimal;
    date?: string | null;
  } | null;
  approval?: {
    current_stage_order?: number | null;
    is_complete?: boolean;
    is_rejected?: boolean;
    stage_instances?: ApprovalStage[] | null;
  } | null;
  items?: PaymentListItem[] | null;
}

export interface FacetOption {
  value: string | number;
  label: string;
}

export interface PaymentPoolFacets {
  job_nos?: FacetOption[];
  gs_numbers?: FacetOption[];
  suppliers?: FacetOption[];
}

export interface PoAttachment {
  id: number;
  file_url?: string | null;
  file_name?: string | null;
  description?: string | null;
  uploaded_at?: string | null;
  uploaded_by_username?: string | null;
}

export interface BulkPaidResult {
  dry_run?: boolean;
  paid?: number;
  skipped?: number;
  results?: { schedule_id: number; po_id?: number | null; ok: boolean; detail?: string }[];
}

export type PaymentListsParams = {
  status?: string;
  q?: string;
  gs?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export type PaymentPoolParams = {
  basis?: string;
  currency?: string;
  q?: string;
  job_no?: string;
  gs?: string;
  supplier?: string;
  created_after?: string;
  created_before?: string;
  listed?: string;
  page?: number;
  page_size?: number;
};

export interface PaymentListInput {
  title?: string;
  list_date?: string;
  budget_eur?: string | number | null;
  notes?: string;
  carry_over_from?: number;
  fx_manual?: { eur_try: string | number; usd_try: string | number | null };
}

// ---- request helper ----------------------------------------------------------

/** apiFetch with the legacy message (extractErrorMessage over the body, else the fallback). */
async function call<T>(path: string, fallback: string, options: ApiFetchOptions = {}): Promise<T> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (isApiError(error)) {
      throw new ApiError(
        error.status,
        error.data,
        extractErrorMessage(error.data ?? null, fallback),
      );
    }
    throw error;
  }
}

const POST = (body: unknown = {}): ApiFetchOptions => ({ method: 'POST', body });

/** Legacy `error.status === 404 || error.status === 403`. */
export function isApiErrorStatus(error: unknown, statuses: readonly number[]): boolean {
  return isApiError(error) && statuses.includes(error.status);
}

// ---- keys ----------------------------------------------------------------------

export const paymentListKeys = {
  all: ['paymentLists'] as const,
  lists: (params: PaymentListsParams) =>
    ['paymentLists', 'list', cleanParams(params as QueryParams)] as const,
  detail: (id: number) => ['paymentLists', 'detail', id] as const,
  pool: (params: PaymentPoolParams) =>
    ['paymentPool', 'list', cleanParams(params as QueryParams)] as const,
  poolAll: ['paymentPool'] as const,
  facets: ['paymentPool', 'facets'] as const,
  attachments: (poId: number) => ['poAttachments', poId] as const,
};

// ---- pool + schedule tools ---------------------------------------------------------

export function getPaymentPool(
  params: PaymentPoolParams = {},
  signal?: AbortSignal,
): Promise<Paginated<PoolRow>> {
  return call<unknown>('/procurement/payment-pool/', 'Ödeme havuzu yüklenemedi', {
    params: params as QueryParams,
    signal,
  }).then((data) => toPaginated<PoolRow>(data));
}

export function paymentPoolQueryOptions(params: PaymentPoolParams) {
  return queryOptions({
    queryKey: paymentListKeys.pool(params),
    queryFn: ({ signal }) => getPaymentPool(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** {job_nos, suppliers, gs_numbers}: options for the pool filters. */
export function getPaymentPoolFacets(signal?: AbortSignal): Promise<PaymentPoolFacets> {
  return call<PaymentPoolFacets>(
    '/procurement/payment-pool/facets/',
    'Filtre seçenekleri yüklenemedi',
    { signal },
  );
}

/** Legacy fetched the facets once per page load. */
export function paymentPoolFacetsQueryOptions() {
  return queryOptions({
    queryKey: paymentListKeys.facets,
    queryFn: ({ signal }) => getPaymentPoolFacets(signal),
    staleTime: Infinity,
  });
}

export function splitSchedule(
  poId: number,
  payload: { schedule_id: number; amount?: string; percentage?: string },
): Promise<unknown> {
  return call(
    `/procurement/purchase-orders/${poId}/split_schedule/`,
    'Taksit bölünemedi',
    POST(payload),
  );
}

export function bulkMarkSchedulesPaid(payload: {
  schedule_ids: number[];
  paid_at: string;
  paid_with_tax: boolean;
  dry_run?: boolean;
}): Promise<BulkPaidResult> {
  return call(
    '/procurement/payment-schedules/bulk_mark_paid/',
    'Toplu işaretleme başarısız',
    POST(payload),
  );
}

// ---- proformas (order attachments) --------------------------------------------------

export function listPoAttachments(poId: number, signal?: AbortSignal): Promise<PoAttachment[]> {
  return call<PoAttachment[]>(
    `/procurement/purchase-orders/${poId}/attachments/`,
    'Dosyalar yüklenemedi',
    {
      signal,
    },
  ).then((data) => (Array.isArray(data) ? data : []));
}

export function uploadPoAttachment(
  poId: number,
  file: File,
  description = 'proforma',
): Promise<unknown> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('description', description || 'proforma');
  return call(`/procurement/purchase-orders/${poId}/attachments/`, 'Dosya yüklenemedi', POST(fd));
}

export function deleteAttachment(attachmentId: number): Promise<void> {
  return call(`/planning/attachments/${attachmentId}/`, 'Dosya silinemedi', { method: 'DELETE' });
}

// ---- lists -----------------------------------------------------------------------------

const LISTS = '/procurement/payment-lists/';

export function getPaymentLists(
  params: PaymentListsParams = {},
  signal?: AbortSignal,
): Promise<Paginated<PaymentList>> {
  return call<unknown>(LISTS, 'Ödeme listeleri yüklenemedi', {
    params: params as QueryParams,
    signal,
  }).then((data) => toPaginated<PaymentList>(data));
}

export function paymentListsQueryOptions(params: PaymentListsParams) {
  return queryOptions({
    queryKey: paymentListKeys.lists(params),
    queryFn: ({ signal }) => getPaymentLists(params, signal),
  });
}

export function getPaymentList(id: number, signal?: AbortSignal): Promise<PaymentList> {
  return call<PaymentList>(`${LISTS}${id}/`, 'Ödeme listesi yüklenemedi', { signal });
}

export function paymentListQueryOptions(id: number) {
  return queryOptions({
    queryKey: paymentListKeys.detail(id),
    queryFn: ({ signal }) => getPaymentList(id, signal),
  });
}

export function createPaymentList(payload: PaymentListInput): Promise<PaymentList> {
  return call(LISTS, 'Liste oluşturulamadı', POST(payload));
}

export function updatePaymentList(id: number, patch: PaymentListInput): Promise<PaymentList> {
  return call(`${LISTS}${id}/`, 'Liste güncellenemedi', { method: 'PATCH', body: patch });
}

export function deletePaymentList(id: number): Promise<void> {
  return call(`${LISTS}${id}/`, 'Liste silinemedi', { method: 'DELETE' });
}

export function addPaymentListItems(id: number, scheduleIds: number[]): Promise<unknown> {
  return call(`${LISTS}${id}/items/`, 'Kalemler eklenemedi', POST({ schedule_ids: scheduleIds }));
}

export function updatePaymentListItem(
  id: number,
  itemId: number,
  patch: { note?: string; is_urgent?: boolean },
): Promise<unknown> {
  return call(`${LISTS}${id}/items/${itemId}/`, 'Kalem güncellenemedi', {
    method: 'PATCH',
    body: patch,
  });
}

export function removePaymentListItem(id: number, itemId: number): Promise<void> {
  return call(`${LISTS}${id}/items/${itemId}/`, 'Kalem silinemedi', { method: 'DELETE' });
}

export function excludePaymentListItem(id: number, itemId: number, reason = ''): Promise<unknown> {
  return call(`${LISTS}${id}/items/${itemId}/exclude/`, 'Kalem çıkarılamadı', POST({ reason }));
}

export function includePaymentListItem(id: number, itemId: number): Promise<unknown> {
  return call(`${LISTS}${id}/items/${itemId}/include/`, 'Kalem geri alınamadı', POST());
}

export function markPaymentListItemPaid(
  id: number,
  itemId: number,
  payload: { paid_with_tax: boolean; paid_at: string },
): Promise<unknown> {
  return call(`${LISTS}${id}/items/${itemId}/mark_paid/`, 'Ödeme işaretlenemedi', POST(payload));
}

export function unmarkPaymentListItemPaid(id: number, itemId: number): Promise<unknown> {
  return call(`${LISTS}${id}/items/${itemId}/unmark_paid/`, 'Ödeme geri alınamadı', POST());
}

export function submitPaymentList(id: number): Promise<unknown> {
  return call(`${LISTS}${id}/submit/`, 'Liste onaya gönderilemedi', POST());
}

export function decidePaymentList(
  id: number,
  { approve, comment = '' }: { approve: boolean; comment?: string },
) {
  return call<unknown>(`${LISTS}${id}/decide/`, 'Karar kaydedilemedi', POST({ approve, comment }));
}

export function sendPaymentListToFinance(id: number): Promise<unknown> {
  return call(`${LISTS}${id}/send_to_finance/`, 'Liste finansa gönderilemedi', POST());
}

export function resendFinanceEmail(id: number): Promise<unknown> {
  return call(`${LISTS}${id}/resend_finance_email/`, 'E-posta gönderilemedi', POST());
}

export function completePaymentList(id: number): Promise<unknown> {
  return call(`${LISTS}${id}/complete/`, 'Liste tamamlanamadı', POST());
}

export function cancelPaymentList(id: number, reason = ''): Promise<unknown> {
  return call(`${LISTS}${id}/cancel/`, 'Liste iptal edilemedi', POST({ reason }));
}

export function refreshPaymentListFx(id: number): Promise<unknown> {
  return call(`${LISTS}${id}/refresh_fx/`, 'Kur güncellenemedi', POST());
}

export function refreshPaymentListAmounts(id: number): Promise<unknown> {
  return call(`${LISTS}${id}/refresh_amounts/`, 'Tutarlar yenilenemedi', POST());
}
