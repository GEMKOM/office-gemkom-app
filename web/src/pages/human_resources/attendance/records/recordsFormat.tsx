import type {
  AttendanceHrRecord,
  AttendanceHrSession,
} from '@/api/human_resources/attendanceAdmin';
import { StatusBadge, type StatusFamily } from '@/ui';

// Labels and formatting of records.js.

export const RECORD_STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif (Giriş Yapıldı)' },
  { value: 'complete', label: 'Tamamlandı' },
  { value: 'pending_override', label: 'HR Onayı Bekliyor (Giriş)' },
  { value: 'pending_checkout_override', label: 'HR Onayı Bekliyor (Çıkış)' },
  { value: 'override_rejected', label: 'Reddedildi' },
  { value: 'leave', label: 'İzinli' },
];

/** The record modal's İzin Türü list (its own, with half_day and unauthorized_absence). */
export const RECORD_LEAVE_TYPE_OPTIONS = [
  { value: 'annual_leave', label: 'Yıllık İzin' },
  { value: 'sick_leave', label: 'Hastalık İzni' },
  { value: 'maternity_leave', label: 'Doğum İzni' },
  { value: 'paternity_leave', label: 'Babalık İzni' },
  { value: 'bereavement_leave', label: 'Ölüm İzni' },
  { value: 'marriage_leave', label: 'Evlilik İzni' },
  { value: 'public_duty', label: 'Resmi Görev' },
  { value: 'compensatory_leave', label: 'Mazeret İzni' },
  { value: 'business_trip', label: 'Görev Seyahati' },
  { value: 'half_day', label: 'Yarım Gün' },
  { value: 'paid_leave', label: 'Ücretli İzin' },
  { value: 'unpaid_leave', label: 'Ücretsiz İzin' },
  { value: 'unauthorized_absence', label: 'İzinsiz Devamsızlık' },
];

export const SESSION_METHOD_OPTIONS = [
  { value: 'ip', label: 'IP (Ofis Ağı)' },
  { value: 'gps', label: 'GPS' },
  { value: 'manual_override', label: 'Manuel Değişim Talebi' },
  { value: 'hr_manual', label: 'HR Değişikliği' },
];

export const SESSION_STATUS_OPTIONS = [
  { value: 'open', label: 'Açık' },
  { value: 'closed', label: 'Kapalı' },
  { value: 'pending_override', label: 'HR Onayı Bekliyor (Giriş)' },
  { value: 'pending_checkout_override', label: 'HR Onayı Bekliyor (Çıkış)' },
  { value: 'override_rejected', label: 'Reddedildi' },
];

const STATUS: Record<string, { color: StatusFamily; label: string }> = {
  pending_override: { color: 'yellow', label: 'HR Onayı Bekliyor (Giriş)' },
  pending_checkout_override: { color: 'yellow', label: 'HR Onayı Bekliyor (Çıkış)' },
  active: { color: 'blue', label: 'Aktif (Giriş Yapıldı)' },
  complete: { color: 'green', label: 'Tamamlandı' },
  override_rejected: { color: 'red', label: 'Reddedildi' },
  leave: { color: 'grey', label: 'İzinli' },
  // session statuses
  open: { color: 'blue', label: 'Açık' },
  closed: { color: 'green', label: 'Kapalı' },
};

/** Record and session statuses; the server's display text wins over the label. */
export function AttendanceStatusBadge({
  status,
  display,
}: {
  status: string | undefined;
  display?: string | null;
}) {
  const mapped = STATUS[status ?? ''] ?? { color: 'grey' as const, label: status || '-' };
  return <StatusBadge color={mapped.color}>{display || mapped.label}</StatusBadge>;
}

export function todayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** A bare date is a local day, not UTC midnight. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '-';
  const raw = String(value);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('tr-TR');
}

/** "08:30" from "08:30:00", or the local time of a timestamp. */
export function fmtTime(value: string | null | undefined): string {
  if (!value) return '-';
  const raw = String(value);
  const simple = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(raw);
  if (simple) return simple[1]!;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** A timestamp as a datetime-local input value (local time). */
export function toLocalDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesText(value: number | null | undefined): string {
  const mins = value ?? 0;
  return mins > 0 ? `${mins} dk` : '-';
}

export const firstSession = (record: AttendanceHrRecord): AttendanceHrSession | undefined =>
  record.sessions?.[0];
export const lastSession = (record: AttendanceHrRecord): AttendanceHrSession | undefined =>
  record.sessions?.[record.sessions.length - 1];
