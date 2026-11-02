import { keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError, type QueryParams } from '../client';
import { extractResults, toPaginated, type Paginated } from '../types';
import { extractErrorMessage, type Supplier } from './suppliers';

// Port of the purchase-request part of apis/procurement.js (plus the
// currency rates of apis/formatters.js and the planning item calls the create
// page makes). Endpoints, params and bodies are copied from the legacy module.

/** Requests move all day; a minute is fresh enough for a hub. */
export const PURCHASE_REQUESTS_STALE_TIME = 60_000;

export type PurchaseRequestStatus =
  'draft' | 'submitted' | 'approved' | 'completed' | 'cancelled' | string;
export type PurchaseRequestPriority = 'normal' | 'urgent' | 'critical' | string;

/** A list row (purchase-requests/, pending_approval/, approved_by_me/). */
export interface PurchaseRequestRow {
  id: number;
  request_number: string;
  title?: string | null;
  description?: string | null;
  requestor_username?: string | null;
  status: PurchaseRequestStatus;
  status_label?: string | null;
  priority?: PurchaseRequestPriority | null;
  total_amount_eur?: string | number | null;
  created_at?: string | null;
  item_type?: string | null;
  total_files?: number | null;
  files_count?: number | null;
  approval?: ApprovalInfo | null;
  planning_request_keys?: string[] | null;
  purchase_orders?: (number | string)[] | null;
  po_count?: number | null;
  evaluated_po_count?: number | null;
  [key: string]: unknown;
}

export interface ApproverRef {
  id: number;
  username?: string;
  full_name?: string;
}

export interface ApprovalDecision {
  approver: number;
  approver_detail?: { full_name?: string; username?: string } | null;
  decision: 'approve' | 'reject' | string;
  comment?: string | null;
  decided_at?: string | null;
}

export interface ApprovalStage {
  order: number;
  name: string;
  required_approvals: number;
  approved_count: number;
  is_complete?: boolean;
  is_rejected?: boolean;
  approvers?: ApproverRef[];
  decisions?: ApprovalDecision[];
}

export interface ApprovalInfo {
  is_complete?: boolean;
  is_rejected?: boolean;
  current_stage_order?: number;
  stage_instances?: ApprovalStage[];
}

export interface RequestFile {
  id?: number;
  file_url: string;
  file_name?: string;
  file_size?: number;
  uploaded_at?: string;
  uploaded_by_username?: string;
  [key: string]: unknown;
}

export interface RequestItem {
  id: number;
  quantity: string | number;
  item: { code?: string; name?: string; unit?: string; description?: string };
  item_description?: string | null;
  specifications?: string | null;
  allocations?: { job_no: string; quantity?: string | number }[];
  files?: RequestFile[];
}

export interface ItemOffer {
  id: number;
  purchase_request_item: number;
  unit_price: string | number | null;
  original_unit_price?: string | number | null;
  price_min?: string | number | null;
  price_max?: string | number | null;
  delivery_days?: number | null;
  notes?: string | null;
  is_recommended?: boolean;
  is_price_adjusted?: boolean;
  price_adjusted_by_username?: string | null;
}

export interface SupplierOffer {
  id?: number;
  currency: string;
  supplier: {
    id: number;
    name: string;
    status?: string | null;
    rating_score?: number | string | null;
    on_time_delivery_pct?: number | string | null;
  };
  item_offers: ItemOffer[];
}

export interface PurchaseOrderRef {
  id: number;
  supplier_name?: string;
  supplier_status?: string | null;
  status?: string;
  status_label?: string;
  is_evaluated?: boolean;
}

/** GET /procurement/purchase-requests/{id}/ */
export interface PurchaseRequestDetail extends PurchaseRequestRow {
  request_items: RequestItem[];
  offers: SupplierOffer[];
  approval?: ApprovalInfo | null;
  purchase_orders_detail?: unknown;
  [key: string]: unknown;
}

export interface StatusChoice {
  value: string;
  label: string;
}

export type CurrencyRates = Record<string, number>;

export const purchaseRequestKeys = {
  all: ['purchaseRequests'] as const,
  lists: ['purchaseRequests', 'list'] as const,
  list: (kind: 'all' | 'pendingApproval' | 'approvedByMe', params: QueryParams) =>
    ['purchaseRequests', 'list', kind, params] as const,
  detail: (id: number) => ['purchaseRequests', 'detail', id] as const,
  allFiles: (id: number) => ['purchaseRequests', 'allFiles', id] as const,
  statusChoices: ['purchaseRequests', 'statusChoices'] as const,
  drafts: ['purchaseRequests', 'drafts'] as const,
};

/** Legacy `errorData.error || fallback` (most of apis/procurement.js). */
export function legacyApiError(error: unknown, fallback: string): string {
  if (
    isApiError(error) &&
    error.data &&
    typeof error.data === 'object' &&
    !Array.isArray(error.data)
  ) {
    const body = error.data as Record<string, unknown>;
    if (typeof body.error === 'string' && body.error) return body.error;
  }
  return fallback;
}

/** Legacy readErrorMessage: flattens DRF errors via extractErrorMessage. */
export function readApiError(error: unknown, fallback: string): string {
  if (isApiError(error)) return extractErrorMessage(error.data, fallback);
  return fallback;
}

/** Throws an Error carrying the legacy message, keeping the ApiError as cause. */
async function legacy<T>(promise: Promise<T>, fallback: string, read = false): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    const message = read ? readApiError(error, fallback) : legacyApiError(error, fallback);
    throw Object.assign(new Error(message, { cause: error }), {
      status: isApiError(error) ? error.status : undefined,
      data: isApiError(error) ? error.data : undefined,
    });
  }
}

// ---------------------------------------------------------------- lists

export type PurchaseRequestListParams = QueryParams & {
  page?: number;
  page_size?: number;
  ordering?: string;
  request_number?: string;
  requestor?: string;
  status?: string;
  priority?: string;
  created_at__gte?: string;
};

const LIST_PATHS = {
  all: ['/procurement/purchase-requests/', 'Talepler yüklenirken hata oluştu'],
  pendingApproval: [
    '/procurement/purchase-requests/pending_approval/',
    'Onay bekleyen talepler yüklenirken hata oluştu',
  ],
  approvedByMe: [
    '/procurement/purchase-requests/approved_by_me/',
    'Onayladığınız talepler yüklenirken hata oluştu',
  ],
} as const;

export function getPurchaseRequestList(
  kind: keyof typeof LIST_PATHS,
  params: PurchaseRequestListParams,
  signal?: AbortSignal,
): Promise<Paginated<PurchaseRequestRow>> {
  const [path, fallback] = LIST_PATHS[kind];
  return legacy(
    apiFetch<unknown>(path, { params, signal }).then((d) => toPaginated<PurchaseRequestRow>(d)),
    fallback,
  );
}

export function purchaseRequestListQueryOptions(
  kind: keyof typeof LIST_PATHS,
  params: PurchaseRequestListParams,
) {
  return queryOptions({
    queryKey: purchaseRequestKeys.list(kind, params),
    queryFn: ({ signal }) => getPurchaseRequestList(kind, params, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * How many purchase requests await the current user's approval (what the
 * "Bekleyen Talepler" page lists), from a one-row page of
 * getPendingApprovalRequests.
 */
export function pendingApprovalCountQueryOptions() {
  const params = { page_size: 1 };
  return queryOptions({
    queryKey: ['purchaseRequests', 'pendingApproval', params] as const,
    queryFn: async ({ signal }) =>
      toPaginated(
        await apiFetch<unknown>('/procurement/purchase-requests/pending_approval/', {
          params,
          signal,
        }),
      ),
    staleTime: PURCHASE_REQUESTS_STALE_TIME,
    select: (page) => page.count,
  });
}

/**
 * `?talep=<request_number>` → the request with exactly that number, or null.
 * Legacy pending took results[0] of the filter; an inexact backend match could
 * open (and approve) another request, so both pages match exactly here.
 */
export async function findPurchaseRequestByNumber(
  requestNumber: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<{ match: PurchaseRequestRow | null; results: PurchaseRequestRow[] }> {
  const data = await legacy(
    apiFetch<unknown>('/procurement/purchase-requests/', {
      params: { request_number: requestNumber, ...params },
      signal,
    }),
    'Talepler yüklenirken hata oluştu',
  );
  const results = extractResults<PurchaseRequestRow>(data);
  const wanted = requestNumber.trim().toLowerCase();
  const match =
    results.find((r) => String(r.request_number ?? '').toLowerCase() === wanted) ?? null;
  return { match, results };
}

// ---------------------------------------------------------------- detail

export function getPurchaseRequest(
  id: number,
  signal?: AbortSignal,
): Promise<PurchaseRequestDetail> {
  return legacy(
    apiFetch<PurchaseRequestDetail>(`/procurement/purchase-requests/${id}/`, { signal }),
    'Talep yüklenirken hata oluştu',
  );
}

export function purchaseRequestQueryOptions(id: number) {
  return queryOptions({
    queryKey: purchaseRequestKeys.detail(id),
    queryFn: ({ signal }) => getPurchaseRequest(id, signal),
    // Opened on demand; always fresh like legacy (it fetched on every open).
    staleTime: 0,
  });
}

export interface AllFilesResponse {
  request_files?: RequestFile[];
  items?: { item_name?: string; item_code?: string; files?: RequestFile[] }[];
  total_files?: number;
}

export function getPurchaseRequestAllFiles(
  id: number,
  signal?: AbortSignal,
): Promise<AllFilesResponse> {
  return legacy(
    apiFetch<AllFilesResponse>(`/procurement/purchase-requests/${id}/all_files/`, { signal }),
    'Dosyalar yüklenirken hata oluştu',
  );
}

export function purchaseRequestAllFilesQueryOptions(id: number) {
  return queryOptions({
    queryKey: purchaseRequestKeys.allFiles(id),
    queryFn: ({ signal }) => getPurchaseRequestAllFiles(id, signal),
    staleTime: 0,
  });
}

export function statusChoicesQueryOptions() {
  return queryOptions({
    queryKey: purchaseRequestKeys.statusChoices,
    queryFn: async ({ signal }) =>
      extractResults<StatusChoice>(
        await legacy(
          apiFetch<unknown>('/procurement/status-choices/', { signal }),
          'Durum seçenekleri yüklenirken hata oluştu',
        ),
      ),
    staleTime: 30 * 60_000,
  });
}

/** apis/formatters.js fetchCurrencyRates: `data.rates`; null when unavailable. */
export function currencyRatesQueryOptions() {
  return queryOptions({
    queryKey: ['currencyRates'] as const,
    queryFn: async ({ signal }): Promise<CurrencyRates | null> => {
      try {
        const data = await apiFetch<{ rates?: CurrencyRates }>('/currency-rates/', { signal });
        return data?.rates ?? null;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return null;
      }
    },
    staleTime: 30 * 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------- actions

const post = (path: string, body?: unknown) =>
  apiFetch<unknown>(path, { method: 'POST', ...(body === undefined ? {} : { body }) });

export function approvePurchaseRequest(id: number) {
  return legacy(
    post(`/procurement/purchase-requests/${id}/approve/`),
    'Talep onaylanırken hata oluştu',
  );
}

export function rejectPurchaseRequest(id: number, comment = '') {
  return legacy(
    post(`/procurement/purchase-requests/${id}/reject/`, { comment }),
    'Talep reddedilirken hata oluştu',
  );
}

export function cancelPurchaseRequest(id: number) {
  return legacy(
    post(`/procurement/purchase-requests/${id}/cancel/`),
    'Talep iptal edilirken hata oluştu',
  );
}

export function revisePurchaseRequest(id: number) {
  return legacy(
    post(`/procurement/purchase-requests/${id}/revise/`),
    'Talep revize edilirken hata oluştu',
  );
}

export interface AdjustOffersResponse {
  detail?: string;
  purchase_request?: PurchaseRequestDetail;
}

/** Owner-only: items [{ item_offer_id, unit_price: "x.xx" }] within the backend's band. */
export function adjustOfferPrices(
  id: number,
  payload: { items: { item_offer_id: number; unit_price: string }[] },
): Promise<AdjustOffersResponse> {
  return legacy(
    apiFetch<AdjustOffersResponse>(`/procurement/purchase-requests/${id}/adjust_offers/`, {
      method: 'POST',
      body: payload,
    }),
    'Teklif fiyatları güncellenirken hata oluştu',
    true,
  );
}

export function createPurchaseRequest(
  body: unknown,
): Promise<{ id: number; request_number?: string }> {
  return legacy(
    apiFetch<{ id: number }>('/procurement/purchase-requests/', { method: 'POST', body }),
    'Sunucu hatası',
    true,
  );
}

export function submitPurchaseRequest(id: number) {
  return legacy(
    post(`/procurement/purchase-requests/${id}/submit/`),
    'Talep gönderilirken hata oluştu',
    true,
  );
}

export interface AttachPlanningError extends Error {
  data?: { detail?: string; error?: string; errors?: string[]; note?: string };
}

export async function attachPlanningItemsToPurchaseRequest(
  id: number,
  planningRequestItemIds: number[],
): Promise<{ detail?: string }> {
  try {
    return await apiFetch<{ detail?: string }>(
      `/procurement/purchase-requests/${id}/attach_planning_items/`,
      { method: 'POST', body: { planning_request_item_ids: planningRequestItemIds } },
    );
  } catch (error) {
    const data = (isApiError(error) ? error.data : undefined) as AttachPlanningError['data'];
    const message =
      (data && (data.detail || data.error)) || 'Planlama talebi öğeleri eklenirken hata oluştu';
    throw Object.assign(new Error(message, { cause: error }), { data });
  }
}

/** Refetch everything that shows a purchase request (lists, the open detail). */
export function invalidatePurchaseRequests(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: purchaseRequestKeys.all });
}

// ---------------------------------------------------------------- drafts

export interface PurchaseRequestDraftRow {
  id: number;
  title?: string | null;
  is_autosave?: boolean;
  updated_at?: string | null;
  created_at?: string | null;
  item_count?: number | null;
  supplier_count?: number | null;
}

export interface PurchaseRequestDraft extends PurchaseRequestDraftRow {
  description?: string | null;
  priority?: string | null;
  needed_date?: string | null;
  data?: Record<string, unknown> | null;
}

export function getPurchaseRequestDrafts(signal?: AbortSignal): Promise<PurchaseRequestDraftRow[]> {
  return legacy(
    apiFetch<unknown>('/procurement/purchase-request-draft/', { signal }).then((d) =>
      extractResults<PurchaseRequestDraftRow>(d),
    ),
    'Taslaklar yüklenirken hata oluştu',
  );
}

export function getPurchaseRequestDraft(id: number): Promise<PurchaseRequestDraft> {
  return legacy(
    apiFetch<PurchaseRequestDraft>(`/procurement/purchase-request-draft/${id}/`),
    'Taslak yüklenirken hata oluştu',
  );
}

export function savePurchaseRequestDraft(body: unknown): Promise<PurchaseRequestDraft> {
  return legacy(
    apiFetch<PurchaseRequestDraft>('/procurement/purchase-request-draft/', {
      method: 'POST',
      body,
    }),
    'Taslak kaydedilirken hata oluştu',
  );
}

/** Errors carry `status` (persistDraft falls back to POST on 404). */
export async function updatePurchaseRequestDraft(
  id: number,
  body: unknown,
): Promise<PurchaseRequestDraft> {
  try {
    return await apiFetch<PurchaseRequestDraft>(`/procurement/purchase-request-draft/${id}/`, {
      method: 'PUT',
      body,
    });
  } catch (error) {
    const data = isApiError(error)
      ? (error.data as Record<string, unknown> | undefined)
      : undefined;
    const text =
      (data && typeof data === 'object' && ((data.error as string) || (data.detail as string))) ||
      'Taslak güncellenirken hata oluştu';
    throw Object.assign(new Error(text, { cause: error }), {
      status: isApiError(error) ? error.status : undefined,
    });
  }
}

export function autosavePurchaseRequestDraft(body: unknown): Promise<unknown> {
  return apiFetch<unknown>('/procurement/purchase-request-draft/autosave/', {
    method: 'PUT',
    body,
  });
}

export function deletePurchaseRequestDraft(id: number): Promise<unknown> {
  return legacy(
    apiFetch<unknown>(`/procurement/purchase-request-draft/${id}/`, { method: 'DELETE' }),
    'Taslak silinirken hata oluştu',
  );
}

// ---------------------------------------------------- planning items (create)

/** A row of GET /planning/items/?available_for_procurement=true. */
export interface ProcurementPlanningItem {
  id: number;
  planning_request?: number | null;
  planning_request_number?: string | null;
  item_code?: string | null;
  item_name?: string | null;
  item_description?: string | null;
  item_unit?: string | null;
  job_no?: string | null;
  quantity_to_purchase?: string | number | null;
  quantity_remaining_for_purchase?: string | number | null;
  is_converted?: boolean;
  is_partially_converted?: boolean;
  is_available_for_purchase?: boolean;
  is_critical?: boolean;
  specifications?: string | null;
  files_count?: number | null;
  files?: { asset_id?: number | null; file_url?: string; file_name?: string }[];
  [key: string]: unknown;
}

export function availablePlanningItemsCountQueryOptions() {
  return queryOptions({
    queryKey: ['planningItems', 'availableCount'] as const,
    queryFn: async ({ signal }) => {
      try {
        const data = await apiFetch<{ count?: number; available_count?: number }>(
          '/planning/items/available_count/',
          { signal },
        );
        return data?.count || data?.available_count || 0;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        return 0;
      }
    },
  });
}

export function procurementPlanningItemsQueryOptions(params: QueryParams) {
  return queryOptions({
    queryKey: ['planningItems', 'forProcurement', params] as const,
    queryFn: async ({ signal }) =>
      toPaginated<ProcurementPlanningItem>(
        await apiFetch<unknown>('/planning/items/', {
          params: { available_for_procurement: true, ...params },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function getProcurementPlanningItem(id: number): Promise<ProcurementPlanningItem> {
  return apiFetch<ProcurementPlanningItem>(`/planning/items/${id}/`);
}

export interface PlanningItemFiles {
  item_id: number;
  item_name?: string;
  item_code?: string;
  planning_request_number?: string;
  files?: RequestFile[];
}

export async function getPlanningItemsFiles(itemIds: number[]): Promise<PlanningItemFiles[]> {
  const data = await apiFetch<{ items?: PlanningItemFiles[] }>('/planning/items/bulk_files/', {
    method: 'POST',
    body: { item_ids: itemIds },
  });
  return data?.items ?? [];
}

export interface PlanningRequestDetail {
  id: number;
  request_number?: string;
  status?: string;
  status_label?: string;
  priority?: string;
  title?: string;
  description?: string;
  needed_date?: string;
  created_at?: string;
  created_by_username?: string;
  created_by_full_name?: string;
  items?: ProcurementPlanningItem[];
  files?: RequestFile[];
  [key: string]: unknown;
}

export function getPlanningRequest(
  id: number,
  signal?: AbortSignal,
): Promise<PlanningRequestDetail> {
  return apiFetch<PlanningRequestDetail>(`/planning/requests/${id}/`, { signal });
}

// ------------------------------------------- create page reference data

/** suppliersManager.loadAvailableSuppliers: GET suppliers/?status=active&page_size=1000. */
export function activeSuppliersQueryOptions() {
  return queryOptions({
    queryKey: ['purchaseRequests', 'activeSuppliers'] as const,
    queryFn: async ({ signal }) =>
      extractResults<Supplier>(
        await apiFetch<unknown>('/procurement/suppliers/', {
          params: { status: 'active', page_size: 1000 },
          signal,
        }),
      ),
    staleTime: 60_000,
  });
}

/** loadAvailablePaymentTerms: GET payment-terms/?status=active. */
export function activePaymentTermsQueryOptions() {
  return queryOptions({
    queryKey: ['purchaseRequests', 'activePaymentTerms'] as const,
    queryFn: async ({ signal }) =>
      extractResults<{ id: number; name: string }>(
        await apiFetch<unknown>('/procurement/payment-terms/', { params: { status: 'active' }, signal }),
      ),
    staleTime: 5 * 60_000,
  });
}
