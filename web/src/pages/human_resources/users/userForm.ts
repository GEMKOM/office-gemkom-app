// Shared bits of the employee forms and tabs (userList.js).

/** "Ad Soyad", else the username, else "#id". */
export function userDisplayName(user: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): string {
  return (
    `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || `#${user.id}`
  );
}

export const REQUIRED = 'Bu alan gereklidir';
// Same check as the legacy EditModal (email fields, only when filled in).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Legacy HR_USER_FIELD_HELP_TR: username and name rules. */
export const FIELD_HELP = {
  username:
    'Türkçe karakter kullanılmaz (ı, ğ, ü, ş, ö, ç, İ vb.). Ad ve soyadın arada boşluk olmadan, tamamı küçük harf birleşik yazımı kullanılır (örnek: Mehmet Ali → mehmetali).',
  first_name: 'Çalışanın gerçek adı: yalnızca ilk harf büyük, diğer harfler küçük (örnek: Mehmet).',
  last_name: 'Çalışanın gerçek soyadı: yalnızca ilk harf büyük, diğer harfler küçük (örnek: Ali).',
};

/** Today as YYYY-MM-DD (UTC, like legacy toISOString().split('T')[0]). */
export function todayIso(): string {
  return new Date().toISOString().split('T')[0]!;
}

export const LEAVE_TYPE_OPTIONS = [
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

export const LEAVE_TYPE_PAID = new Set([
  'annual_leave',
  'sick_leave',
  'maternity_leave',
  'paternity_leave',
  'bereavement_leave',
  'marriage_leave',
  'public_duty',
  'compensatory_leave',
  'business_trip',
  'half_day',
  'paid_leave',
]);

export function leaveTypeLabel(value: string | undefined): string | undefined {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === value)?.label;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO datetime -> local "HH:MM:SS" ('' when not a date). */
export function isoToLocalTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** "HH:MM[:SS]" on a YYYY-MM-DD day, local time -> ISO; null when either is missing or malformed. */
export function timeOnDateToIso(
  dateStr: string,
  timeStr: string | null | undefined,
): string | null {
  const d = (dateStr || '').trim();
  const t0 = (timeStr || '').trim();
  if (!d || !t0) return null;
  const t = /^\d{2}:\d{2}$/.test(t0) ? `${t0}:00` : t0;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) return null;
  const dt = new Date(`${d}T${t}`);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** "HH:MM" or "HH:MM:SS" -> "HH:MM:SS"; anything else ''. */
export function normalizeTime(value: string | null | undefined): string {
  const s = (value || '').trim();
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return '';
}
