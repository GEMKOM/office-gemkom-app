import { apiFetch } from './client';

// Günün Quizi (gemkom-backend quiz app, mounted at /quiz/). The server owns
// the timer and the scoring: answers never come back as right or wrong until
// the day closes, so nothing here can leak an answer to a colleague.

export type QuizCategory = 'data' | 'app' | 'isg' | 'technical' | 'general';
export type QuizStatus = 'none' | 'not_open' | 'available' | 'in_progress' | 'finished';
export type LeaderboardPeriod = 'day' | 'week' | 'month';

export interface QuizAttemptSummary {
  started_at: string;
  finished_at: string | null;
  total_score: number;
  total_ms: number;
  answered: number;
  timed_out: number;
  /** Set once the attempt is finished (or the day has closed). */
  rank: number | null;
  players: number;
}

export interface LeaderboardRow {
  rank: number;
  user_id: number;
  name: string;
  score: number;
  days: number;
  is_me: boolean;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  start: string;
  end: string;
  players: number;
  top: LeaderboardRow[];
  me: LeaderboardRow | null;
}

export interface QuizToday {
  date: string;
  status: QuizStatus;
  opens_at: string;
  closes_at: string;
  question_count: number;
  seconds_per_question: number;
  attempt: QuizAttemptSummary | null;
  streak: number;
  yesterday: {
    date: string;
    winners: LeaderboardRow[];
    review_available: boolean;
  };
}

export interface QuizQuestion {
  id: number;
  number: number;
  total: number;
  category: QuizCategory;
  category_label: string;
  kind: 'choice' | 'estimate';
  prompt: string;
  time_limit_ms: number;
  /** What was left on the server's clock when this response was built. */
  remaining_ms: number;
  choices?: string[];
  unit?: string;
}

export interface QuizPlayResponse {
  question: QuizQuestion | null;
  done: boolean;
  attempt: QuizAttemptSummary | null;
  /** Only on answer responses. */
  accepted?: boolean;
  timed_out?: boolean;
}

export interface QuizReviewQuestion {
  id: number;
  order: number;
  category: QuizCategory;
  category_label: string;
  kind: 'choice' | 'estimate';
  prompt: string;
  explanation: string;
  is_voided: boolean;
  unit: string;
  answered: number;
  correct: number;
  choices?: string[];
  correct_index?: number;
  my_choice_index?: number | null;
  distribution?: number[];
  correct_value?: number | string | null;
  my_value?: number | string | null;
  median_guess?: number | string | null;
  my_score: number | null;
  my_timed_out: boolean | null;
}

export interface QuizReview {
  date: string;
  attempt: QuizAttemptSummary | null;
  questions: QuizReviewQuestion[];
}

export interface QuizHistoryRow {
  date: string;
  total_score: number;
  finished: boolean;
}

/**
 * Thrown when a response is not shaped like the quiz API (a backend without
 * the quiz app, a proxy's stub): pages show their "yüklenemedi" state instead
 * of rendering half an object.
 */
export class QuizShapeError extends Error {
  constructor(what: string) {
    super(`${what} beklenen biçimde gelmedi.`);
    this.name = 'QuizShapeError';
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function shaped<T>(what: string, check: (data: Record<string, unknown>) => boolean) {
  return (data: unknown): T => {
    if (!isObject(data) || !check(data)) throw new QuizShapeError(what);
    return data as T;
  };
}

const asToday = shaped<QuizToday>(
  'Quiz durumu',
  (d) =>
    typeof d.status === 'string' && isObject(d.yesterday) && Array.isArray(d.yesterday.winners),
);
const asPlay = shaped<QuizPlayResponse>('Quiz sorusu', (d) => typeof d.done === 'boolean');
const asReview = shaped<QuizReview>('Quiz cevapları', (d) => Array.isArray(d.questions));
const asLeaderboard = shaped<Leaderboard>('Sıralama', (d) => Array.isArray(d.top));

export function getQuizToday(signal?: AbortSignal) {
  return apiFetch<unknown>('/quiz/today/', { signal }).then(asToday);
}

export function startQuiz() {
  return apiFetch<unknown>('/quiz/today/start/', { method: 'POST' }).then(asPlay);
}

export function nextQuizQuestion() {
  return apiFetch<unknown>('/quiz/today/next/', { method: 'POST' }).then(asPlay);
}

export function answerQuiz(questionId: number, answer: { choice: number } | { value: string }) {
  return apiFetch<unknown>('/quiz/today/answer/', {
    method: 'POST',
    body: { question_id: questionId, ...answer },
  }).then(asPlay);
}

export function getQuizReview(date: string, signal?: AbortSignal) {
  return apiFetch<unknown>(`/quiz/days/${encodeURIComponent(date)}/review/`, { signal }).then(
    asReview,
  );
}

export function getLeaderboard(period: LeaderboardPeriod, date?: string, signal?: AbortSignal) {
  return apiFetch<unknown>('/quiz/leaderboard/', { params: { period, date }, signal }).then(
    asLeaderboard,
  );
}

export function getQuizHistory(signal?: AbortSignal) {
  return apiFetch<{ results: QuizHistoryRow[] }>('/quiz/history/', { signal });
}

export function reportQuizQuestion(questionId: number, reason: string) {
  return apiFetch<{ created: boolean; voided: boolean }>(`/quiz/questions/${questionId}/report/`, {
    method: 'POST',
    body: { reason },
  });
}
