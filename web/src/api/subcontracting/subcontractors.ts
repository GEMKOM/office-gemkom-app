import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// Port of apis/subcontracting/subcontractors.js (the CRUD part; the overview,
// monthly report and statement helpers stay with their legacy pages).

export interface Subcontractor {
  id: number;
  name: string;
  short_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  tax_office?: string;
  bank_info?: string;
  agreement_details?: string;
  /** TRY / USD / EUR / GBP (CUSTOMER_CURRENCY_OPTIONS). */
  default_currency?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Body of POST / PATCH /subcontracting/subcontractors/ (name required on create). */
export interface SubcontractorInput {
  name: string;
  short_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  tax_office?: string;
  bank_info?: string;
  agreement_details?: string;
  default_currency?: string;
  is_active?: boolean;
}

export type SubcontractorsParams = {
  /** Matches name, short_name, contact_person. */
  search?: string;
  is_active?: boolean | string;
  ordering?: string;
  page?: number;
  page_size?: number;
};

export const subcontractorKeys = {
  all: ['subcontractors'] as const,
  list: (params: SubcontractorsParams = {}) => ['subcontractors', 'list', params] as const,
  detail: (id: string | number) => ['subcontractors', 'detail', String(id)] as const,
};

const BASE = '/subcontracting/subcontractors/';
const detailPath = (id: string | number) => `${BASE}${id}/`;

/** Legacy fetchSubcontractors: GET /subcontracting/subcontractors/ with the filters as-is. */
export function fetchSubcontractors(params: SubcontractorsParams = {}, signal?: AbortSignal) {
  return apiFetch<unknown>(BASE, { params, signal }).then((data) =>
    toPaginated<Subcontractor>(data),
  );
}

export function subcontractorsQueryOptions(params: SubcontractorsParams = {}) {
  return queryOptions({
    queryKey: subcontractorKeys.list(params),
    queryFn: ({ signal }) => fetchSubcontractors(params, signal),
  });
}

/** Legacy fetchSubcontractor. */
export function fetchSubcontractor(
  id: string | number,
  signal?: AbortSignal,
): Promise<Subcontractor> {
  return apiFetch<Subcontractor>(detailPath(id), { signal });
}

export function subcontractorQueryOptions(id: string | number) {
  return queryOptions({
    queryKey: subcontractorKeys.detail(id),
    queryFn: ({ signal }) => fetchSubcontractor(id, signal),
  });
}

export function useSubcontractor(id: string | number | null | undefined) {
  return useQuery({
    ...subcontractorQueryOptions(id ?? ''),
    enabled: id !== null && id !== undefined && id !== '',
  });
}

export function createSubcontractor(data: SubcontractorInput): Promise<Subcontractor> {
  return apiFetch<Subcontractor>(BASE, { method: 'POST', body: data });
}

/** Legacy updateSubcontractor (PATCH). */
export function updateSubcontractor(
  id: string | number,
  data: Partial<SubcontractorInput>,
): Promise<Subcontractor> {
  return apiFetch<Subcontractor>(detailPath(id), { method: 'PATCH', body: data });
}

export function deleteSubcontractor(id: string | number): Promise<void> {
  return apiFetch<void>(detailPath(id), { method: 'DELETE' });
}

// Every list (and the dropdowns that share them) refetches in the background.
function useInvalidateSubcontractors() {
  const queryClient = useQueryClient();
  return (saved?: Subcontractor) => {
    if (saved?.id !== undefined)
      queryClient.setQueryData(subcontractorKeys.detail(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: subcontractorKeys.all });
  };
}

export function useCreateSubcontractor() {
  const invalidate = useInvalidateSubcontractors();
  return useMutation({ mutationFn: createSubcontractor, onSuccess: (saved) => invalidate(saved) });
}

export function useUpdateSubcontractor() {
  const invalidate = useInvalidateSubcontractors();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: Partial<SubcontractorInput> }) =>
      updateSubcontractor(id, data),
    onSuccess: (saved) => invalidate(saved),
  });
}

export function useDeleteSubcontractor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deleteSubcontractor(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: subcontractorKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: subcontractorKeys.all });
    },
  });
}
