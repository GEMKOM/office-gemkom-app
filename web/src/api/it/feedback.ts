import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '../client';
import { extractResults } from '../types';

/**
 * Feedback management (manage_feedback only; the API refuses everyone else
 * with 403). Port of the management half of apis/feedback.js.
 */

export interface FeedbackGithubEntry {
  repo?: string;
  issue_number?: number;
  issue_url?: string;
  issue_state?: string;
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: string | null;
  pr_merged_at?: string | null;
}

export interface FeedbackReport {
  id: number;
  created_at: string;
  reporter_name?: string | null;
  reporter_username?: string | null;
  kind: string;
  title: string;
  ai_summary?: string | null;
  priority?: string | null;
  status: string;
  github_issues?: FeedbackGithubEntry[];
  [key: string]: unknown;
}

export interface FeedbackAnalysis {
  summary?: string;
  severity?: string;
  risk?: string;
  estimated_scope?: string;
  affected_area?: string;
  reasoning?: string;
  implementation_brief?: string;
  acceptance_criteria?: string[];
  clarifying_questions?: string[];
}

export interface FeedbackReportDetail extends FeedbackReport {
  description?: string;
  page_url?: string | null;
  context?: { user_agent?: string; screen?: string; [key: string]: unknown } | null;
  admin_note?: string | null;
  analyzed_at?: string | null;
  reviewed_at?: string | null;
  resolved_at?: string | null;
  ai_analysis?: FeedbackAnalysis | null;
  ai_recommendation?: string | null;
  target_repo?: string | null;
  ai_cost_usd?: string | number | null;
  user_responses?: { questions?: string[]; text?: string; at?: string }[];
}

export interface FeedbackStats {
  open_total: number;
  awaiting_decision: number;
  in_pipeline: number;
  done_30d: number;
  ai_cost_30d: string | number;
}

export interface FeedbackFilters {
  status?: string;
  kind?: string;
  q?: string;
}

export const feedbackKeys = {
  all: ['feedbackReports'] as const,
  stats: () => ['feedbackReports', 'stats'] as const,
  list: (filters: FeedbackFilters) => ['feedbackReports', 'list', filters] as const,
  detail: (id: number) => ['feedbackReports', 'detail', id] as const,
};

/** Legacy manageFetch: the body's `detail`, else the call's own message; keeps the status. */
export class FeedbackError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FeedbackError';
    this.status = status;
  }
}

async function manageFetch<T>(request: Promise<T>, defaultMessage: string): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (!isApiError(error)) throw error;
    const detail = (error.data as { detail?: unknown } | undefined)?.detail;
    throw new FeedbackError(typeof detail === 'string' && detail ? detail : defaultMessage, error.status);
  }
}

export function isForbidden(error: unknown): boolean {
  return error instanceof FeedbackError && error.status === 403;
}

export function feedbackStatsQueryOptions() {
  return queryOptions({
    queryKey: feedbackKeys.stats(),
    queryFn: ({ signal }) =>
      manageFetch(apiFetch<FeedbackStats>('/feedback/reports/stats/', { signal }), 'İstatistikler yüklenemedi'),
  });
}

/** Port of listAllFeedbackReports: `all=1` plus the set filters. */
export function feedbackReportsQueryOptions(filters: FeedbackFilters) {
  return queryOptions({
    queryKey: feedbackKeys.list(filters),
    queryFn: async ({ signal }) =>
      extractResults<FeedbackReport>(
        await manageFetch(
          apiFetch<unknown>('/feedback/reports/', {
            params: { all: '1', status: filters.status, kind: filters.kind, q: filters.q },
            signal,
          }),
          'Bildirimler yüklenemedi',
        ),
      ),
  });
}

export function useFeedbackReport(id: number | null) {
  return useQuery({
    queryKey: feedbackKeys.detail(id ?? 0),
    queryFn: ({ signal }) =>
      manageFetch(apiFetch<FeedbackReportDetail>(`/feedback/reports/${id}/`, { signal }), 'Bildirim yüklenemedi'),
    enabled: id !== null,
  });
}

export type FeedbackAction = 'analyze' | 'queue' | 'sync' | 'dismiss';

const ACTION_MESSAGES: Record<FeedbackAction, string> = {
  analyze: 'Analiz başlatılamadı',
  queue: 'Kuyruğa alınamadı',
  sync: 'Senkronize edilemedi',
  dismiss: 'Reddedilemedi',
};

/** analyze / queue / sync / dismiss (with the optional note) on one report. */
export function useFeedbackAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: FeedbackAction; note?: string }) =>
      manageFetch(
        apiFetch<unknown>(`/feedback/reports/${id}/${action}/`, {
          method: 'POST',
          body: action === 'dismiss' ? { note: note ?? '' } : undefined,
        }),
        ACTION_MESSAGES[action],
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKeys.all }),
  });
}
