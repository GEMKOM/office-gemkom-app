import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, isApiError } from '@/api/client';

// PDKS (check-in / check-out), the same endpoints and states as the legacy
// navbar's attendance dropdown (components/navbar.js).

interface AttendanceSession {
  check_in_time?: string | null;
  check_out_time?: string | null;
}

export interface AttendanceToday {
  status?: string;
  status_display?: string | null;
  first_check_in?: string | null;
  last_check_out?: string | null;
  sessions?: AttendanceSession[];
}

export type AttendanceState =
  | 'not_checked_in'
  | 'active'
  | 'complete'
  | 'pending_override'
  | 'pending_checkout_override'
  | 'override_rejected'
  | 'unknown';

/** Status family: picks the pill colours and the rail dot. */
export type AttendanceTone = 'grey' | 'green' | 'blue' | 'yellow' | 'red';

export interface AttendanceModel {
  state: AttendanceState;
  /** The status pill: the backend's own wording when it sends one. */
  label: string;
  tone: AttendanceTone;
  /** Short text for the expanded rail row and the tooltip. */
  short: string;
  checkIn: string | null;
  checkOut: string | null;
}

export function formatClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

const NOT_CHECKED_IN: AttendanceModel = {
  state: 'not_checked_in',
  label: 'Giriş yapılmadı',
  tone: 'grey',
  short: 'Giriş yapılmadı',
  checkIn: null,
  checkOut: null,
};

/**
 * Today's record as the UI shows it. No record (404, or an empty 200) means
 * not checked in yet.
 */
export function attendanceModel(data: AttendanceToday | null | undefined): AttendanceModel {
  if (data == null || typeof data !== 'object' || Object.keys(data).length === 0) return NOT_CHECKED_IN;

  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const checkIn = formatClock(data.first_check_in ?? sessions[0]?.check_in_time);
  const checkOut = formatClock(data.last_check_out ?? sessions.at(-1)?.check_out_time);
  const display = data.status_display || null;
  const base = { checkIn, checkOut };

  switch (data.status) {
    case 'active':
      return { ...base, state: 'active', tone: 'green', label: display || 'Aktif (Giriş Yapıldı)', short: checkIn ? `Giriş ${checkIn}` : 'Giriş yapıldı' };
    case 'complete':
      return { ...base, state: 'complete', tone: 'blue', label: display || 'Tamamlandı (Çıkış Yapıldı)', short: checkOut ? `Çıkış ${checkOut}` : 'Tamamlandı' };
    case 'pending_override':
      return { ...base, state: 'pending_override', tone: 'yellow', label: display || 'İnsan Kaynakları Onayı Bekliyor (GİRİŞ)', short: 'Onay bekliyor' };
    case 'pending_checkout_override':
      return { ...base, state: 'pending_checkout_override', tone: 'yellow', label: display || 'İnsan Kaynakları Onayı Bekliyor (ÇIKIŞ)', short: 'Onay bekliyor' };
    case 'override_rejected':
      return { ...base, state: 'override_rejected', tone: 'red', label: display || 'Reddedildi', short: 'Reddedildi' };
    default:
      return { ...base, state: 'unknown', tone: 'grey', label: display || String(data.status ?? 'Bilinmiyor'), short: display || '-' };
  }
}

/** Off the office network the backend refuses and asks for a reason instead. */
export function isOffNetwork(error: unknown): boolean {
  if (!isApiError(error) || (error.status !== 403 && error.status !== 404)) return false;
  const data = error.data as { reason?: unknown } | null;
  return data?.reason === 'not_on_office_network';
}

const todayKey = ['attendance', 'today'] as const;

export function useAttendanceToday() {
  return useQuery({
    queryKey: todayKey,
    queryFn: async ({ signal }) => {
      try {
        return attendanceModel(await apiFetch<AttendanceToday | null>('/attendance/today/', { signal }));
      } catch (error) {
        if (isApiError(error) && error.status === 404) return NOT_CHECKED_IN;
        throw error;
      }
    },
    staleTime: 60_000,
  });
}

export type AttendanceAction = 'check-in' | 'check-out';

export function useAttendanceAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, reason }: { action: AttendanceAction; reason?: string }) =>
      apiFetch(`/attendance/${action}/`, { method: 'POST', body: reason ? { override_reason: reason } : {} }),
    onSettled: () => client.invalidateQueries({ queryKey: todayKey }),
  });
}
