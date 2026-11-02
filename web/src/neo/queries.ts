import { useQuery } from '@tanstack/react-query';
import {
  getAssistantQuota,
  isAccessDenied,
  listConversations,
  listDailySummaries,
  listMyReports,
} from '@/api/assistant';

export const neoKeys = {
  all: ['neo'] as const,
  quota: ['neo', 'quota'] as const,
  conversations: ['neo', 'conversations'] as const,
  reports: ['neo', 'reports'] as const,
  summaries: (days: number) => ['neo', 'summaries', days] as const,
  summary: (id: number) => ['neo', 'summary', id] as const,
};

/**
 * Quota, and with it whether Neo is open to this user: the backend answers
 * 403 when access is closed (the legacy widget's `__assistantLocked`). Asked
 * once the panel has been opened.
 */
export function useNeoAccess(enabled: boolean) {
  const query = useQuery({
    queryKey: neoKeys.quota,
    queryFn: ({ signal }) => getAssistantQuota(signal),
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !isAccessDenied(error) && count < 1,
  });
  return {
    quota: query.data,
    locked: isAccessDenied(query.error),
    // Other quota errors are cosmetic; the chat call enforces for real.
    ready: query.isSuccess || query.isError,
  };
}

export function useConversations(enabled: boolean) {
  return useQuery({
    queryKey: neoKeys.conversations,
    queryFn: ({ signal }) => listConversations(signal),
    enabled,
    staleTime: 0,
  });
}

export function useMyReports(enabled: boolean) {
  return useQuery({
    queryKey: neoKeys.reports,
    queryFn: ({ signal }) => listMyReports(signal),
    enabled,
    staleTime: 0,
  });
}

export function useDailySummaries(days: number, enabled: boolean) {
  return useQuery({
    queryKey: neoKeys.summaries(days),
    queryFn: ({ signal }) => listDailySummaries(days, signal),
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !isAccessDenied(error) && count < 1,
  });
}
