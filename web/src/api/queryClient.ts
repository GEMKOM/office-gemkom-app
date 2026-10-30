import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './client';

export const DEFAULT_STALE_TIME = 30_000;

/** Retry once for network errors and 5xx; a 4xx won't change on retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return true;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        refetchOnWindowFocus: false,
        staleTime: DEFAULT_STALE_TIME,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
