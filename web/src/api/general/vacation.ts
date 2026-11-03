import { keepPreviousData, queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError, type QueryParams } from '../client';
import { toPaginated } from '../types';
import { pendingApprovalCountQueryOptions } from './approvals';

// Port of apis/vacationRequests.js, as far as the vacation pages (my
// requests, pending approvals) use it; plus the PDKS monthly summary from
// apis/human_resources/attendance.js that the requests page's calendar shows.

export const LEAVE_TYPES = [
  { value: 'annual_leave', label: 'Yıllık İzin' },
  { value: 'compensatory_leave', label: 'Mazeret İzni' },
  { value: 'sick_leave', label: 'Hastalık İzni' },
  { value: 'maternity_leave', label: 'Doğum İzni' },
  { value: 'paternity_leave', label: 'Babalık İzni' },
  { value: 'bereavement_leave', label: 'Ölüm İzni' },
  { value: 'marriage_leave', label: 'Evlilik İzni' },
  { value: 'public_duty', label: 'Resmi Görev' },
  { value: 'business_trip', label: 'Görev Seyahati' },
  { value: 'paid_leave', label: 'Ücretli İzin' },
  { value: 'unpaid_leave', label: 'Ücretsiz İzin' },
] as const;

const LEAVE_TYPE_LABELS = new Map<string, string>(LEAVE_TYPES.map((t) => [t.value, t.label]));

export function leaveTypeLabel(
  request: Pick<VacationRequest, 'leave_type' | 'leave_type_label'>,
): string {
  return (
    request.leave_type_label ||
    LEAVE_TYPE_LABELS.get(request.leave_type ?? '') ||
    request.leave_type ||
    '-'
  );
}

/** Hours between start_time and end_time ("HH:MM[:SS]"), or null if either is missing. */
export function leaveHours(request: {
  start_time?: string | null;
  end_time?: string | null;
}): number | null {
  const toMinutes = (value: string | null | undefined) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = toMinutes(request.start_time);
  const end = toMinutes(request.end_time);
  return start === null || end === null || end <= start ? null : (end - start) / 60;
}

/** "3 saat", "1,5 saat" for an hourly leave (mazeret izni); else "N gün". */
export function leaveDurationLabel(request: {
  leave_type?: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_days?: number | string | null;
}): string {
  const hours =
    request.leave_type === 'compensatory_leave' || request.start_time ? leaveHours(request) : null;
  if (hours !== null) {
    return `${String(Math.round(hours * 100) / 100).replace('.', ',')} saat`;
  }
  return `${request.duration_days || 0} gün`;
}

export interface ApprovalDecision {
  decision?: 'approve' | 'reject' | string;
  decided_at?: string | null;
  comment?: string | null;
  approver_detail?: { full_name?: string; username?: string } | null;
}

export interface ApprovalStage {
  name?: string;
  order?: number;
  is_complete?: boolean;
  is_rejected?: boolean;
  required_approvals?: number;
  approved_count?: number;
  decisions?: ApprovalDecision[];
}

export interface VacationRequest {
  id: number;
  leave_type?: string;
  leave_type_label?: string;
  status?: string;
  status_label?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string | null;
  end_time?: string | null;
  duration_days?: number | string | null;
  reason?: string | null;
  created_at?: string;
  requester_username?: string;
  approval?: { stage_instances?: ApprovalStage[] } | null;
  [key: string]: unknown;
}

export interface VacationRequestInput {
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  start_time?: string;
  end_time?: string;
}

export interface VacationPreview {
  start_date?: string;
  end_date?: string;
  duration_days?: number | string;
  excluded?: { date?: string; reason?: string; name?: string | null }[];
}

export interface MyVacationSummary {
  annual_leave?: {
    remaining_days?: number | string;
    used_days?: number | string;
    last_credited?: string | null;
  };
  years_of_service?: number | string;
  hire_date?: string | null;
}

export interface UpcomingLeave {
  full_name?: string;
  start_date?: string;
  end_date?: string;
}

export interface UpcomingLeaves {
  results: UpcomingLeave[];
  from_date: string | null;
  to_date: string | null;
}

export interface AttendanceDay {
  date: string;
  day_type?: string;
  holiday_name?: string | null;
  is_half_day_holiday?: boolean;
  flag?: string | null;
  record?: {
    status?: string;
    leave_type?: string;
    notes?: string | null;
    first_check_in?: string | null;
    last_check_out?: string | null;
    total_present_minutes?: number;
    overtime_minutes?: number;
    late_minutes?: number;
    early_leave_minutes?: number;
  } | null;
}

export interface AttendanceMonthlySummary {
  user_id?: number;
  user_display?: string;
  summary?: Record<string, number | string | null | undefined>;
  days?: AttendanceDay[];
}

/**
 * The message legacy parseJsonOrThrow showed for a failed call: detail,
 * message, error, non_field_errors, then the first field's errors joined;
 * else the call's fallback.
 */
export function vacationErrorMessage(error: unknown, fallback: string): string {
  if (!isApiError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  const data = error.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const body = data as Record<string, unknown>;
    for (const key of ['detail', 'message', 'error']) {
      if (typeof body[key] === 'string' && body[key]) return body[key];
    }
    if (Array.isArray(body.non_field_errors) && body.non_field_errors.length) {
      return body.non_field_errors.join(' ');
    }
    const firstArray = Object.values(body).find((v) => Array.isArray(v) && v.length > 0) as
      unknown[] | undefined;
    if (firstArray) return firstArray.join(' ');
  }
  return fallback;
}

/** Wraps a call so a failure carries the legacy message. */
async function withMessage<T>(fallback: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error(vacationErrorMessage(error, fallback), { cause: error });
  }
}

const BASE = '/vacation-requests';

const keys = {
  all: ['vacationRequests'] as const,
  list: (params: QueryParams) => ['vacationRequests', 'list', params] as const,
  detail: (id: number | string) => ['vacationRequests', 'detail', String(id)] as const,
  pending: () => ['vacationRequests', 'pendingApproval'] as const,
  decisions: () => ['vacationRequests', 'decisionByMe'] as const,
  preview: (start: string, end: string) => ['vacationRequests', 'preview', start, end] as const,
  summary: () => ['vacationRequests', 'mySummary'] as const,
  upcoming: () => ['vacationRequests', 'upcomingLeaves'] as const,
  calendar: (year: number, month: number) =>
    ['attendance', 'monthlySummary', 'me', year, month] as const,
};
export const vacationKeys = keys;

export type VacationRequestsParams = {
  page?: number;
  page_size?: number;
  ordering?: string;
  mine?: 'true';
};

/** fetchVacationRequests */
export function vacationRequestsQueryOptions(params: VacationRequestsParams) {
  return queryOptions({
    queryKey: keys.list(params),
    queryFn: ({ signal }) =>
      withMessage('İzin talepleri yüklenemedi.', async () =>
        toPaginated<VacationRequest>(
          await apiFetch<unknown>(`${BASE}/requests/`, { params, signal }),
        ),
      ),
    placeholderData: keepPreviousData,
  });
}

/** fetchVacationRequest */
export function vacationRequestQueryOptions(id: number | string) {
  return queryOptions({
    queryKey: keys.detail(id),
    queryFn: ({ signal }) =>
      withMessage('İzin talebi detayı yüklenemedi.', () =>
        apiFetch<VacationRequest>(`${BASE}/requests/${id}/`, { signal }),
      ),
  });
}

/** fetchPendingVacationApprovalRequests, first page as legacy loaded it. */
export function pendingVacationApprovalsQueryOptions() {
  return queryOptions({
    queryKey: keys.pending(),
    queryFn: ({ signal }) =>
      withMessage('Bekleyen izin talepleri yüklenemedi.', async () =>
        toPaginated<VacationRequest>(
          await apiFetch<unknown>(`${BASE}/requests/pending_approval/`, { signal }),
        ),
      ),
  });
}

/** fetchVacationDecisionsByMe, first page as legacy loaded it. */
export function vacationDecisionsByMeQueryOptions() {
  return queryOptions({
    queryKey: keys.decisions(),
    queryFn: ({ signal }) =>
      withMessage('Kararlar yüklenemedi.', async () =>
        toPaginated<VacationRequest>(
          await apiFetch<unknown>(`${BASE}/requests/decision_by_me/`, { signal }),
        ),
      ),
  });
}

/** previewVacationDuration */
export function vacationPreviewQueryOptions(startDate: string, endDate: string) {
  return queryOptions({
    queryKey: keys.preview(startDate, endDate),
    queryFn: ({ signal }) =>
      withMessage('İzin önizlemesi alınamadı.', () =>
        apiFetch<VacationPreview>(`${BASE}/preview/`, {
          params: { start_date: startDate, end_date: endDate },
          signal,
        }),
      ),
    enabled: Boolean(startDate && endDate),
  });
}

/** fetchMyVacationSummary */
export function myVacationSummaryQueryOptions() {
  return queryOptions({
    queryKey: keys.summary(),
    queryFn: ({ signal }) =>
      withMessage('İzin özeti yüklenemedi.', async () => {
        const data = await apiFetch<unknown>(`${BASE}/my-summary/`, { signal });
        return (data && typeof data === 'object' ? data : {}) as MyVacationSummary;
      }),
  });
}

/** fetchUpcomingLeaves: a list, or an envelope with results and the date window. */
export function upcomingLeavesQueryOptions() {
  return queryOptions({
    queryKey: keys.upcoming(),
    queryFn: ({ signal }) =>
      withMessage('Yaklaşan izinler yüklenemedi.', async (): Promise<UpcomingLeaves> => {
        const data = await apiFetch<unknown>(`${BASE}/upcoming-leaves/`, { signal });
        if (Array.isArray(data))
          return { results: data as UpcomingLeave[], from_date: null, to_date: null };
        const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
        return {
          results: Array.isArray(body.results) ? (body.results as UpcomingLeave[]) : [],
          from_date: typeof body.from_date === 'string' ? body.from_date : null,
          to_date: typeof body.to_date === 'string' ? body.to_date : null,
        };
      }),
  });
}

/** fetchAttendanceMonthlySummary for the signed-in user (no user_id). */
export function myAttendanceMonthlyQueryOptions(year: number, month: number) {
  return queryOptions({
    queryKey: keys.calendar(year, month),
    queryFn: async ({ signal }) => {
      const data = await apiFetch<unknown>('/attendance/monthly-summary/', {
        params: { year, month },
        signal,
      });
      return (
        data && typeof data === 'object' && !Array.isArray(data) ? data : {}
      ) as AttendanceMonthlySummary;
    },
  });
}

/** Everything a create or cancel changes on the requests page. */
function invalidateMine(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.all }),
    queryClient.invalidateQueries({ queryKey: ['attendance', 'monthlySummary'] }),
    queryClient.invalidateQueries({
      queryKey: pendingApprovalCountQueryOptions('vacation').queryKey,
    }),
  ]);
}

/** createVacationRequest */
export function useCreateVacationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VacationRequestInput) =>
      withMessage('İzin talebi oluşturulamadı.', () =>
        apiFetch<VacationRequest>(`${BASE}/requests/`, { method: 'POST', body: data }),
      ),
    onSuccess: () => invalidateMine(queryClient),
  });
}

/**
 * cancelVacationRequest for a submitted request, requestVacationCancellation
 * (sent to HR) for an approved one.
 */
export function useCancelVacationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approved }: { id: number; approved: boolean }) =>
      approved
        ? withMessage('İptal talebi gönderilemedi.', () =>
            apiFetch<unknown>(`${BASE}/requests/${id}/request-cancellation/`, {
              method: 'POST',
              body: {},
            }),
          )
        : withMessage('İzin talebi iptal edilemedi.', () =>
            apiFetch<unknown>(`${BASE}/requests/${id}/cancel/`, { method: 'POST' }),
          ),
    onSuccess: () => invalidateMine(queryClient),
  });
}

/** approveVacationRequest / rejectVacationRequest */
export function useDecideVacationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
      comment = '',
    }: {
      id: number;
      decision: 'approve' | 'reject';
      comment?: string;
    }) =>
      withMessage(
        decision === 'approve' ? 'Onaylama işlemi başarısız.' : 'Reddetme işlemi başarısız.',
        () =>
          apiFetch<unknown>(`${BASE}/requests/${id}/${decision}/`, {
            method: 'POST',
            body: { comment },
          }),
      ),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.all }),
        queryClient.invalidateQueries({
          queryKey: pendingApprovalCountQueryOptions('vacation').queryKey,
        }),
      ]),
  });
}
