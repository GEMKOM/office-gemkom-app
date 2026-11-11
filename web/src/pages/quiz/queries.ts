import { useQuery } from '@tanstack/react-query';
import { getLeaderboard, getQuizReview, getQuizToday, type LeaderboardPeriod } from '@/api/quiz';
import { isApiError } from '@/api/client';

export const quizKeys = {
  all: ['quiz'] as const,
  today: ['quiz', 'today'] as const,
  leaderboard: (period: LeaderboardPeriod, date?: string) =>
    ['quiz', 'leaderboard', period, date ?? ''] as const,
  review: (date: string) => ['quiz', 'review', date] as const,
  adminDays: ['quiz', 'admin', 'days'] as const,
};

// 403 (not an office user) and 404 (backend without the quiz yet) are answers,
// not failures worth retrying.
const retry = (count: number, error: unknown) =>
  !(isApiError(error) && (error.status === 403 || error.status === 404)) && count < 1;

export function useQuizToday(enabled = true) {
  return useQuery({
    queryKey: quizKeys.today,
    queryFn: ({ signal }) => getQuizToday(signal),
    enabled,
    staleTime: 60_000,
    retry,
  });
}

export function useLeaderboard(period: LeaderboardPeriod, date?: string) {
  return useQuery({
    queryKey: quizKeys.leaderboard(period, date),
    queryFn: ({ signal }) => getLeaderboard(period, date, signal),
    staleTime: 60_000,
    retry,
  });
}

export function useQuizReview(date: string | null) {
  return useQuery({
    queryKey: quizKeys.review(date ?? ''),
    queryFn: ({ signal }) => getQuizReview(date as string, signal),
    enabled: Boolean(date),
    staleTime: 5 * 60_000,
    retry,
  });
}
