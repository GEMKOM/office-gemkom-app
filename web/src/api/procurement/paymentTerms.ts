import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, cleanParams, type QueryParams } from '../client';
import { extractResults, toPaginated } from '../types';

// Payment terms side of apis/procurement.js (getPaymentTerms, createPaymentTerm,
// deletePaymentTerm, getBasisChoices), as the payment terms page uses them.

/** One row of `default_lines`: a share of the amount due on a basis + offset. */
export interface PaymentTermLine {
  label: string;
  /** The backend may send a decimal string ("50.00"). */
  percentage: number | string;
  basis: string;
  offset_days?: number;
}

export interface PaymentTerm {
  id: number;
  name?: string;
  code?: string;
  is_custom?: boolean;
  active?: boolean;
  default_lines?: PaymentTermLine[] | null;
  created_at?: string;
  [key: string]: unknown;
}

/** Body of POST /procurement/payment-terms/. */
export interface PaymentTermInput {
  name: string;
  code: string;
  is_custom: boolean;
  active: boolean;
  default_lines: { label: string; percentage: number; basis: string; offset_days: number }[];
}

/** GET /procurement/basis-choices/ items. */
export interface BasisChoice {
  value: string;
  label: string;
}

/** Query params the legacy page sent (unset ones are left out). */
export type PaymentTermsParams = {
  name?: string;
  code?: string;
  /** 'true' | 'false' */
  is_custom?: string;
  /** 'true' | 'false' */
  active?: string;
  /** YYYY-MM-DD */
  created_at__gte?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

const BASE = '/procurement/payment-terms/';
const detailPath = (id: string | number) => `${BASE}${id}/`;

/** Local query keys: [resource, scope, params?]. */
export const paymentTermKeys = {
  all: ['paymentTerms'] as const,
  list: (params: PaymentTermsParams = {}) =>
    ['paymentTerms', 'list', cleanParams(params as QueryParams)] as const,
  basisChoices: ['paymentTerms', 'basisChoices'] as const,
};

/** Basis choices are an enum on the backend; they do not change while the page is open. */
export const BASIS_CHOICES_STALE_TIME = 5 * 60_000;

/** Port of getPaymentTerms. */
export function getPaymentTerms(params: PaymentTermsParams = {}, signal?: AbortSignal) {
  return apiFetch<unknown>(BASE, { params: params as QueryParams, signal }).then((data) =>
    toPaginated<PaymentTerm>(data),
  );
}

export function paymentTermsQueryOptions(params: PaymentTermsParams = {}) {
  return queryOptions({
    queryKey: paymentTermKeys.list(params),
    queryFn: ({ signal }) => getPaymentTerms(params, signal),
  });
}

/** Port of getBasisChoices: [{ value, label }]. */
export function getBasisChoices(signal?: AbortSignal): Promise<BasisChoice[]> {
  return apiFetch<unknown>('/procurement/basis-choices/', { signal }).then((data) =>
    extractResults<BasisChoice>(data),
  );
}

export function basisChoicesQueryOptions() {
  return queryOptions({
    queryKey: paymentTermKeys.basisChoices,
    queryFn: ({ signal }) => getBasisChoices(signal),
    staleTime: BASIS_CHOICES_STALE_TIME,
  });
}

export function useBasisChoices() {
  return useQuery(basisChoicesQueryOptions());
}

export function createPaymentTerm(data: PaymentTermInput): Promise<PaymentTerm> {
  return apiFetch<PaymentTerm>(BASE, { method: 'POST', body: data });
}

export function deletePaymentTerm(id: string | number): Promise<void> {
  return apiFetch<void>(detailPath(id), { method: 'DELETE' });
}

function useInvalidatePaymentTermLists() {
  const queryClient = useQueryClient();
  // Basis choices are not affected by a payment term change.
  return () => queryClient.invalidateQueries({ queryKey: [...paymentTermKeys.all, 'list'] });
}

export function useCreatePaymentTerm() {
  const invalidate = useInvalidatePaymentTermLists();
  return useMutation({ mutationFn: createPaymentTerm, onSuccess: () => void invalidate() });
}

/**
 * The active terms as offer form options (sales/offers loadPaymentTermsOptions:
 * `?status=active&page_size=1000`), label the name or `#id`.
 */
export function activePaymentTermOptionsQueryOptions() {
  return queryOptions({
    queryKey: [...paymentTermKeys.all, 'list', 'active-options'] as const,
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>(BASE, {
        params: { status: 'active', page_size: 1000 },
        signal,
      });
      return extractResults<PaymentTerm>(data).map((pt) => ({
        value: String(pt.id),
        label: pt.name || `#${pt.id}`,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useDeletePaymentTerm() {
  const invalidate = useInvalidatePaymentTermLists();
  return useMutation({
    mutationFn: (id: string | number) => deletePaymentTerm(id),
    onSuccess: () => void invalidate(),
  });
}
