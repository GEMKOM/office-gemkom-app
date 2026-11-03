import { queryOptions, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { StatusFamily } from '@/ui/StatusBadge';
import { apiFetch, apiUpload, cleanParams, isApiError } from '../client';
import { extractResults, toPaginated, type Paginated } from '../types';

// Port of apis/sales/offers.js: the sales hub's counts and the Satış
// Teklifleri page (sales/offers).

export type OfferStatus =
  | 'draft'
  | 'consultation'
  | 'pricing'
  | 'pending_approval'
  | 'approved'
  | 'submitted_customer'
  | 'won'
  | 'converted'
  | 'lost'
  | 'cancelled';

export interface Offer {
  id: number;
  offer_no: string;
  title?: string;
  status: OfferStatus | string;
  status_display?: string;
  customer_name?: string;
  /** Decimal string. The list sends no currency (it lives on price revisions). */
  total_price?: string | number | null;
  created_by_name?: string;
  offer_expiry_date?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Legacy OFFER_STATUS_MAP. */
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  draft: 'Taslak',
  consultation: 'Danışma',
  pricing: 'Fiyatlandırma',
  pending_approval: 'Onay Bekliyor',
  approved: 'Onaylandı',
  submitted_customer: 'Müşteriye Sunuldu',
  won: 'Kazanıldı',
  converted: 'İş Emrine Dönüştürüldü',
  lost: 'Kaybedildi',
  cancelled: 'İptal Edildi',
};

/** The design system's status families: waiting is yellow, with the customer purple. */
export const OFFER_STATUS_FAMILIES: Record<OfferStatus, StatusFamily> = {
  draft: 'grey',
  consultation: 'blue',
  pricing: 'blue',
  pending_approval: 'yellow',
  approved: 'green',
  submitted_customer: 'purple',
  won: 'green',
  converted: 'green',
  lost: 'red',
  cancelled: 'red',
};

export function offerStatusLabel(offer: Pick<Offer, 'status' | 'status_display'>): string {
  return offer.status_display || OFFER_STATUS_LABELS[offer.status as OfferStatus] || offer.status;
}

export function offerStatusFamily(status: string): StatusFamily {
  return OFFER_STATUS_FAMILIES[status as OfferStatus] ?? 'grey';
}

export type OffersParams = {
  search?: string;
  status?: OfferStatus;
  /** Comma-separated, e.g. "consultation,pricing". */
  status__in?: string;
  customer?: number | string;
  /** Sent as customer_inquiry_ref__icontains (legacy listOffers). */
  customer_inquiry_ref?: string;
  /** User id: that user's own offers. */
  created_by?: number | string;
  /**
   * The backend always puts offers awaiting the current user's approval
   * first, then applies this.
   */
  ordering?: string;
  page?: number;
  page_size?: number;
};

/** Offers move all day; a minute is fresh enough for a hub. */
export const OFFERS_STALE_TIME = 60_000;

const BASE = '/sales/offers/';

/** Port of listOffers. */
export async function listOffers(
  params: OffersParams = {},
  signal?: AbortSignal,
): Promise<Paginated<Offer>> {
  const { customer_inquiry_ref, ...rest } = params;
  return toPaginated<Offer>(
    await apiFetch<unknown>(BASE, {
      params: { ...rest, customer_inquiry_ref__icontains: customer_inquiry_ref },
      signal,
    }),
  );
}

const offersKey = (params: OffersParams) => ['offers', 'list', cleanParams(params)] as const;

export function offersQueryOptions(params: OffersParams = {}) {
  return queryOptions({
    queryKey: offersKey(params),
    queryFn: ({ signal }) => listOffers(params, signal),
    staleTime: OFFERS_STALE_TIME,
  });
}

/** How many offers match, from a one-row page. */
export function offerCountQueryOptions(
  filter: Pick<OffersParams, 'status' | 'status__in' | 'customer'>,
) {
  const params: OffersParams = { ...filter, page_size: 1 };
  return queryOptions({
    queryKey: offersKey(params),
    queryFn: ({ signal }) => listOffers(params, signal),
    staleTime: OFFERS_STALE_TIME,
    select: (page) => page.count,
  });
}

// ── The offers page ──────────────────────────────────────────────────

/** Legacy CURRENCY_OPTIONS (decision counter offers). */
export const OFFER_CURRENCY_OPTIONS = [
  { value: 'TRY', label: 'Türk Lirası (₺)' },
  { value: 'USD', label: 'ABD Doları ($)' },
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'GBP', label: 'İngiliz Sterlini (£)' },
];

export const CURRENCY_SYMBOLS: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

export const DEPARTMENT_CHOICES = [
  { value: 'design', label: 'Tasarım' },
  { value: 'planning', label: 'Planlama' },
  { value: 'procurement', label: 'Satın Alma' },
  { value: 'manufacturing', label: 'İmalat' },
  { value: 'logistics', label: 'Lojistik' },
];

export const OFFER_FILE_TYPE_OPTIONS = [
  { value: 'drawing', label: 'Çizim' },
  { value: 'specification', label: 'Şartname' },
  { value: 'quotation', label: 'Teklif' },
  { value: 'receipt', label: 'Proforma' },
  { value: 'correspondence', label: 'Yazışma' },
  { value: 'photo', label: 'Fotoğraf' },
  { value: 'other', label: 'Diğer' },
];

export const INCOTERMS_OPTIONS = [
  { value: 'EXW', label: 'EXW - Ex Works' },
  { value: 'FCA', label: 'FCA - Free Carrier' },
  { value: 'CPT', label: 'CPT - Carriage Paid To' },
  { value: 'CIP', label: 'CIP - Carriage and Insurance Paid To' },
  { value: 'DAP', label: 'DAP - Delivered At Place' },
  { value: 'DPU', label: 'DPU - Delivered at Place Unloaded' },
  { value: 'DDP', label: 'DDP - Delivered Duty Paid' },
  { value: 'FAS', label: 'FAS - Free Alongside Ship' },
  { value: 'FOB', label: 'FOB - Free On Board' },
  { value: 'CFR', label: 'CFR - Cost and Freight' },
  { value: 'CIF', label: 'CIF - Cost, Insurance and Freight' },
];

export interface OfferCustomerDetail {
  id?: number;
  code?: string;
  name?: string;
  contact_person?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  tax_office?: string;
  [key: string]: unknown;
}

export interface OfferJobOrder {
  job_no: string;
  title?: string;
  parent?: string | number | null;
  [key: string]: unknown;
}

export type PricingMode = 'flat' | 'leaf';

/** GET /sales/offers/<id>/. */
export interface OfferDetail extends Offer {
  description?: string;
  customer?: number | null;
  customer_code?: string;
  customer_detail?: OfferCustomerDetail | null;
  customer_inquiry_ref?: string;
  order_no?: string;
  incoterms?: string;
  delivery_place?: string;
  /** Id, or the term itself. */
  payment_terms?: number | string | { id?: number; name?: string } | null;
  payment_terms_name?: string;
  delivery_date_requested?: string | null;
  total_weight_kg?: string | number | null;
  approval_round?: number;
  updated_at?: string;
  submitted_to_customer_at?: string | null;
  won_at?: string | null;
  lost_at?: string | null;
  cancelled_at?: string | null;
  job_orders?: OfferJobOrder[];
  converted_job_order?: unknown;
  converted_job_order_no?: string | null;
  needs_my_approval?: boolean;
  pricing_mode?: PricingMode | string;
  shipping_price?: string | number | null;
  current_price?: { currency?: string; [key: string]: unknown } | null;
  currency?: string;
}

/** A row of the offer's item tree (GET /sales/offers/<id>/items/). */
export interface OfferItem {
  id: number;
  parent?: number | null;
  sequence?: number | null;
  template_node?: number | null;
  node_id?: number | null;
  template_node_detail?: { id?: number; title?: string; [key: string]: unknown } | null;
  title_override?: string | null;
  resolved_title?: string | null;
  title?: string | null;
  quantity?: number | string | null;
  notes?: string | null;
  unit_price?: string | number | null;
  weight_kg?: string | number | null;
  subtotal?: string | number | null;
  delivery_period?: string | null;
  children?: OfferItem[];
  [key: string]: unknown;
}

export interface OfferFile {
  id: number;
  file_url?: string;
  url?: string;
  file?: string;
  filename?: string;
  name?: string;
  file_type?: string;
  file_type_display?: string;
  file_size?: number | null;
  uploaded_at?: string;
  uploaded_by_name?: string;
  uploaded_by?: string | number;
  [key: string]: unknown;
}

export interface ConsultationFile {
  id: number;
  file_url?: string;
  filename?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ConsultationTask {
  id: number;
  title?: string;
  request_title?: string;
  status?: string;
  assigned_to_name?: string;
  target_completion_date?: string | null;
  deadline?: string | null;
  due_date?: string | null;
  /** The request note. */
  description?: string | null;
  /** The department's response note. */
  notes?: string | null;
  shared_files?: ConsultationFile[];
  completion_files?: ConsultationFile[];
  discussion_topic?: { id?: number } | null;
  [key: string]: unknown;
}

export interface Consultation {
  department?: string;
  department_display?: string;
  tasks?: ConsultationTask[];
  [key: string]: unknown;
}

export interface PriceRevision {
  id?: number;
  created_at?: string;
  amount?: string | number | null;
  currency?: string;
  currency_display?: string;
  revision_type?: string;
  revision_type_display?: string;
  approval_round?: number | null;
  created_by_name?: string;
  notes?: string | null;
  is_current?: boolean;
  [key: string]: unknown;
}

export interface ApprovalUser {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
}

export interface ApprovalDecision {
  approver?: number;
  approver_detail?: ApprovalUser | null;
  decision?: string;
  decided_at?: string | null;
  comment?: string | null;
}

export interface ApprovalStage {
  order?: number;
  name?: string;
  required_approvals?: number | null;
  approved_count?: number | null;
  is_complete?: boolean;
  is_rejected?: boolean;
  approvers?: ApprovalUser[];
  decisions?: ApprovalDecision[];
}

export interface ApprovalWorkflow {
  created_at?: string | null;
  current_stage_order?: number;
  is_complete?: boolean;
  is_rejected?: boolean;
  is_cancelled?: boolean;
  snapshot?: { round?: number | null; amount?: string | number | null; currency?: string | null } | null;
  stage_instances?: ApprovalStage[];
}

/** GET approval-status/: the offer, its item tree, the workflows and the caller's right to decide. */
export interface ApprovalStatus {
  offer_no?: string;
  status?: string;
  status_display?: string;
  customer_name?: string;
  customer_code?: string;
  current_price?: { currency?: string } | null;
  items?: OfferItem[];
  total_price?: string | number | null;
  total_weight_kg?: string | number | null;
  pricing_mode?: PricingMode | string;
  current_user_can_decide?: boolean;
  is_rejected?: boolean;
  workflows?: ApprovalWorkflow[];
  [key: string]: unknown;
}

/** A row of GET /projects/job-orders/history-by-template-node/ (a tree). */
export interface NodeJobHistory {
  job_no?: string;
  title?: string;
  customer_name?: string;
  status?: string;
  target_completion_date?: string | null;
  estimated_cost?: string | number | null;
  offer_unit_price?: string | number | null;
  cost_summary?: {
    actual_total_cost?: string | number | null;
    selling_price?: string | number | null;
    selling_price_currency?: string | null;
  } | null;
  children?: NodeJobHistory[];
}

export const offerKeys = {
  all: ['offers'] as const,
  detail: (id: number) => ['offers', 'detail', id] as const,
  items: (id: number) => ['offers', 'detail', id, 'items'] as const,
  files: (id: number) => ['offers', 'detail', id, 'files'] as const,
  consultations: (id: number) => ['offers', 'detail', id, 'consultations'] as const,
  consultationTask: (id: number, taskId: number) =>
    ['offers', 'detail', id, 'consultations', taskId] as const,
  priceHistory: (id: number) => ['offers', 'detail', id, 'price-history'] as const,
  approval: (id: number) => ['offers', 'detail', id, 'approval'] as const,
  resolve: (offerNo: string) => ['offers', 'resolve', offerNo] as const,
  nodeHistory: (nodeId: number, offerId: number) =>
    ['offers', 'node-history', nodeId, offerId] as const,
};

const detailPath = (id: number) => `${BASE}${id}/`;

/** Siblings by sequence, then id (legacy compareOfferItemSiblings). */
export function compareOfferItems(a: OfferItem, b: OfferItem): number {
  const seqA = Number(a.sequence) || 0;
  const seqB = Number(b.sequence) || 0;
  if (seqA !== seqB) return seqA - seqB;
  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

/** Legacy sortOfferItemApiTree. */
export function sortOfferItemTree(items: readonly OfferItem[] | null | undefined): OfferItem[] {
  return (items ?? [])
    .slice()
    .sort(compareOfferItems)
    .map((item) => ({ ...item, children: sortOfferItemTree(item.children) }));
}

export function offerQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerKeys.detail(id),
    queryFn: ({ signal }) => apiFetch<OfferDetail>(detailPath(id), { signal }),
  });
}

/** The item tree, siblings in sequence order. */
export function offerItemsQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerKeys.items(id),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>(`${detailPath(id)}items/`, { signal });
      const list =
        data && typeof data === 'object' && !Array.isArray(data) && 'items' in data
          ? (data as { items: unknown }).items
          : data;
      return sortOfferItemTree(extractResults<OfferItem>(list));
    },
  });
}

export function offerFilesQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerKeys.files(id),
    queryFn: async ({ signal }) =>
      extractResults<OfferFile>(await apiFetch<unknown>(`${detailPath(id)}files/`, { signal })),
  });
}

export function offerConsultationsQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerKeys.consultations(id),
    queryFn: async ({ signal }) =>
      extractResults<Consultation>(
        await apiFetch<unknown>(`${detailPath(id)}consultations/`, { signal }),
      ),
  });
}

export function consultationTaskQueryOptions(id: number, taskId: number) {
  return queryOptions({
    queryKey: offerKeys.consultationTask(id, taskId),
    queryFn: ({ signal }) =>
      apiFetch<ConsultationTask>(`${detailPath(id)}consultations/${taskId}/`, { signal }),
  });
}

export function priceHistoryQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerKeys.priceHistory(id),
    queryFn: async ({ signal }) =>
      extractResults<PriceRevision>(
        await apiFetch<unknown>(`${detailPath(id)}price-history/`, { signal }),
      ),
  });
}

/** null when the offer has no approval process (404), like legacy getApprovalStatus. */
export function approvalStatusQueryOptions(id: number) {
  return queryOptions({
    queryKey: offerKeys.approval(id),
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<ApprovalStatus>(`${detailPath(id)}approval-status/`, { signal });
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
  });
}

/** Past job orders made from a catalog node, this offer's own left out. */
export function nodeJobHistoryQueryOptions(nodeId: number, excludeOfferId: number) {
  return queryOptions({
    queryKey: offerKeys.nodeHistory(nodeId, excludeOfferId),
    queryFn: async ({ signal }) =>
      extractResults<NodeJobHistory>(
        await apiFetch<unknown>('/projects/job-orders/history-by-template-node/', {
          params: { node_id: nodeId, exclude_offer_id: excludeOfferId },
          signal,
        }),
      ),
  });
}

/**
 * The offer with this number (legacy resolveOfferIdFromOfferNo): a search,
 * then an exact match, or the only hit. null when there is none.
 */
export function resolveOfferQueryOptions(offerNo: string) {
  return queryOptions({
    queryKey: offerKeys.resolve(offerNo),
    queryFn: async ({ signal }) => {
      const page = await listOffers({ search: offerNo, page: 1, page_size: 25 }, signal);
      const wanted = offerNo.trim().toLowerCase();
      const exact = page.results.find(
        (o) => String(o.offer_no || '').trim().toLowerCase() === wanted,
      );
      if (exact?.id) return exact.id;
      if (page.results.length === 1 && page.results[0]?.id) return page.results[0].id;
      return null;
    },
    staleTime: Infinity,
  });
}

// ── Writes ───────────────────────────────────────────────────────────

/** Body of POST / PATCH /sales/offers/ (the create and edit forms). */
export interface OfferInput {
  customer?: string | number | null;
  title?: string;
  description?: string;
  customer_inquiry_ref?: string;
  order_no?: string;
  incoterms?: string;
  delivery_place?: string;
  payment_terms?: string | number | null;
  delivery_date_requested?: string | null;
  offer_expiry_date?: string | null;
}

export function createOffer(data: OfferInput) {
  return apiFetch<OfferDetail>(BASE, { method: 'POST', body: data });
}

export function patchOffer(id: number, data: OfferInput) {
  return apiFetch<OfferDetail>(detailPath(id), { method: 'PATCH', body: data });
}

/** A row of POST add-items/: `parent_ref` points at another new row's `_ref`. */
export interface NewOfferItem {
  _ref?: string;
  template_node?: number | null;
  title_override?: string;
  quantity?: number;
  notes?: string;
  parent?: number | null;
  parent_ref?: string;
  sequence?: number;
}

export function addOfferItems(id: number, items: NewOfferItem[]) {
  return apiFetch<unknown>(`${detailPath(id)}add-items/`, { method: 'POST', body: { items } });
}

export interface OfferItemUpdate {
  id: number;
  title_override?: string;
  quantity?: number;
  parent?: number | null;
}

export function bulkUpdateOfferItems(id: number, items: OfferItemUpdate[]) {
  return apiFetch<unknown>(`${detailPath(id)}update-items/`, { method: 'POST', body: { items } });
}

export function bulkDeleteOfferItems(id: number, ids: number[]) {
  return apiFetch<unknown>(`${detailPath(id)}delete-items/`, { method: 'POST', body: { ids } });
}

export interface SetPricesPayload {
  pricing_mode: PricingMode;
  shipping_price: number;
  items: {
    id: number;
    unit_price: number | null;
    quantity: number;
    notes: string;
    weight_kg: number | null;
    delivery_period: string;
  }[];
}

export function setOfferPrices(id: number, payload: SetPricesPayload) {
  return apiFetch<{ offer?: OfferDetail; items?: OfferItem[] }>(`${detailPath(id)}set-prices/`, {
    method: 'POST',
    body: payload,
  });
}

export function uploadOfferFile(
  id: number,
  file: File,
  fields: { file_type: string; name?: string; description?: string },
) {
  const form = new FormData();
  form.append('file', file);
  form.append('file_type', fields.file_type);
  if (fields.name) form.append('name', fields.name);
  if (fields.description) form.append('description', fields.description);
  return apiUpload<OfferFile>(`${detailPath(id)}files/`, form);
}

export function deleteOfferFile(id: number, fileId: number | string) {
  return apiFetch<void>(`${detailPath(id)}files/${fileId}/`, { method: 'DELETE' });
}

export interface ConsultationRequest {
  department: string;
  title: string;
  task_type: 'sales_consult';
  deadline: string | null;
  assigned_to: null;
  notes: string;
  file_ids: number[];
}

export function sendConsultations(id: number, departments: ConsultationRequest[]) {
  return apiFetch<unknown>(`${detailPath(id)}send-consultations/`, {
    method: 'POST',
    body: { departments },
  });
}

export function patchConsultationTask(
  id: number,
  taskId: number,
  data: { title?: string; notes?: string; deadline?: string | null; file_ids: number[] },
) {
  return apiFetch<ConsultationTask>(`${detailPath(id)}consultations/${taskId}/`, {
    method: 'PATCH',
    body: data,
  });
}

export function submitApproval(id: number, notes: string) {
  return apiFetch<unknown>(`${detailPath(id)}submit-approval/`, {
    method: 'POST',
    body: { notes },
  });
}

export interface DecisionPayload {
  approve: boolean;
  comment: string;
  counter_amount?: number;
  counter_currency?: string;
}

export function recordDecision(id: number, data: DecisionPayload) {
  return apiFetch<unknown>(`${detailPath(id)}decide/`, { method: 'POST', body: data });
}

/** The workflow actions that take no body. */
export type OfferAction = 'submit-customer' | 'mark-won' | 'revert-won' | 'mark-lost' | 'cancel';

export function runOfferAction(id: number, action: OfferAction) {
  return apiFetch<unknown>(`${detailPath(id)}${action}/`, { method: 'POST' });
}

/** Files go along only when some are picked (legacy convertToJobOrder). */
export function convertToJobOrder(id: number, fileIds: number[]) {
  return apiFetch<{ job_no?: string }>(`${detailPath(id)}convert/`, {
    method: 'POST',
    body: fileIds.length ? { file_ids: fileIds } : undefined,
  });
}

/**
 * Every offer query (list, counts, the open offer's tabs) refetches: what the
 * legacy page did by reopening the modal and reloading the list.
 */
export function useInvalidateOffers() {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: offerKeys.all }),
    [queryClient],
  );
}

/**
 * Legacy parseError: a `detail` as it is, any other JSON body as all its
 * messages joined with ', ', anything else the fallback.
 */
export function offerErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error) && error.data && typeof error.data === 'object') {
    const data = error.data as Record<string, unknown>;
    if (typeof data.detail === 'string' && data.detail) return data.detail;
    const messages = Object.values(data)
      .flat(Infinity)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map(String);
    return messages.join(', ') || fallback;
  }
  return fallback;
}
