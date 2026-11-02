// Plan dates come from the server-side machine plan (read-only on these pages).

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-09-30" -> "30.09.2026" (string split; no timezone drift through Date). */
export function formatIsoDate(isoDate: unknown): string {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

/** epoch ms -> "18.09.2026 08:00" (withYear) or "18.09 08:00". */
export function formatPlanStamp(ms: number | null | undefined, withYear = false): string {
  if (!ms) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  const dayMonth = `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withYear ? `${dayMonth}.${date.getFullYear()} ${time}` : `${dayMonth} ${time}`;
}

/** A Date as a datetime-local input value (YYYY-MM-DDTHH:mm). */
export function toDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
