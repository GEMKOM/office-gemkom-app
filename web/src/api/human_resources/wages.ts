import { queryOptions } from '@tanstack/react-query';
import { apiFetch } from '../client';
import { extractResults } from '../types';

// The wage calls of apis/hr.js that the HR employees page uses.

export interface WageRate {
  id: number;
  user?: number;
  effective_from?: string | null;
  created_at?: string | null;
  currency?: string | null;
  /** Decimal strings. */
  base_monthly?: string | number | null;
  base_hourly?: string | number | null;
  [key: string]: unknown;
}

export const userWagesKey = (userId: number) => ['users', 'wages', String(userId)] as const;

/** Port of fetchWageRatesForUser. */
export function userWagesQueryOptions(userId: number) {
  return queryOptions({
    queryKey: userWagesKey(userId),
    queryFn: async ({ signal }) =>
      extractResults<WageRate>(await apiFetch<unknown>(`/users/${userId}/wages/`, { signal })),
    staleTime: 0,
  });
}

/** Port of createWageRate. `base_monthly` goes as a 4-decimal string, like legacy. */
export function createWageRate(data: {
  user: number;
  effective_from: string;
  base_monthly: string;
}): Promise<WageRate> {
  return apiFetch<WageRate>('/users/wages/', { method: 'POST', body: data });
}

export function deleteWageRate(id: number): Promise<void> {
  return apiFetch<void>(`/users/wages/${id}/`, { method: 'DELETE' });
}

/** Legacy hr.js formatCurrency: nothing or a non-positive amount reads '0,00 ₺'. */
export function formatWage(amount: number, currency = 'TRY'): string {
  if (!amount || amount <= 0) return '0,00 ₺';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
