import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { toPaginated } from '../types';

// Port of apis/subcontracting/subcontractors.js: the CRUD part and the monthly
// report (mark-paid lives in ./statements.ts; the overview and cost breakdown
// helpers stay with their legacy pages).

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

// ---- monthly report (Taşeron Genel Bakış) -----------------------------------

type Decimal = number | string | null;

export interface MonthlyReportSubcontractor {
  id: number;
  name?: string | null;
  short_name?: string | null;
  is_active?: boolean;
  /** Average headcount of the period's statements (1 decimal), null when none entered. */
  avg_employee_count?: Decimal;
  employee_count_months?: number;
  default_currency?: string | null;
  [key: string]: unknown;
}

export interface MonthlyReportStatement {
  id: number;
  subcontractor_id: number;
  /** 'YYYY-MM'. */
  period: string;
  status: string;
  employee_count?: Decimal;
  currency?: string | null;
  [key: string]: unknown;
}

/** One subcontractor × month × fiyat kalemi × job × kind fact. */
export interface MonthlyReportFact {
  subcontractor_id: number;
  period: string;
  kalem_key: string;
  job_no: string;
  job_title?: string | null;
  customer_name?: string | null;
  job_status?: string | null;
  kind: 'billed' | 'pending' | 'adjustment' | string;
  adjustment_type?: string | null;
  reason?: string | null;
  statement_status?: string | null;
  previous_progress?: Decimal;
  current_progress?: Decimal;
  allocated_weight_kg?: Decimal;
  weight_kg?: Decimal;
  price_per_kg?: Decimal;
  amount?: Decimal;
  currency?: string | null;
  [key: string]: unknown;
}

/** Remaining work per subcontractor × kalem × job, as of today. */
export interface MonthlyReportBacklog {
  subcontractor_id: number;
  kalem_key: string;
  job_no: string;
  job_title?: string | null;
  customer_name?: string | null;
  job_status?: string | null;
  allocated_weight_kg?: Decimal;
  done_weight_kg?: Decimal;
  remaining_weight_kg?: Decimal;
  contract_amount?: Decimal;
  remaining_amount?: Decimal;
  currency?: string | null;
  [key: string]: unknown;
}

export interface MonthlyReport {
  period: { start: string | null; end: string | null };
  current_period?: string;
  subcontractors: MonthlyReportSubcontractor[];
  kalems: { key: string; label: string }[];
  statements: MonthlyReportStatement[];
  facts: MonthlyReportFact[];
  backlog: MonthlyReportBacklog[];
}

export type MonthlyReportParams = {
  /** First month, 'YYYY-MM' (inclusive). */
  start?: string;
  /** Last month, 'YYYY-MM' (inclusive). */
  end?: string;
  /** Name, short name, contact person. */
  search?: string;
  is_active?: string;
  /** Comma separated job order statuses. */
  job_status?: string;
};

/**
 * Legacy fetchSubcontractorMonthlyReport: GET
 * /subcontracting/subcontractors/monthly-report/ (unset filters left out).
 */
export function monthlyReportQueryOptions(params: MonthlyReportParams) {
  return queryOptions({
    queryKey: [...subcontractorKeys.all, 'monthlyReport', params] as const,
    queryFn: async ({ signal }): Promise<MonthlyReport> => {
      const data = await apiFetch<Partial<MonthlyReport>>(`${BASE}monthly-report/`, {
        params,
        signal,
      });
      return {
        period: data.period ?? { start: null, end: null },
        current_period: data.current_period,
        subcontractors: data.subcontractors ?? [],
        kalems: data.kalems ?? [],
        statements: data.statements ?? [],
        facts: data.facts ?? [],
        backlog: data.backlog ?? [],
      };
    },
  });
}
