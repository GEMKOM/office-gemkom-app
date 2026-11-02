import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, isApiError, type QueryParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Supplier side of apis/procurement.js (getSuppliers … getPaymentTerms), as
// the supplier list page (procurement/suppliers/list) uses it.

export type SupplierStatus = 'approved' | 'watch' | 'blacklisted';

export interface PaymentTermRef {
  id: number;
  name?: string;
  [key: string]: unknown;
}

export interface Supplier {
  id: number;
  code?: string;
  name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  bank_info?: string;
  default_currency?: string;
  /** An id, or the nested term on some serializers. */
  default_payment_terms?: number | string | PaymentTermRef | null;
  payment_terms_name?: string;
  default_tax_rate?: number | string | null;
  is_active?: boolean;
  has_dbs?: boolean;
  dbs_bank?: string;
  dbs_limit?: number | string | null;
  dbs_used?: number | string | null;
  dbs_currency?: string;
  dbs_agreement_no?: string;
  dbs_expiry_date?: string | null;
  dbs_details?: string;
  status?: SupplierStatus | string;
  rating_score?: number | string | null;
  rating_count?: number;
  on_time_delivery_pct?: number | string | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Body of POST / PUT /procurement/suppliers/, as legacy handleSupplierModalSave built it. */
export interface SupplierInput {
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  bank_info: string;
  default_currency: string;
  default_payment_terms: number | null;
  default_tax_rate: number;
  is_active: boolean;
  has_dbs: boolean;
  dbs_bank: string;
  dbs_limit: number | null;
  dbs_currency: string;
  dbs_agreement_no: string;
  dbs_expiry_date: string | null;
  dbs_details: string;
}

export type SuppliersParams = {
  name?: string;
  contact_person?: string;
  is_active?: string;
  default_currency?: string;
  created_at__gte?: string;
  supplier_status?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export interface SupplierEvaluation {
  id: number;
  purchase_order: number;
  po_number?: string;
  quality_score: number;
  delivery_score: number;
  price_score: number;
  service_score: number;
  composite_score: number | string;
  comment?: string;
  evaluated_by_username?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SupplierStatusHistoryEntry {
  id?: number;
  previous_status?: string;
  new_status?: string;
  reason?: string;
  changed_by_username?: string;
  changed_at?: string;
  [key: string]: unknown;
}

export interface PurchaseHistoryLine {
  item_code?: string;
  item_name?: string;
  description?: string;
  quantity?: number | string;
  unit?: string;
  unit_price?: number | string;
  is_delivered?: boolean;
  [key: string]: unknown;
}

/** The evaluation embedded in a purchase-history row. */
export interface PurchaseHistoryEvaluation {
  id: number;
  quality_score: number;
  delivery_score: number;
  price_score: number;
  service_score: number;
  comment?: string;
  composite_score: number | string;
  evaluated_by_username?: string;
  updated_at?: string;
}

/** One non-cancelled purchase order of an approved request the supplier won. */
export interface PurchaseHistoryRow {
  purchase_order: number;
  request_number: string;
  title?: string;
  approved_at?: string;
  requestor_username?: string;
  line_count?: number;
  delivered_line_count?: number;
  total_amount?: number | string;
  currency?: string;
  po_status?: string;
  po_status_label?: string;
  lines?: PurchaseHistoryLine[];
  evaluation: PurchaseHistoryEvaluation | null;
  [key: string]: unknown;
}

export interface SupplierEvaluationInput {
  purchase_order: number;
  quality_score: number;
  delivery_score: number;
  price_score: number;
  service_score: number;
  comment: string;
}

export interface PaymentTermOption {
  id: number;
  name: string;
  [key: string]: unknown;
}

// ---- query keys (local to this module) ----

export const supplierKeys = {
  all: ['suppliers'] as const,
  lists: ['suppliers', 'list'] as const,
  list: (params: QueryParams = {}) => ['suppliers', 'list', cleanParams(params)] as const,
  detail: (id: string | number) => ['suppliers', 'detail', String(id)] as const,
  evaluations: (id: string | number) => ['suppliers', 'evaluations', String(id)] as const,
  statusHistory: (id: string | number) => ['suppliers', 'statusHistory', String(id)] as const,
  purchaseHistory: (id: string | number) => ['suppliers', 'purchaseHistory', String(id)] as const,
};

const PAYMENT_TERM_OPTIONS_PARAMS = { page_size: 100 };
export const paymentTermOptionsKey = [
  'paymentTerms',
  'supplierFormOptions',
  PAYMENT_TERM_OPTIONS_PARAMS,
] as const;

// ---- legacy error messages ----

/**
 * The message the legacy wrappers that do `errorData.error || fallback`
 * threw (getSuppliers, getSupplier, create/update/delete/toggle).
 */
export function supplierApiErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) {
    const data = error.data as { error?: unknown } | undefined;
    return data && typeof data === 'object' && typeof data.error === 'string' && data.error
      ? data.error
      : fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Port of apis/procurement.js extractErrorMessage (used through readErrorMessage). */
export function extractErrorMessage(errorData: unknown, fallback = 'Sunucu hatası'): string {
  if (errorData === null || errorData === undefined) return fallback;
  if (typeof errorData === 'string') return errorData || fallback;
  if (typeof errorData !== 'object') return String(errorData) || fallback;
  const body = errorData as Record<string, unknown>;
  if (typeof body.error === 'string' && body.error) return body.error;
  if (body.detail && Array.isArray(body.errors) && body.errors.length) {
    return [body.detail, ...body.errors].join('\n');
  }
  if (typeof body.detail === 'string' && body.detail) return body.detail;
  const parts: string[] = [];
  const collect = (val: unknown) => {
    if (val === null || val === undefined) return;
    if (typeof val === 'string') parts.push(val);
    else if (Array.isArray(val)) val.forEach(collect);
    else if (typeof val === 'object') Object.values(val).forEach(collect);
    else parts.push(String(val));
  };
  collect(errorData);
  return parts.filter(Boolean).join('\n') || fallback;
}

/** The message the readErrorMessage wrappers threw (set-status, evaluations, histories). */
export function supplierReadErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) return extractErrorMessage(error.data, fallback);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ---- requests ----

const BASE = '/procurement/suppliers/';
const detailPath = (id: string | number) => `${BASE}${id}/`;
const EVALUATIONS_BASE = '/procurement/supplier-evaluations/';

/** Port of getSuppliers (params as the list page sends them). */
export async function getSuppliers(params: SuppliersParams = {}, signal?: AbortSignal) {
  return toPaginated<Supplier>(await apiFetch<unknown>(BASE, { params, signal }));
}

export function suppliersQueryOptions(params: SuppliersParams = {}) {
  return queryOptions({
    queryKey: supplierKeys.list(params),
    queryFn: ({ signal }) => getSuppliers(params, signal),
  });
}

export function getSupplier(id: string | number, signal?: AbortSignal): Promise<Supplier> {
  return apiFetch<Supplier>(detailPath(id), { signal });
}

export function supplierQueryOptions(id: string | number) {
  return queryOptions({
    queryKey: supplierKeys.detail(id),
    queryFn: ({ signal }) => getSupplier(id, signal),
  });
}

export function createSupplier(data: SupplierInput): Promise<Supplier> {
  return apiFetch<Supplier>(BASE, { method: 'POST', body: data });
}

/** Full update (PUT), as legacy updateSupplier. */
export function updateSupplier(id: string | number, data: SupplierInput): Promise<Supplier> {
  return apiFetch<Supplier>(detailPath(id), { method: 'PUT', body: data });
}

export function deleteSupplier(id: string | number): Promise<void> {
  return apiFetch<void>(detailPath(id), { method: 'DELETE' });
}

export function toggleSupplierStatus(id: string | number): Promise<Supplier> {
  return apiFetch<Supplier>(`${detailPath(id)}toggle_status/`, { method: 'POST' });
}

export function setSupplierStatus(
  id: string | number,
  { status, reason = '' }: { status: string; reason?: string },
): Promise<Supplier> {
  return apiFetch<Supplier>(`${detailPath(id)}set-status/`, {
    method: 'POST',
    body: { status, reason },
  });
}

export async function getSupplierEvaluations(id: string | number, signal?: AbortSignal) {
  return extractResults<SupplierEvaluation>(
    await apiFetch<unknown>(`${detailPath(id)}evaluations/`, { signal }),
  );
}

export async function getSupplierStatusHistory(id: string | number, signal?: AbortSignal) {
  return extractResults<SupplierStatusHistoryEntry>(
    await apiFetch<unknown>(`${detailPath(id)}status-history/`, { signal }),
  );
}

export async function getSupplierPurchaseHistory(id: string | number, signal?: AbortSignal) {
  return extractResults<PurchaseHistoryRow>(
    await apiFetch<unknown>(`${detailPath(id)}purchase-history/`, { signal }),
  );
}

// The drill-down modals fetched on every open in legacy; staleTime 0 keeps that.
export function supplierEvaluationsQueryOptions(id: string | number) {
  return queryOptions({
    queryKey: supplierKeys.evaluations(id),
    queryFn: ({ signal }) => getSupplierEvaluations(id, signal),
    staleTime: 0,
  });
}

export function supplierStatusHistoryQueryOptions(id: string | number) {
  return queryOptions({
    queryKey: supplierKeys.statusHistory(id),
    queryFn: ({ signal }) => getSupplierStatusHistory(id, signal),
    staleTime: 0,
  });
}

export function supplierPurchaseHistoryQueryOptions(id: string | number) {
  return queryOptions({
    queryKey: supplierKeys.purchaseHistory(id),
    queryFn: ({ signal }) => getSupplierPurchaseHistory(id, signal),
    staleTime: 0,
  });
}

export function createSupplierEvaluation(
  data: SupplierEvaluationInput,
): Promise<SupplierEvaluation> {
  return apiFetch<SupplierEvaluation>(EVALUATIONS_BASE, { method: 'POST', body: data });
}

export function updateSupplierEvaluation(
  evaluationId: string | number,
  data: SupplierEvaluationInput,
): Promise<SupplierEvaluation> {
  return apiFetch<SupplierEvaluation>(`${EVALUATIONS_BASE}${evaluationId}/`, {
    method: 'PUT',
    body: data,
  });
}

/** getPaymentTerms({ page_size: 100 }) for the supplier form's dropdown and the list column. */
export function paymentTermOptionsQueryOptions() {
  return queryOptions({
    queryKey: paymentTermOptionsKey,
    queryFn: async ({ signal }) =>
      extractResults<PaymentTermOption>(
        await apiFetch<unknown>('/procurement/payment-terms/', {
          params: PAYMENT_TERM_OPTIONS_PARAMS,
          signal,
        }),
      ),
    staleTime: 5 * 60_000,
  });
}

// ---- mutations ----

function useInvalidateSuppliers() {
  const queryClient = useQueryClient();
  return (saved?: Supplier) => {
    if (saved?.id !== undefined) queryClient.setQueryData(supplierKeys.detail(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: supplierKeys.all });
  };
}

export function useCreateSupplier() {
  const invalidate = useInvalidateSuppliers();
  return useMutation({ mutationFn: createSupplier, onSuccess: (saved) => invalidate(saved) });
}

export function useUpdateSupplier() {
  const invalidate = useInvalidateSuppliers();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: SupplierInput }) =>
      updateSupplier(id, data),
    onSuccess: (saved) => invalidate(saved),
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteSupplier(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: supplierKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: supplierKeys.all });
    },
  });
}

export function useToggleSupplierStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => toggleSupplierStatus(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}

export function useSetSupplierStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string | number; status: string; reason: string }) =>
      setSupplierStatus(id, { status, reason }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}

/**
 * Create (no evaluationId) or update an evaluation. The purchase-history row
 * is patched in place, as legacy did, so other cards keep their unsaved input;
 * the list is refetched because the supplier's cached rating changes.
 */
export function useSaveSupplierEvaluation(supplierId: string | number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      evaluationId,
      data,
    }: {
      evaluationId?: number;
      data: SupplierEvaluationInput;
    }) =>
      evaluationId !== undefined
        ? updateSupplierEvaluation(evaluationId, data)
        : createSupplierEvaluation(data),
    onSuccess: (result, { data }) => {
      const { purchase_order, comment, ...scores } = data;
      queryClient.setQueryData<PurchaseHistoryRow[]>(
        supplierKeys.purchaseHistory(supplierId),
        (rows) =>
          rows?.map((row) =>
            row.purchase_order === purchase_order
              ? {
                  ...row,
                  evaluation: {
                    id: result.id,
                    ...scores,
                    comment: result.comment ?? comment,
                    composite_score: result.composite_score,
                    evaluated_by_username: result.evaluated_by_username,
                    updated_at: result.updated_at,
                  },
                }
              : row,
          ),
      );
      void queryClient.invalidateQueries({ queryKey: supplierKeys.lists });
      void queryClient.invalidateQueries({ queryKey: supplierKeys.evaluations(supplierId) });
    },
  });
}
