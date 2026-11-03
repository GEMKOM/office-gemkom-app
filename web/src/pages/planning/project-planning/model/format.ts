// The sheet's number and date formats (identical to the legacy page's).

// Summing kg in floats leaves noise (…0.2999999999999545), which then lands in
// the weight input; every kg figure is rounded to 2 decimals.
export function round2(n: number | string | null | undefined): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function fmtKg(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('tr-TR');
}

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

export function fmtDuration(wd: number | string | null | undefined): string {
  if (wd === null || wd === undefined || wd === '') return '—';
  return `${Number(wd).toLocaleString('tr-TR')} g`;
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Turkish-aware lowering: 'İ' -> 'i', 'I' -> 'ı'. Plain toLowerCase maps 'İ'
// to 'i' + a combining dot, which never matches a typed 'i'.
export function trLower(s: string | null | undefined): string {
  return String(s || '').toLocaleLowerCase('tr');
}
