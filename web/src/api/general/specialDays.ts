import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../client';

/**
 * Özel Günler: birthdays, work anniversaries, public holidays and company
 * special days (special_days on the backend).
 *
 *   GET  /special-days/today/       the signed-in user's occasions, colleagues
 *                                   with a day today, celebrations received
 *   GET  /special-days/upcoming/    the next N days
 *   POST /special-days/celebrate/   "Kutla": notifies the colleague
 *
 * Birthdays never carry a year or an age, and people who set
 * profile.hide_birthday are left out of every list but their own.
 */

export type OccasionTheme =
  'birthday' | 'anniversary' | 'national' | 'religious' | 'company' | 'soft';
export type OccasionKind = 'birthday' | 'work_anniversary' | 'public_holiday' | 'special_day';
export type PersonKind = 'birthday' | 'work_anniversary';

export interface Occasion {
  /** Stable for the occasion in one year (a three-day bayram shares one). */
  key: string;
  kind: OccasionKind;
  theme: OccasionTheme;
  name: string;
  title: string;
  body: string;
  show_popup: boolean;
  years: number | null;
  is_half_day: boolean;
  local_name?: string;
  category?: string;
}

export interface ColleagueOccasion {
  user_id: number;
  full_name: string;
  department_code: string | null;
  position_title: string | null;
  kind: PersonKind;
  years: number | null;
  celebrated_by_me: boolean;
  celebration_count: number;
}

export interface ReceivedCelebration {
  sender_id: number;
  sender_name: string;
  kind: PersonKind;
  message: string;
  created_at: string;
}

export interface SpecialDaysToday {
  date: string;
  occasions: Occasion[];
  colleagues: ColleagueOccasion[];
  received: ReceivedCelebration[];
}

export interface UpcomingDay {
  date: string;
  end_date: string;
  kind: OccasionKind;
  theme: OccasionTheme;
  name: string;
  key?: string;
  is_half_day?: boolean;
  user_id?: number;
  full_name?: string;
  department_code?: string | null;
  position_title?: string | null;
  years?: number | null;
}

export const specialDayKeys = {
  all: ['special-days'] as const,
  today: (date: string | null) => ['special-days', 'today', date ?? 'now'] as const,
  upcoming: (days: number, date: string | null) =>
    ['special-days', 'upcoming', days, date ?? 'now'] as const,
};

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** A partial or empty reply still gives a usable shape. */
export function normalizeToday(data: unknown): SpecialDaysToday {
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return {
    date: typeof body.date === 'string' ? body.date : '',
    occasions: list<Occasion>(body.occasions),
    colleagues: list<ColleagueOccasion>(body.colleagues),
    received: list<ReceivedCelebration>(body.received),
  };
}

export async function fetchSpecialDaysToday(
  date: string | null,
  signal?: AbortSignal,
): Promise<SpecialDaysToday> {
  const data = await apiFetch<unknown>('/special-days/today/', {
    params: date ? { date } : undefined,
    signal,
  });
  return normalizeToday(data);
}

export async function fetchUpcomingDays(
  days: number,
  date: string | null = null,
  signal?: AbortSignal,
): Promise<UpcomingDay[]> {
  const data = await apiFetch<unknown>('/special-days/upcoming/', {
    params: date ? { days, date } : { days },
    signal,
  });
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return list<UpcomingDay>(Array.isArray(data) ? data : body.results);
}

/**
 * Today's occasions. `previewDate` (HR only on the backend) shows another
 * day's theme. Refetched every half hour so a tab left open overnight moves
 * on to the new day, and so new celebrations show up.
 */
export function useSpecialDaysToday(previewDate: string | null = null, enabled = true) {
  return useQuery({
    queryKey: specialDayKeys.today(previewDate),
    queryFn: ({ signal }) => fetchSpecialDaysToday(previewDate, signal),
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    retry: 1,
    enabled,
  });
}

/** The next `days` days from today, or from `fromDate` (an HR preview). */
export function useUpcomingDays(days = 14, fromDate: string | null = null) {
  return useQuery({
    queryKey: specialDayKeys.upcoming(days, fromDate),
    queryFn: ({ signal }) => fetchUpcomingDays(days, fromDate, signal),
    staleTime: 30 * 60_000,
    retry: 1,
  });
}

export interface CelebrateInput {
  recipient: number;
  kind: PersonKind;
  message?: string;
}

export function celebrate(input: CelebrateInput) {
  return apiFetch<unknown>('/special-days/celebrate/', { method: 'POST', body: input });
}

export function useCelebrate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: celebrate,
    onSettled: () => queryClient.invalidateQueries({ queryKey: specialDayKeys.all }),
  });
}
