import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { qk } from '../keys';
import { toPaginated } from '../types';
import { REFERENCE_STALE_TIME, type ReferenceQueryOptions } from './shared';

export type CustomerCurrency = 'TRY' | 'USD' | 'EUR' | 'GBP';

export interface Customer {
  id: number;
  code: string;
  name: string;
  short_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  tax_office?: string;
  is_active?: boolean;
  default_currency?: CustomerCurrency | string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Body of POST / PUT / PATCH /projects/customers/ (code and name required on create). */
export interface CustomerInput {
  code: string;
  name: string;
  short_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  tax_office?: string;
  /** Backend default "TRY". */
  default_currency?: CustomerCurrency | string;
  /** Backend default true. */
  is_active?: boolean;
  notes?: string;
}

/** Legacy CURRENCY_OPTIONS from apis/projects/customers.js. */
export const CUSTOMER_CURRENCY_OPTIONS: { value: CustomerCurrency; label: string }[] = [
  { value: 'TRY', label: 'Türk Lirası' },
  { value: 'USD', label: 'Amerikan Doları' },
  { value: 'EUR', label: 'Euro' },
  { value: 'GBP', label: 'İngiliz Sterlini' },
];

export type CustomersParams = {
  /** Matches code, name, short_name, contact_person, email. */
  search?: string;
  is_active?: boolean;
  default_currency?: CustomerCurrency | string;
  show_inactive?: boolean;
  ordering?: string;
  page?: number;
  // Legacy callers pass page_size but listCustomers dropped it; sent here.
  page_size?: number;
};

const BASE = '/projects/customers/';
const detailPath = (id: string | number) => `${BASE}${id}/`;

/** Port of apis/projects/customers.js listCustomers. */
export function customersQueryOptions(params: CustomersParams = {}) {
  return queryOptions({
    queryKey: qk.customers.list(params),
    queryFn: async ({ signal }) =>
      toPaginated<Customer>(await apiFetch<unknown>(BASE, { params, signal })),
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useCustomers(
  params: CustomersParams = {},
  options: ReferenceQueryOptions = {},
) {
  return useQuery({ ...customersQueryOptions(params), ...options });
}

/** Port of getCustomerById. */
export function getCustomerById(id: string | number, signal?: AbortSignal): Promise<Customer> {
  return apiFetch<Customer>(detailPath(id), { signal });
}

export function customerQueryOptions(id: string | number) {
  return queryOptions({
    queryKey: qk.customers.detail(id),
    queryFn: ({ signal }) => getCustomerById(id, signal),
  });
}

export function useCustomer(id: string | number | null | undefined, options: ReferenceQueryOptions = {}) {
  return useQuery({
    ...customerQueryOptions(id ?? ''),
    ...options,
    enabled: id !== null && id !== undefined && id !== '' && (options.enabled ?? true),
  });
}

export function createCustomer(data: CustomerInput): Promise<Customer> {
  return apiFetch<Customer>(BASE, { method: 'POST', body: data });
}

/** Full update (PUT). */
export function updateCustomer(id: string | number, data: CustomerInput): Promise<Customer> {
  return apiFetch<Customer>(detailPath(id), { method: 'PUT', body: data });
}

/** Partial update (PATCH); what the legacy edit modal uses. */
export function patchCustomer(id: string | number, data: Partial<CustomerInput>): Promise<Customer> {
  return apiFetch<Customer>(detailPath(id), { method: 'PATCH', body: data });
}

export function deleteCustomer(id: string | number): Promise<void> {
  return apiFetch<void>(detailPath(id), { method: 'DELETE' });
}

// Lists (and the dropdowns that share them) are refetched in the background;
// the mutation does not wait for that.
function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return (saved?: Customer) => {
    if (saved?.id !== undefined) queryClient.setQueryData(qk.customers.detail(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: qk.customers.all });
  };
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({ mutationFn: createCustomer, onSuccess: (saved) => invalidate(saved) });
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: CustomerInput }) => updateCustomer(id, data),
    onSuccess: (saved) => invalidate(saved),
  });
}

export function usePatchCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: Partial<CustomerInput> }) =>
      patchCustomer(id, data),
    onSuccess: (saved) => invalidate(saved),
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteCustomer(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: qk.customers.detail(id) });
      void queryClient.invalidateQueries({ queryKey: qk.customers.all });
    },
  });
}
