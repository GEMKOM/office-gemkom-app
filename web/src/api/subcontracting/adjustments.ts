import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// Port of apis/subcontracting/adjustments.js: the flat report of every
// statement adjustment (ek ödeme / kesinti) across subcontractors.

export type AdjustmentType = 'addition' | 'deduction';

export interface SubcontractingAdjustment {
  id: number;
  adjustment_type: AdjustmentType | string;
  created_at?: string;
  statement?: number;
  statement_year?: number | null;
  statement_month?: number | null;
  statement_period?: string | null;
  subcontractor?: number;
  subcontractor_name?: string | null;
  job_no?: string | null;
  /** Decimal string. */
  weight_kg?: string | number | null;
  /** Decimal string. */
  amount?: string | number | null;
  currency?: string | null;
  reason?: string | null;
  description?: string | null;
  [key: string]: unknown;
}

export interface AdjustmentsReport {
  count: number;
  results: SubcontractingAdjustment[];
  summary: unknown[];
}

export type AdjustmentsParams = {
  subcontractor?: number | string;
  year?: number | string;
  /** 1-12. */
  month?: number | string;
  adjustment_type?: AdjustmentType;
  /** Partial match. */
  job_no?: string;
  /** created_at | -created_at | amount | -amount | period | -period */
  ordering?: string;
};

export const adjustmentKeys = {
  all: ['subcontractingAdjustments'] as const,
  report: (params: AdjustmentsParams = {}) =>
    ['subcontractingAdjustments', 'report', params] as const,
};

/** Legacy fetchAdjustmentsReport: GET /subcontracting/adjustments/ (unset filters left out). */
export async function fetchAdjustmentsReport(
  params: AdjustmentsParams = {},
  signal?: AbortSignal,
): Promise<AdjustmentsReport> {
  const data = await apiFetch<unknown>('/subcontracting/adjustments/', { params, signal });
  const results = extractResults<SubcontractingAdjustment>(data);
  const body = (
    data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  ) as Partial<AdjustmentsReport>;
  return {
    count: typeof body.count === 'number' ? body.count : results.length,
    results,
    summary: Array.isArray(body.summary) ? body.summary : [],
  };
}

export function adjustmentsReportQueryOptions(params: AdjustmentsParams = {}) {
  return queryOptions({
    queryKey: adjustmentKeys.report(params),
    queryFn: ({ signal }) => fetchAdjustmentsReport(params, signal),
  });
}
