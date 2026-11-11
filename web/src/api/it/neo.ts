import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError, apiFetch, isApiError } from '../client';
import { toPaginated, type Paginated } from '../types';

// Neo (assistant) usage analytics: ports of the analytics half of
// apis/assistant.js and apis/dailySummary.js. Every endpoint here answers only
// manage_assistant_analytics; everyone else gets 403.

const BASE = '/assistant';

// ---------------------------------------------------------------- types

export interface NeoOutcomeCount {
  outcome: string;
  count: number;
}

export interface NeoUserUsage {
  conversation__user__username?: string | null;
  messages?: number;
  cost_usd?: string | number | null;
  thumbs_down?: number | null;
  [key: string]: unknown;
}

export interface NeoToolUsage {
  tool_name: string;
  calls?: number;
  denied?: number | null;
  avg_duration_ms?: number | null;
  [key: string]: unknown;
}

export interface NeoJobUsage {
  job_no: string;
  times_asked?: number;
  [key: string]: unknown;
}

export interface NeoWeek {
  /** Monday of the week, 'YYYY-MM-DD', Istanbul. */
  week_start: string;
  active_users: number;
  questions: number;
}

/** The summary's engagement block: is Neo used, and is it good enough. */
export interface NeoEngagement {
  questions_per_user: number;
  /** Every week of the window, oldest first, empty weeks included. */
  weekly: NeoWeek[];
  /** Real answers only (no greetings, refusals or errors); null with no samples. */
  latency: { samples: number; p50_ms: number | null; p90_ms: number | null };
  /** Thumbs-down reasons; 'none' = voted down without picking one. */
  feedback_reasons: { reason: string; count: number }[];
  truncated: number;
  tool_limit_hits: number;
  /** Entry points; 'unknown' = asked before the panel reported one. */
  sources: { source: string; count: number }[];
  with_page_context: number;
}

/** GET /assistant/analytics/summary/?days=N */
export interface NeoAnalyticsSummary {
  days: number;
  questions: number;
  active_users: number;
  total_cost_usd: string | number | null;
  avg_latency_ms: number | null;
  feedback: { up: number; down: number };
  outcomes: NeoOutcomeCount[];
  per_user: NeoUserUsage[];
  per_tool: NeoToolUsage[];
  top_job_orders: NeoJobUsage[];
  /** Absent from backends older than gemkom-backend's neo-metrics change. */
  engagement?: NeoEngagement;
  [key: string]: unknown;
}

/** One logged question (GET /assistant/analytics/questions/). */
export interface NeoQuestion {
  id?: number;
  created_at: string;
  user?: string | null;
  user_full_name?: string | null;
  content?: string | null;
  conversation_id: number;
  [key: string]: unknown;
}

export interface NeoToolCall {
  tool_name: string;
  job_no?: string | null;
  allowed?: boolean;
  [key: string]: unknown;
}

export interface NeoMessage {
  id?: number;
  role: 'user' | 'assistant' | string;
  content?: string | null;
  outcome?: string | null;
  cost_usd?: string | number | null;
  latency_ms?: number | null;
  /** 1 thumbs up, -1 thumbs down, null none. */
  feedback?: number | null;
  tool_calls?: NeoToolCall[];
  [key: string]: unknown;
}

/** GET /assistant/analytics/conversations/{id}/ */
export interface NeoConversation {
  id: number;
  user: string;
  title?: string | null;
  messages: NeoMessage[];
  [key: string]: unknown;
}

export type DailySummaryStatus = 'ok' | 'empty' | 'failed' | 'running';

/** A DailySummary analytics row: status plus the cost / read ledger. */
export interface DailySummaryRow {
  id: number;
  summary_date: string;
  status: DailySummaryStatus | string;
  headline?: string | null;
  error_detail?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
  cost_usd?: string | number | null;
  read_count?: number | null;
  avg_read_seconds?: string | number | null;
  /** 0..1 */
  expand_rate?: string | number | null;
  latency_ms?: number | null;
  attempts?: number | null;
  triggered_by?: string | null;
  generated_at?: string | null;
  window_start?: string | null;
  window_end?: string | null;
  [key: string]: unknown;
}

/** GET /assistant/analytics/daily-summaries/{id}/: the row plus the payload. */
export interface DailySummaryDetail extends DailySummaryRow {
  payload?: Record<string, unknown> | null;
  warnings?: unknown[] | null;
  redactions?: number | null;
  facts_chars?: number | null;
}

/** Body of run / regenerate: {status, id, summary_date, ...} or an analytics row. */
export interface DailySummaryRunResult {
  status?: string;
  error?: string;
  error_detail?: string;
  [key: string]: unknown;
}

export interface NeoQuestionsParams {
  days: number;
  q?: string;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------- errors

/**
 * Legacy error text: analyticsFetch used `detail`, dsFetch `detail` then
 * `error` (the run endpoints answer a failed generation with 500 {status,
 * error}); otherwise the call's default message. `status` is kept.
 */
async function withMessage<T>(
  request: Promise<T>,
  fallback: string,
  keys: readonly string[],
): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (!isApiError(error)) throw error;
    const body =
      error.data && typeof error.data === 'object' && !Array.isArray(error.data)
        ? (error.data as Record<string, unknown>)
        : {};
    const found = keys
      .map((key) => body[key])
      .find((v): v is string => typeof v === 'string' && v !== '');
    throw new ApiError(error.status, error.data, found ?? fallback);
  }
}

const ANALYTICS_KEYS = ['detail'] as const;
const SUMMARY_KEYS = ['detail', 'error'] as const;

// ---------------------------------------------------------------- keys

export const neoKeys = {
  all: ['it', 'neo'] as const,
  summary: (days: number) => ['it', 'neo', 'summary', days] as const,
  questionsAll: ['it', 'neo', 'questions'] as const,
  questions: (params: NeoQuestionsParams) => ['it', 'neo', 'questions', params] as const,
  conversation: (id: number | null) => ['it', 'neo', 'conversation', id] as const,
  dailySummaries: ['it', 'neo', 'daily-summaries'] as const,
  dailySummaryList: (days: number) => ['it', 'neo', 'daily-summaries', 'list', days] as const,
  dailySummary: (id: number | null) => ['it', 'neo', 'daily-summaries', 'detail', id] as const,
};

// ---------------------------------------------------------------- assistant analytics

/** Port of getAnalyticsSummary(days). */
export function getNeoAnalyticsSummary(
  days = 30,
  signal?: AbortSignal,
): Promise<NeoAnalyticsSummary> {
  return withMessage(
    apiFetch<NeoAnalyticsSummary>(`${BASE}/analytics/summary/`, { params: { days }, signal }),
    'Kullanım özeti yüklenemedi',
    ANALYTICS_KEYS,
  );
}

/** Port of getAnalyticsQuestions: days, page, page_size, and q only when set. */
export async function getNeoQuestions(
  { days, q = '', page, pageSize }: NeoQuestionsParams,
  signal?: AbortSignal,
): Promise<Paginated<NeoQuestion>> {
  const data = await withMessage(
    apiFetch<unknown>(`${BASE}/analytics/questions/`, {
      params: { days, page, page_size: pageSize, q },
      signal,
    }),
    'Soru kayıtları yüklenemedi',
    ANALYTICS_KEYS,
  );
  return toPaginated<NeoQuestion>(data);
}

/** Port of getAnalyticsConversation(id). */
export function getNeoConversation(id: number, signal?: AbortSignal): Promise<NeoConversation> {
  return withMessage(
    apiFetch<NeoConversation>(`${BASE}/analytics/conversations/${id}/`, { signal }),
    'Sohbet yüklenemedi',
    ANALYTICS_KEYS,
  );
}

// ---------------------------------------------------------------- daily summaries (analytics)

/** Port of getAnalyticsDailySummaries: all statuses with the cost ledger. */
export async function getDailySummaryRows(
  days = 90,
  signal?: AbortSignal,
): Promise<DailySummaryRow[]> {
  const data = await withMessage(
    apiFetch<unknown>(`${BASE}/analytics/daily-summaries/`, { params: { days }, signal }),
    'Özet kayıtları yüklenemedi',
    SUMMARY_KEYS,
  );
  // Legacy: Array.isArray(rows) ? rows : rows?.results || []
  if (Array.isArray(data)) return data as DailySummaryRow[];
  const results = (data as { results?: unknown } | null | undefined)?.results;
  return Array.isArray(results) ? (results as DailySummaryRow[]) : [];
}

/** Port of getAnalyticsDailySummary(id). */
export function getDailySummaryDetail(
  id: number,
  signal?: AbortSignal,
): Promise<DailySummaryDetail> {
  return withMessage(
    apiFetch<DailySummaryDetail>(`${BASE}/analytics/daily-summaries/${encodeURIComponent(id)}/`, {
      signal,
    }),
    'Özet kaydı yüklenemedi',
    SUMMARY_KEYS,
  );
}

/** Port of regenerateDailySummary. Errors: 409 already running, 502 model/API failure. */
export function regenerateDailySummary(
  id: number,
  { resetReads = false }: { resetReads?: boolean } = {},
): Promise<DailySummaryRunResult> {
  return withMessage(
    apiFetch<DailySummaryRunResult>(
      `${BASE}/analytics/daily-summaries/${encodeURIComponent(id)}/regenerate/`,
      {
        method: 'POST',
        body: { reset_reads: !!resetReads },
      },
    ),
    'Özet yeniden üretilemedi',
    SUMMARY_KEYS,
  );
}

/** Port of runDailySummary: same body as the scheduler's task call. */
export function runDailySummary({
  date = '',
  force = false,
}: { date?: string; force?: boolean } = {}): Promise<DailySummaryRunResult> {
  const body: { force: boolean; date?: string } = { force: !!force };
  if (date) body.date = date;
  return withMessage(
    apiFetch<DailySummaryRunResult>(`${BASE}/analytics/daily-summaries/run/`, {
      method: 'POST',
      body,
    }),
    'Özet üretilemedi',
    SUMMARY_KEYS,
  );
}

// ---------------------------------------------------------------- query options / hooks

export function neoSummaryQueryOptions(days: number) {
  return queryOptions({
    queryKey: neoKeys.summary(days),
    queryFn: ({ signal }) => getNeoAnalyticsSummary(days, signal),
  });
}

export function neoQuestionsQueryOptions(params: NeoQuestionsParams) {
  return queryOptions({
    queryKey: neoKeys.questions(params),
    queryFn: ({ signal }) => getNeoQuestions(params, signal),
  });
}

export function neoConversationQueryOptions(id: number) {
  return queryOptions({
    queryKey: neoKeys.conversation(id),
    queryFn: ({ signal }) => getNeoConversation(id, signal),
  });
}

export function dailySummaryRowsQueryOptions(days: number) {
  return queryOptions({
    queryKey: neoKeys.dailySummaryList(days),
    queryFn: ({ signal }) => getDailySummaryRows(days, signal),
  });
}

export function dailySummaryDetailQueryOptions(id: number) {
  return queryOptions({
    queryKey: neoKeys.dailySummary(id),
    queryFn: ({ signal }) => getDailySummaryDetail(id, signal),
  });
}

export function useNeoSummary(days: number) {
  return useQuery({ ...neoSummaryQueryOptions(days), placeholderData: keepPreviousData });
}

export function useNeoQuestions(params: NeoQuestionsParams) {
  return useQuery({ ...neoQuestionsQueryOptions(params), placeholderData: keepPreviousData });
}

export function useDailySummaryRows(days: number) {
  return useQuery({ ...dailySummaryRowsQueryOptions(days), placeholderData: keepPreviousData });
}

/** The open transcript; null keeps it idle. */
export function useNeoConversation(id: number | null) {
  return useQuery({
    queryKey: neoKeys.conversation(id),
    queryFn: ({ signal }) => getNeoConversation(id as number, signal),
    enabled: id !== null,
  });
}

/** The open daily summary; null keeps it idle. */
export function useDailySummaryDetail(id: number | null) {
  return useQuery({
    queryKey: neoKeys.dailySummary(id),
    queryFn: ({ signal }) => getDailySummaryDetail(id as number, signal),
    enabled: id !== null,
  });
}

/** Run today's summary; the summaries reload whatever the outcome (legacy). */
export function useRunDailySummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => runDailySummary({ force: false }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: neoKeys.dailySummaries }),
  });
}

/** Regenerate one summary in place (reads kept); the summaries reload afterwards. */
export function useRegenerateDailySummary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => regenerateDailySummary(id, { resetReads: false }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: neoKeys.dailySummaries }),
  });
}
