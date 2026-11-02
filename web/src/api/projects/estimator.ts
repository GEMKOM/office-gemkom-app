import { queryOptions } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';

// Port of apis/estimator.js (Tahmin: drawing-based cost and risk reports) for
// the React estimate report and the Tahminler list. Every call needs the
// `view_estimates` right; a 403 means "no access" and the card hides itself.
// The payloads are rendered by the legacy report-view.js builders, so they
// stay loosely typed here.

export type EstimateStatus = 'queued' | 'running' | 'done' | 'failed';
export type ReviewDecision = '' | 'accept' | 'correct';

export interface EstimateVersion {
  id: number;
  version: number;
  status: EstimateStatus;
  review_decision?: ReviewDecision | null;
}

/** GET /estimator/estimates/<id>/ (and …/latest/): the full report. */
export interface EstimateReport {
  id: number;
  version: number;
  status: EstimateStatus;
  subject_key?: string;
  subject_kind?: 'job' | 'offer';
  job_no?: string | null;
  offer_id?: number | null;
  title?: string | null;
  customer?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  started_at?: string | null;
  review_decision?: ReviewDecision | null;
  review_note?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  usage_usd?: number | string | null;
  model?: string | null;
  error?: string | null;
  inputs?: { weld_schedule_version?: number | null; [key: string]: unknown } | null;
  hours?: { scope?: string; [key: string]: unknown } | null;
  progress?: unknown;
  versions?: EstimateVersion[];
  weld_schedule?: WeldSchedule | null;
  [key: string]: unknown;
}

export interface WeldJoint {
  joint_id?: string;
  sub_id?: string | null;
  description?: string;
  source?: string | null;
  joint_type?: string;
  material?: string;
  size?: string;
  process?: string;
  count_per_unit?: number | null;
  length_m_each?: number | null;
  total_m_per_unit?: number | null;
  ndt?: string | null;
  [key: string]: unknown;
}

export interface WeldSchedule {
  version?: number;
  joints?: WeldJoint[];
  totals?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A slim row of GET /estimator/estimates/. */
export interface EstimateRow {
  id: number;
  version: number;
  status: EstimateStatus;
  subject_key: string;
  subject_kind?: 'job' | 'offer';
  title?: string | null;
  customer?: string | null;
  expected_total_eur?: { in_house?: number | null; subcontract?: number | null } | null;
  eur_per_kg?: { in_house?: number | null; subcontract?: number | null } | null;
  suggested_price_eur?: number | null;
  review_decision?: ReviewDecision | null;
  reviewed_by_name?: string | null;
  usage_usd?: number | string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  [key: string]: unknown;
}

/** A job order or an offer; `reportId` pins one report (no Oluştur for a subject of its own). */
export type EstimateSubject = { jobNo: string } | { offerId: number } | { reportId: number };

export type EstimateScope = 'unit' | 'programme';

export interface EstimatesFilters {
  q?: string;
  customer?: string;
  /** Comma-separated statuses. */
  status?: string;
  reviewed?: string;
  limit?: number;
}

const BASE = '/estimator';

function subjectParams(subject: { jobNo?: string; offerId?: number }) {
  return { job_no: subject.jobNo, offer_id: subject.offerId };
}

export const estimatorKeys = {
  all: ['estimator'] as const,
  list: (filters: EstimatesFilters) => ['estimator', 'estimates', 'list', filters] as const,
  report: (id: number) => ['estimator', 'estimates', 'detail', id] as const,
  latest: (subject: { jobNo?: string; offerId?: number }) => ['estimator', 'estimates', 'latest', subjectParams(subject)] as const,
  weld: (subject: { jobNo?: string; offerId?: number }) => ['estimator', 'weld-schedules', subjectParams(subject)] as const,
  method: ['estimator', 'method'] as const,
};

/** Slim rows, newest first. */
export function estimatesQueryOptions(filters: EstimatesFilters) {
  return queryOptions({
    queryKey: estimatorKeys.list(filters),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<{ count?: number; results?: EstimateRow[] }>(`${BASE}/estimates/`, {
        params: { ...filters },
        signal,
      });
      return data?.results ?? [];
    },
  });
}

export function getEstimate(id: number, signal?: AbortSignal): Promise<EstimateReport> {
  return apiFetch<EstimateReport>(`${BASE}/estimates/${id}/`, { signal });
}

/** The subject's newest report (any status), or null when it has none (404). */
export async function getLatestEstimate(
  subject: { jobNo?: string; offerId?: number },
  signal?: AbortSignal,
): Promise<EstimateReport | null> {
  try {
    return await apiFetch<EstimateReport>(`${BASE}/estimates/latest/`, { params: subjectParams(subject), signal });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** The subject's latest weld list, or null when it has none (404). */
export async function getWeldSchedule(
  subject: { jobNo?: string; offerId?: number },
  signal?: AbortSignal,
): Promise<WeldSchedule | null> {
  const path =
    'jobNo' in subject && subject.jobNo
      ? `${BASE}/weld-schedules/${encodeURIComponent(subject.jobNo)}/`
      : `${BASE}/weld-schedules/offer/${subject.offerId}/`;
  try {
    return await apiFetch<WeldSchedule>(path, { signal });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** Queue a new version; a 409 carries the running one's id in `data.id`. */
export function createEstimate(subject: { jobNo?: string; offerId?: number }, scope: EstimateScope): Promise<EstimateReport> {
  const body: Record<string, unknown> = subject.jobNo ? { job_no: subject.jobNo } : { offer_id: subject.offerId };
  if (scope === 'programme') body.scope = 'programme';
  return apiFetch<EstimateReport>(`${BASE}/estimates/`, { method: 'POST', body });
}

export function reviewEstimate(id: number, decision: 'accept' | 'correct', note = ''): Promise<EstimateReport> {
  return apiFetch<EstimateReport>(`${BASE}/estimates/${id}/review/`, { method: 'POST', body: { decision, note } });
}

/** Durdur; a 409 means the run had already finished. */
export function cancelEstimate(id: number): Promise<EstimateReport> {
  return apiFetch<EstimateReport>(`${BASE}/estimates/${id}/cancel/`, { method: 'POST' });
}
