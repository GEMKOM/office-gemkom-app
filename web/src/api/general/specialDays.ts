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

export type DesignLayout = 'celebration' | 'flag' | 'solemn' | 'split';

/**
 * A day's look: one welcome template, these settings per day. `tone` is the
 * background and band, `ink` the text, `paper` the split layout's right
 * panel; `font` is for the title only.
 */
export interface OccasionDesign {
  layout: DesignLayout;
  tone: string;
  ink: string;
  accent: string;
  /** The motif accent inside the round ink badge; '' = the tone. */
  accent_on_ink: string;
  paper: string;
  font: string;
  motif: string;
  /** '' or a placeholder such as '{years}'. */
  numeral: string;
  cta: string;
}

/** before: the last working day before a day off; return: the first one after. */
export type OccasionPhase = 'before' | 'on' | 'return';
export type ShowOn = 'before' | 'day' | 'both';

export interface Occasion {
  /** Stable for the occasion in one year (a three-day bayram shares one); return is `<key>:return`. */
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
  // Per-day designs (the backend's design contract). Optional so an older
  // backend still works: the welcome then derives a design from `theme`.
  phase?: OccasionPhase;
  date?: string;
  end_date?: string;
  display_date?: string;
  kicker?: string;
  note?: string;
  numeral?: string;
  design?: OccasionDesign;
  color_band?: boolean;
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

/* ------------------------------------------------------------------------ */
/* HR editing: greeting templates and company special days.                 */
/*                                                                          */
/*   GET    /special-days/templates/          birthday, work_anniversary,   */
/*                                            public_holiday                */
/*   PATCH  /special-days/templates/<kind>/                                 */
/*   GET    /special-days/days/?is_active=    not paginated                 */
/*   POST   /special-days/days/                                             */
/*   PATCH  /special-days/days/<id>/                                        */
/*   DELETE /special-days/days/<id>/                                        */
/*                                                                          */
/* Everyone may read; writes need is_staff, a superuser or manage_hr.       */
/* ------------------------------------------------------------------------ */

export type TemplateKind = 'birthday' | 'work_anniversary' | 'public_holiday';

export interface CelebrationTemplate {
  kind: TemplateKind;
  kind_label: string;
  title: string;
  body: string;
  show_popup: boolean;
  updated_by: number | null;
  updated_at: string | null;
  design?: OccasionDesign;
  note?: string;
  color_band?: boolean;
  show_on?: ShowOn;
}

export type CelebrationTemplateInput = Partial<
  Pick<
    CelebrationTemplate,
    'title' | 'body' | 'show_popup' | 'design' | 'note' | 'color_band' | 'show_on'
  >
>;

export type SpecialDayCategory =
  'company' | 'national' | 'religious' | 'international' | 'commemoration';

export type Recurrence =
  'yearly' | 'once' | 'nth_weekday' | 'week' | 'hijri' | 'kandil' | 'holiday' | 'founding';

export interface SpecialDay {
  id: number;
  name: string;
  category: SpecialDayCategory;
  /** A yearly day has month + day and no date; a one-off has only a date. */
  month: number | null;
  day: number | null;
  date: string | null;
  theme: OccasionTheme;
  popup_title: string;
  popup_body: string;
  show_popup: boolean;
  is_active: boolean;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Per-day designs. Optional until the backend has them everywhere.
  slug?: string | null;
  recurrence?: Recurrence;
  weekday?: number | null;
  nth?: number | null;
  span_days?: number | null;
  hijri_month?: number | null;
  hijri_day?: number | null;
  holiday_key?: string | null;
  since_year?: number | null;
  show_on?: ShowOn;
  color_band?: boolean;
  keep_theme_during?: boolean;
  popup_note?: string;
  before_title?: string;
  before_body?: string;
  before_note?: string;
  return_enabled?: boolean;
  return_title?: string;
  return_body?: string;
  design?: OccasionDesign;
  /** The seeded (or category) values "Varsayılana Dön" restores. */
  defaults?: SpecialDayDefaults;
}

export interface SpecialDayDefaults {
  design: OccasionDesign;
  popup_title: string;
  popup_body: string;
  popup_note: string;
  before_title: string;
  before_body: string;
  before_note: string;
  return_title: string;
  return_body: string;
  show_on: ShowOn;
  color_band: boolean;
  keep_theme_during: boolean;
  show_popup: boolean;
  return_enabled: boolean;
}

export type SpecialDayInput = Partial<
  Pick<
    SpecialDay,
    | 'name'
    | 'category'
    | 'month'
    | 'day'
    | 'date'
    | 'theme'
    | 'popup_title'
    | 'popup_body'
    | 'show_popup'
    | 'is_active'
    | 'show_on'
    | 'color_band'
    | 'keep_theme_during'
    | 'popup_note'
    | 'before_title'
    | 'before_body'
    | 'before_note'
    | 'return_enabled'
    | 'return_title'
    | 'return_body'
    | 'design'
  >
>;

export const specialDayEditKeys = {
  templates: [...specialDayKeys.all, 'templates'] as const,
  days: (active: boolean | null) => [...specialDayKeys.all, 'days', active ?? 'all'] as const,
};

export async function fetchCelebrationTemplates(
  signal?: AbortSignal,
): Promise<CelebrationTemplate[]> {
  const data = await apiFetch<unknown>('/special-days/templates/', { signal });
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return list<CelebrationTemplate>(Array.isArray(data) ? data : body.results);
}

export function updateCelebrationTemplate(kind: TemplateKind, input: CelebrationTemplateInput) {
  return apiFetch<CelebrationTemplate>(`/special-days/templates/${kind}/`, {
    method: 'PATCH',
    body: input,
  });
}

export async function fetchCompanyDays(
  active: boolean | null = null,
  signal?: AbortSignal,
): Promise<SpecialDay[]> {
  const data = await apiFetch<unknown>('/special-days/days/', {
    params: active === null ? undefined : { is_active: active ? 'true' : 'false' },
    signal,
  });
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return list<SpecialDay>(Array.isArray(data) ? data : body.results);
}

export function createSpecialDay(input: SpecialDayInput) {
  return apiFetch<SpecialDay>('/special-days/days/', { method: 'POST', body: input });
}

export function updateSpecialDay(id: number, input: SpecialDayInput) {
  return apiFetch<SpecialDay>(`/special-days/days/${id}/`, { method: 'PATCH', body: input });
}

export function deleteSpecialDay(id: number) {
  return apiFetch<void>(`/special-days/days/${id}/`, { method: 'DELETE' });
}

export function useCelebrationTemplates() {
  return useQuery({
    queryKey: specialDayEditKeys.templates,
    queryFn: ({ signal }) => fetchCelebrationTemplates(signal),
  });
}

/** Company days; `active` null lists them all. */
export function useCompanyDays(active: boolean | null = null) {
  return useQuery({
    queryKey: specialDayEditKeys.days(active),
    queryFn: ({ signal }) => fetchCompanyDays(active, signal),
  });
}

// A text or day change shows up in today/ and upcoming/ too, so every
// special-days query refetches.

export function useUpdateCelebrationTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, input }: { kind: TemplateKind; input: CelebrationTemplateInput }) =>
      updateCelebrationTemplate(kind, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: specialDayKeys.all }),
  });
}

export function useSaveSpecialDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | null; input: SpecialDayInput }) =>
      id === null ? createSpecialDay(input) : updateSpecialDay(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: specialDayKeys.all }),
  });
}

export function useDeleteSpecialDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecialDay,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: specialDayKeys.all }),
  });
}

/* GET /special-days/calendar/?year=  every public holiday and active special
   day in the year, by date; holidays are merged per occasion key. No people. */

export interface CalendarDay {
  date: string;
  end_date: string;
  kind: 'public_holiday' | 'special_day';
  theme: OccasionTheme;
  name: string;
  key: string;
  is_half_day?: boolean;
  /** Special days only. */
  category?: SpecialDayCategory;
  id?: number;
  // Per-day designs.
  slug?: string | null;
  /** The last working day before the time off (after commemoration clashes). */
  before_date?: string;
  /** When the welcome shows, per the saved show_on. */
  display_date?: string;
  return_date?: string | null;
  design?: OccasionDesign;
  show_on?: ShowOn;
  is_active?: boolean;
  /** Kandil rows: the night's name ("Kadir Gecesi"). */
  kicker?: string;
}

export const specialDayCalendarKey = (year: number) =>
  [...specialDayKeys.all, 'calendar', year] as const;

export async function fetchSpecialDayCalendar(
  year: number,
  signal?: AbortSignal,
): Promise<CalendarDay[]> {
  const data = await apiFetch<unknown>('/special-days/calendar/', { params: { year }, signal });
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return list<CalendarDay>(Array.isArray(data) ? data : body.results);
}

export function useSpecialDayCalendar(year: number) {
  return useQuery({
    queryKey: specialDayCalendarKey(year),
    queryFn: ({ signal }) => fetchSpecialDayCalendar(year, signal),
    staleTime: 10 * 60_000,
  });
}

/* Company-wide settings: GEMKOM turns arife half days into full days off;
   founded_on turns on the founding anniversary. */

export interface SpecialDaySettings {
  arife_is_holiday: boolean;
  founded_on: string | null;
}

export const specialDaySettingsKey = [...specialDayKeys.all, 'settings'] as const;

export function fetchSpecialDaySettings(signal?: AbortSignal) {
  return apiFetch<SpecialDaySettings>('/special-days/settings/', { signal });
}

export function updateSpecialDaySettings(input: Partial<SpecialDaySettings>) {
  return apiFetch<SpecialDaySettings>('/special-days/settings/', { method: 'PATCH', body: input });
}

export function useSpecialDaySettings() {
  return useQuery({
    queryKey: specialDaySettingsKey,
    queryFn: ({ signal }) => fetchSpecialDaySettings(signal),
  });
}

export function useUpdateSpecialDaySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSpecialDaySettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: specialDayKeys.all }),
  });
}
