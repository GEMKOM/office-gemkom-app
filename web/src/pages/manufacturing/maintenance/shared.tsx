import { StatusBadge } from '@/ui';

// Helpers the maintenance pages shared by copy in legacy (formatDuration,
// TR_MONTHS, typeBadge in list.js, faults.js, monthlyMetrics.js, staffReport.js).

export const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

/** Legacy formatDuration: seconds as "2g 3s 15d" (gün, saat, dakika); 0 → "0d". */
export function formatDuration(totalSeconds: unknown): string {
  const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}g`);
  if (h) parts.push(`${h}s`);
  if (m || parts.length === 0) parts.push(`${m}d`);
  return parts.join(' ');
}

/** "2026-03" → "Mart 2026"; '-' when empty. */
export function periodLabel(period: string | null | undefined): string {
  if (!period) return '-';
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${TR_MONTHS[(m - 1) % 12]} ${y}`;
}

/** A local day as YYYY-MM-DD (what the API's date params take). */
export function localDay(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface FaultKind {
  is_breaking?: boolean;
  is_maintenance?: boolean;
}

/** Legacy getTypeBadge / typeBadge text: Duruş, Bakım or Arıza. */
export function faultTypeLabel(fault: FaultKind): string {
  if (fault.is_breaking) return 'Duruş';
  if (fault.is_maintenance) return 'Bakım';
  return 'Arıza';
}

export function FaultTypeBadge({ fault }: { fault: FaultKind }) {
  const color = fault.is_breaking ? 'red' : fault.is_maintenance ? 'yellow' : 'grey';
  return <StatusBadge color={color}>{faultTypeLabel(fault)}</StatusBadge>;
}

/** Legacy table.js export name: `<containerId>_<YYYY-MM-DD>`. */
export function legacyExportName(containerId = 'table-container'): string {
  return `${containerId}_${new Date().toISOString().split('T')[0]}`;
}
