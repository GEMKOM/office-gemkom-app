import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiFetch, isApiError, type QueryParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Port of apis/craneRequests.js (Vinç / Platform Kiralama Talepleri).
// Backend: /cranes/requests/, /cranes/crane-types/, /cranes/rates/

// ---------------- Types ----------------

export type CraneRequestStatus = 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'completed';
export type CranePricingOption = 'up_to_3h' | 'up_to_8h' | 'daily';
export type CranePriority = 'normal' | 'urgent' | 'critical';
type Decimal = string | number | null;

/** Effective-dated price row (`/cranes/rates/`, and `current_rate` on a type). */
export interface CraneRate {
  id?: number;
  crane_type?: number;
  effective_from?: string | null;
  currency?: string | null;
  price_up_to_3h?: Decimal;
  price_up_to_8h?: Decimal;
  price_per_day?: Decimal;
  transport_fee?: Decimal;
  rigger_fee?: Decimal;
  note?: string | null;
  [key: string]: unknown;
}

export interface CraneType {
  id: number;
  name: string;
  category?: string;
  category_label?: string;
  is_active?: boolean;
  current_rate?: CraneRate | null;
  [key: string]: unknown;
}

export interface CraneRequestFile {
  id?: number;
  file_url?: string;
  file_name?: string;
  name?: string;
  filename?: string;
  display_name?: string;
  uploaded_at?: string;
  uploaded_by_username?: string;
  [key: string]: unknown;
}

export interface CraneApprovalPerson {
  id?: number;
  username?: string;
  full_name?: string;
}

export interface CraneApprovalDecision {
  decision?: 'approve' | 'reject' | string;
  approver_detail?: CraneApprovalPerson | null;
  decided_at?: string | null;
  comment?: string | null;
}

export interface CraneApprovalStage {
  order?: number;
  name?: string;
  is_complete?: boolean;
  is_rejected?: boolean;
  approved_count?: number;
  required_approvals?: number;
  approvers?: CraneApprovalPerson[];
  decisions?: CraneApprovalDecision[];
}

export interface CraneEstimateLine {
  label?: string;
  amount?: Decimal;
}

export interface CraneRequest {
  id: number;
  request_number?: string;
  status?: CraneRequestStatus | string;
  status_label?: string;
  priority?: CranePriority | string;
  requestor?: number | null;
  requestor_username?: string;
  requestor_full_name?: string;
  approved_by?: number | null;
  department?: string | null;
  crane_type?: number | null;
  crane_type_name?: string | null;
  crane_type_category?: string | null;
  job_no?: string | null;
  pricing_option?: CranePricingOption | string;
  pricing_option_label?: string;
  days?: number | null;
  needs_rigger?: boolean;
  needed_date?: string | null;
  needed_time?: string | null;
  location?: string | null;
  description?: string | null;
  estimated_cost?: Decimal;
  estimated_cost_currency?: string | null;
  estimate_breakdown?: Partial<Record<'base' | 'transport' | 'rigger', CraneEstimateLine>> | null;
  actual_quantity?: Decimal;
  actual_cost?: Decimal;
  actual_cost_currency?: string | null;
  completed_by_username?: string | null;
  completed_at?: string | null;
  rejection_reason?: string | null;
  procurement_item_code?: string | null;
  can_complete?: boolean;
  approval?: { stage_instances?: CraneApprovalStage[] } | null;
  files?: CraneRequestFile[];
  created_at?: string;
  [key: string]: unknown;
}

/** User-level UI flags from `/cranes/requests/my_permissions/`. */
export interface CranePermissions {
  can_complete: boolean;
  can_manage_prices: boolean;
}

export type CraneRequestsParams = {
  page?: number;
  page_size?: number;
  ordering?: string;
  status?: string;
  crane_type?: string;
  job_no?: string;
  priority?: string;
  requestor?: string;
};

export interface CraneRequestInput {
  crane_type: string | number;
  pricing_option: string;
  job_no: string;
  days?: number;
  needs_rigger?: boolean;
  needed_date?: string;
  needed_time?: string | null;
  location?: string;
  description?: string;
  priority?: string;
  files?: File[];
}

export interface CraneCompleteInput {
  actual_quantity: string | number | null;
  actual_cost: string | number;
  actual_cost_currency?: string;
}

export interface CraneRateInput {
  crane_type: number;
  effective_from: string;
  currency: string;
  price_up_to_3h: string | null;
  price_up_to_8h: string | null;
  price_per_day: string | null;
  transport_fee: string | null;
  rigger_fee: string | null;
  note: string;
}

// ---------------- Errors ----------------

/**
 * Legacy parseError: `detail` / `error`, else the first message of the first
 * field (without the field name), else the fallback.
 */
function legacyMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    const direct = body.detail || body.error;
    if (direct) return String(direct);
    const firstKey = Object.keys(body)[0];
    if (firstKey) {
      const value = body[firstKey];
      const msg = Array.isArray(value) ? value[0] : value;
      if (typeof msg === 'string') return msg;
    }
  }
  return fallback;
}

/** apiFetch with the legacy error text, so pages can show `error.message` as before. */
async function craneFetch<T>(
  path: string,
  fallback: string,
  options: Parameters<typeof apiFetch>[1] = {},
) {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (isApiError(error))
      throw new ApiError(error.status, error.data, legacyMessage(error.data, fallback));
    throw error;
  }
}

/** The text legacy appended after "…hata oluştu: ". */
export function craneErrorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error ?? '');
}

// ---------------- Requests ----------------

export function fetchCraneRequests(params: CraneRequestsParams = {}, signal?: AbortSignal) {
  return craneFetch<unknown>('/cranes/requests/', 'Vinç talepleri yüklenirken hata oluştu', {
    params: params as QueryParams,
    signal,
  }).then((data) => toPaginated<CraneRequest>(data));
}

export function fetchCraneRequest(id: number | string, signal?: AbortSignal) {
  return craneFetch<CraneRequest>(
    `/cranes/requests/${id}/`,
    'Vinç talebi yüklenirken hata oluştu',
    { signal },
  );
}

export function fetchPendingApprovalCraneRequests(params: QueryParams = {}, signal?: AbortSignal) {
  return craneFetch<unknown>(
    '/cranes/requests/pending_approval/',
    'Onay bekleyen talepler yüklenirken hata oluştu',
    {
      params,
      signal,
    },
  ).then((data) => toPaginated<CraneRequest>(data));
}

/** Creates a request (the backend submits it for approval right away). Multipart, like legacy. */
export function createCraneRequest(input: CraneRequestInput) {
  const formData = new FormData();
  const fields = [
    'crane_type',
    'pricing_option',
    'job_no',
    'days',
    'needs_rigger',
    'needed_date',
    'needed_time',
    'location',
    'description',
    'priority',
  ] as const;
  for (const field of fields) {
    const value = input[field];
    if (value !== undefined && value !== null && value !== '')
      formData.append(field, String(value));
  }
  for (const file of input.files ?? []) formData.append('files', file);
  return craneFetch<CraneRequest>('/cranes/requests/', 'Vinç talebi oluşturulurken hata oluştu', {
    method: 'POST',
    body: formData,
  });
}

export function approveCraneRequest(id: number, comment = '') {
  return craneFetch<unknown>(`/cranes/requests/${id}/approve/`, 'Talep onaylanırken hata oluştu', {
    method: 'POST',
    body: { comment },
  });
}

export function rejectCraneRequest(id: number, comment = '') {
  return craneFetch<unknown>(`/cranes/requests/${id}/reject/`, 'Talep reddedilirken hata oluştu', {
    method: 'POST',
    body: { comment },
  });
}

export function cancelCraneRequest(id: number) {
  return craneFetch<unknown>(
    `/cranes/requests/${id}/cancel/`,
    'Talep iptal edilirken hata oluştu',
    {
      method: 'POST',
      body: {},
    },
  );
}

/** Records the actuals and completes an approved request (the cost goes to the job). */
export function completeCraneRequest(id: number, input: CraneCompleteInput) {
  const { actual_quantity, actual_cost, actual_cost_currency = 'TRY' } = input;
  return craneFetch<unknown>(
    `/cranes/requests/${id}/complete/`,
    'Talep tamamlanırken hata oluştu',
    {
      method: 'POST',
      body: { actual_quantity, actual_cost, actual_cost_currency },
    },
  );
}

export async function fetchCraneMyPermissions(signal?: AbortSignal): Promise<CranePermissions> {
  const data = await craneFetch<Partial<CranePermissions> | null>(
    '/cranes/requests/my_permissions/',
    'Yetkiler yüklenirken hata oluştu',
    { signal },
  );
  return {
    can_complete: Boolean(data?.can_complete),
    can_manage_prices: Boolean(data?.can_manage_prices),
  };
}

// ---------------- Catalog / price list ----------------

export function fetchCraneTypes(params: QueryParams = {}, signal?: AbortSignal) {
  return craneFetch<unknown>('/cranes/crane-types/', 'Vinç tipleri yüklenirken hata oluştu', {
    params,
    signal,
  }).then((data) => extractResults<CraneType>(data));
}

export function fetchCraneRates(params: QueryParams = {}, signal?: AbortSignal) {
  return craneFetch<unknown>('/cranes/rates/', 'Fiyatlar yüklenirken hata oluştu', {
    params,
    signal,
  }).then((data) => extractResults<CraneRate>(data));
}

/** A NEW effective-dated rate row (history is immutable). */
export function createCraneRate(input: CraneRateInput) {
  return craneFetch<CraneRate>('/cranes/rates/', 'Fiyat kaydedilirken hata oluştu', {
    method: 'POST',
    body: input,
  });
}

// ---------------- Queries ----------------

const keys = {
  all: ['craneRequests'] as const,
  list: (params: CraneRequestsParams) => ['craneRequests', 'list', params] as const,
  detail: (id: number | string) => ['craneRequests', 'detail', String(id)] as const,
  pending: () => ['craneRequests', 'pendingApproval'] as const,
  permissions: () => ['craneRequests', 'myPermissions'] as const,
  types: (params: QueryParams) => ['craneTypes', params] as const,
  typesAll: ['craneTypes'] as const,
  rates: (craneType: number) => ['craneRates', craneType] as const,
};

export const CRANE_STALE_TIME = 30_000;

export function craneRequestsQueryOptions(params: CraneRequestsParams) {
  return queryOptions({
    queryKey: keys.list(params),
    queryFn: ({ signal }) => fetchCraneRequests(params, signal),
    staleTime: CRANE_STALE_TIME,
  });
}

export function craneRequestQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: keys.detail(id),
    queryFn: ({ signal }) => fetchCraneRequest(id, signal),
    staleTime: 0,
  });
}

export function pendingApprovalCraneRequestsQueryOptions() {
  return queryOptions({
    queryKey: keys.pending(),
    queryFn: ({ signal }) => fetchPendingApprovalCraneRequests({}, signal),
    staleTime: CRANE_STALE_TIME,
  });
}

export function craneMyPermissionsQueryOptions() {
  return queryOptions({
    queryKey: keys.permissions(),
    queryFn: ({ signal }) => fetchCraneMyPermissions(signal),
    staleTime: 5 * 60_000,
  });
}

export function craneTypesQueryOptions(params: QueryParams = {}) {
  return queryOptions({
    queryKey: keys.types(params),
    queryFn: ({ signal }) => fetchCraneTypes(params, signal),
    staleTime: 5 * 60_000,
  });
}

export function craneRatesQueryOptions(craneType: number) {
  return queryOptions({
    queryKey: keys.rates(craneType),
    queryFn: ({ signal }) => fetchCraneRates({ crane_type: craneType }, signal),
    staleTime: 0,
  });
}

// ---------------- Mutations ----------------

function useInvalidateRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreateCraneRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({ mutationFn: createCraneRequest, onSuccess: invalidate });
}

export function useApproveCraneRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
      approveCraneRequest(id, comment),
    onSuccess: invalidate,
  });
}

export function useRejectCraneRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
      rejectCraneRequest(id, comment),
    onSuccess: invalidate,
  });
}

export function useCancelCraneRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({ mutationFn: (id: number) => cancelCraneRequest(id), onSuccess: invalidate });
}

export function useCompleteCraneRequest() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ id, ...input }: CraneCompleteInput & { id: number }) =>
      completeCraneRequest(id, input),
    onSuccess: invalidate,
  });
}

export function useCreateCraneRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCraneRate,
    onSuccess: (_data, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.typesAll }),
        queryClient.invalidateQueries({ queryKey: keys.rates(input.crane_type) }),
      ]),
  });
}
