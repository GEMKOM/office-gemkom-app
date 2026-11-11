import { authedFetch } from '@/auth/authService';
import { ApiError, apiFetch, buildUrl, errorMessage } from './client';

// Neo, the in-app assistant: chat (streamed over SSE), conversations, quota,
// the user's bug / idea reports and the daily summaries. Same endpoints as the
// legacy widget (apis/assistant.js, apis/feedback.js, apis/dailySummary.js).

type Page<T> = { results?: T[] } | T[];
const results = <T>(page: Page<T> | undefined): T[] =>
  Array.isArray(page) ? page : (page?.results ?? []);

// ---------------------------------------------------------------- quota

export interface AssistantQuota {
  allowed: boolean;
  used_credits: number;
  monthly_limit_credits: number;
  messages_today: number;
  daily_message_limit: number;
}

/** 403 means Neo is closed for this user (the legacy `__assistantLocked`). */
export function getAssistantQuota(signal?: AbortSignal) {
  return apiFetch<AssistantQuota>('/assistant/me/', { signal });
}

export function isAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403;
}

/** "Bu ay: 1.200/5.000 kredi · Bugün: 3/40" */
export function quotaLine(quota: AssistantQuota): string {
  const n = (value: number) => Number(value || 0).toLocaleString('tr-TR');
  return (
    `Bu ay: ${n(quota.used_credits)}/${n(quota.monthly_limit_credits)} kredi · ` +
    `Bugün: ${quota.messages_today}/${quota.daily_message_limit}`
  );
}

// -------------------------------------------------------- conversations

export interface ConversationSummary {
  id: number;
  title?: string | null;
  updated_at?: string | null;
}

export interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  outcome?: string | null;
  /** 1, -1 or null: the user's thumbs on an answer. */
  feedback?: number | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
}

export function listConversations(signal?: AbortSignal) {
  return apiFetch<Page<ConversationSummary>>('/assistant/conversations/', { signal }).then(results);
}

export function getConversation(id: number, signal?: AbortSignal) {
  return apiFetch<ConversationDetail>(`/assistant/conversations/${id}/`, { signal });
}

export function archiveConversation(id: number) {
  return apiFetch<void>(`/assistant/conversations/${id}/`, { method: 'DELETE' });
}

/** Why an answer was not useful (sent with a thumbs down). */
export type FeedbackReason = 'wrong' | 'incomplete' | 'slow' | 'unclear' | 'other';

export function sendMessageFeedback(
  messageId: number,
  value: 1 | -1 | null,
  reason?: FeedbackReason,
) {
  return apiFetch<unknown>(`/assistant/messages/${messageId}/feedback/`, {
    method: 'POST',
    body: reason ? { value, reason } : { value },
  });
}

// ------------------------------------------------------------------ chat

/** The frames the chat endpoint emits, by event name. */
export type ChatEvent =
  | { event: 'conversation'; data: { conversation_id: number; title?: string } }
  | { event: 'delta'; data: { text: string } }
  | {
      event: 'tool';
      data: { name: string; status: 'start' | 'done' | 'error'; duration_ms?: number };
    }
  /** Up to three follow-up questions, sent after the answer text. */
  | { event: 'followups'; data: { items: string[] } }
  | {
      event: 'done';
      data: {
        conversation_id?: number;
        message_id?: number | null;
        outcome?: string;
        followups?: string[];
      };
    }
  | {
      event: 'error';
      data: { conversation_id?: number; message_id?: number | null; detail?: string };
    };

/**
 * Splits buffered SSE text into complete frames. Returns the frames and the
 * unfinished tail to keep for the next chunk. Frames without data, or whose
 * data is not JSON, are skipped (as the legacy reader does).
 */
export function parseSseFrames(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  let rest = buffer.replace(/\r\n/g, '\n');
  let index;
  while ((index = rest.indexOf('\n\n')) !== -1) {
    const frame = rest.slice(0, index);
    rest = rest.slice(index + 2);
    let event = 'message';
    let data = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).replace(/^ /, '');
    }
    if (!data) continue;
    try {
      events.push({ event, data: JSON.parse(data) } as ChatEvent);
    } catch {
      // A malformed frame is dropped; the stream goes on.
    }
  }
  return { events, rest };
}

export const NEO_UNAVAILABLE = 'Neo şu anda yanıt veremiyor.';

/** Record types a page can tell Neo about (gemkom-backend assistant/page_context.py). */
export type NeoPageType =
  | 'job_order'
  | 'purchase_request'
  | 'purchase_order'
  | 'ncr'
  | 'planning_request'
  | 'daily_summary';

/** The record on screen, sent with a question so "bu iş" means it. */
export interface NeoPageContext {
  type: NeoPageType;
  /** What the record's page and Neo's tools know it by: job no, request no, ... */
  id: string;
  /** A short human name, e.g. the job title. */
  label?: string;
  path?: string;
}

/** Where a question came from, for the usage analytics. */
export type ChatSource = 'panel' | 'suggestion' | 'followup' | 'page_button' | 'home' | 'summary';

/**
 * Sends one question and calls `onEvent` for every frame of the streamed
 * answer. EventSource cannot send the JWT header, so this POSTs through
 * authedFetch and reads the body itself.
 */
export async function streamChat({
  message,
  conversationId,
  context,
  source,
  onEvent,
  signal,
}: {
  message: string;
  conversationId: number | null;
  context?: NeoPageContext | null;
  source?: ChatSource;
  onEvent: (event: ChatEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const body: Record<string, unknown> = { message };
  if (conversationId) body.conversation_id = conversationId;
  if (context) body.context = context;
  if (source) body.source = source;

  const response = await authedFetch(buildUrl('/assistant/chat/'), {
    method: 'POST',
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    const text = errorMessage(response.status, data);
    throw new ApiError(response.status, data, text.startsWith('HTTP ') ? NEO_UNAVAILABLE : text);
  }
  if (!response.body) throw new Error(NEO_UNAVAILABLE);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseFrames(buffer);
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
  // A last frame without the trailing blank line still counts.
  parseSseFrames(`${buffer}\n\n`).events.forEach(onEvent);
}

// --------------------------------------------------------------- reports

export type ReportKind = 'bug' | 'feature' | 'improvement' | 'other';
export type ReportStatus =
  | 'new'
  | 'analyzed'
  | 'needs_info'
  | 'duplicate'
  | 'queued'
  | 'in_review'
  | 'done'
  | 'dismissed'
  | 'failed';

export interface FeedbackReport {
  id: number;
  kind: ReportKind | string;
  title: string;
  description?: string | null;
  status: ReportStatus | string;
  status_display?: string | null;
  ai_summary?: string | null;
  clarifying_questions?: string[] | null;
  user_responses?: { questions?: string[]; text?: string; at?: string | null }[] | null;
  created_at?: string | null;
  analyzed_at?: string | null;
  queued_at?: string | null;
  resolved_at?: string | null;
}

/** Neo asked follow-up questions on this report and is waiting for the answer. */
export function needsAnswer(report: FeedbackReport): boolean {
  return report.status === 'needs_info' && (report.clarifying_questions ?? []).length > 0;
}

export function listMyReports(signal?: AbortSignal) {
  return apiFetch<Page<FeedbackReport>>('/feedback/reports/', { signal }).then(results);
}

export function createReport(input: {
  kind: ReportKind;
  title: string;
  description: string;
  pageUrl: string;
  context: Record<string, unknown>;
}) {
  return apiFetch<FeedbackReport>('/feedback/reports/', {
    method: 'POST',
    body: {
      kind: input.kind,
      title: input.title,
      description: input.description,
      page_url: input.pageUrl,
      context: input.context,
    },
  });
}

export function respondToReport(id: number, message: string) {
  return apiFetch<FeedbackReport>(`/feedback/reports/${id}/respond/`, {
    method: 'POST',
    body: { message },
  });
}

// -------------------------------------------------------- daily summaries

export interface DailySummaryRow {
  id: number;
  summary_date: string;
  status: 'ok' | 'empty' | string;
  headline?: string | null;
  is_read?: boolean;
  stats?: Record<string, number | string | null> | null;
}

/** A detail row: the list fields plus the payload the renderer lays out. */
export interface DailySummaryDetail extends DailySummaryRow {
  payload?: Record<string, unknown> | null;
  for_you?: { department_code?: string | null } | null;
  window_start?: string | null;
  window_end?: string | null;
  generated_at?: string | null;
}

export function listDailySummaries(days: number, signal?: AbortSignal) {
  return apiFetch<Page<DailySummaryRow>>('/assistant/daily-summary/', {
    signal,
    params: { days },
  }).then(results);
}

/**
 * The newest ready summary (full detail), or null when there is none or the
 * account has no access (403/404): the morning check runs for everyone and
 * "nothing to show" is not an error.
 */
export async function getLatestDailySummary(
  signal?: AbortSignal,
): Promise<DailySummaryDetail | null> {
  try {
    const data = await apiFetch<{ summary?: DailySummaryDetail | null }>(
      '/assistant/daily-summary/latest/',
      { signal },
    );
    return data?.summary ?? null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

export function getDailySummary(id: number, signal?: AbortSignal) {
  return apiFetch<DailySummaryDetail>(`/assistant/daily-summary/${id}/`, { signal });
}

export interface SummaryReadMeta {
  seconds_open?: number;
  expanded?: boolean;
  source?: 'modal' | 'pane' | 'deeplink' | 'banner';
}

/** Idempotent; the server ignores it while an admin impersonates. */
export function markDailySummaryRead(id: number, meta: SummaryReadMeta = {}) {
  return apiFetch<unknown>(`/assistant/daily-summary/${id}/read/`, { method: 'POST', body: meta });
}

/** "3 iş emri · 2 konu · 14 yorum" */
export function summaryMiniStats(summary: DailySummaryRow): string {
  const stats = summary.stats ?? {};
  const num = (key: string) => Number(stats[key]) || 0;
  const jobs = num('new_jobs_root') + num('new_jobs_child');
  return `${jobs} iş emri · ${num('topics_new')} konu · ${num('comments')} yorum`;
}

// ------------------------------------------- job-order discussion summaries

// Neo Özeti (legacy components/discussion-summary): one shared AI summary of
// every discussion on a job order and its sub-jobs.

export interface DiscussionSummaryText {
  content: string;
  created_at?: string | null;
  created_by?: string | null;
  topic_count?: number;
  comment_count?: number;
  omitted_topic_count?: number;
}

export interface DiscussionSummaryState {
  /** What there is to summarise now. */
  current: { topic_count: number; comment_count: number };
  summary: DiscussionSummaryText | null;
  /** A topic or comment changed since the summary was written. */
  is_stale?: boolean;
  /** Someone's request is being written right now. */
  generating?: boolean;
  /** POST only: false when the saved summary was still current. */
  created?: boolean;
  /** Topic ids the summary may cite as [#id]. */
  topic_refs?: Record<string, { title?: string; job_no?: string | null }>;
}

// Legacy used encodeURI: a job number keeps its slashes ("260-02/P1").
const summaryUrl = (jobNo: string) => `/assistant/discussion-summaries/${encodeURI(jobNo)}/`;

/** Port of getDiscussionSummary. A 403 means no Neo access. */
export function getDiscussionSummary(jobNo: string, signal?: AbortSignal) {
  return apiFetch<DiscussionSummaryState>(summaryUrl(jobNo), { signal });
}

/** Port of generateDiscussionSummary. 409: someone else is writing it; 429: budget spent. */
export function generateDiscussionSummary(jobNo: string) {
  return apiFetch<DiscussionSummaryState>(summaryUrl(jobNo), { method: 'POST' });
}
