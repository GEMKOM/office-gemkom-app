import type { StatusFamily } from '@/ui';

export const STATUS_META: Record<string, { label: string; color: StatusFamily }> = {
  pending: { label: 'Başlamadı', color: 'grey' },
  blocked: { label: 'Engellendi', color: 'grey' },
  in_progress: { label: 'Devam Ediyor', color: 'blue' },
  completed: { label: 'Tamamlandı', color: 'green' },
  on_hold: { label: 'Beklemede', color: 'orange' },
  cancelled: { label: 'İptal', color: 'grey' },
  skipped: { label: 'Atlandı', color: 'grey' },
};

export const EDITABLE_STATUS_OPTIONS = [
  'pending',
  'in_progress',
  'completed',
  'on_hold',
  'cancelled',
].map((s) => ({
  value: s,
  label: STATUS_META[s]?.label ?? s,
}));

// The page's view preferences, under the legacy keys so they carry over.
export const STORAGE_KEYS = {
  columns: 'imalatPlanlama.columns',
  zoom: 'imalatPlanlama.zoom',
  zoomScale: 'imalatPlanlama.zoomScale',
  gridWidth: 'imalatPlanlama.gridWidth',
  sort: 'imalatPlanlama.sort',
  scope: 'imalatPlanlama.scope',
  capacityMonths: 'imalatPlanlama.capacityMonths',
  capacityDifficulty: 'imalatPlanlama.capacityDifficulty',
} as const;

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the preference just does not stick */
  }
}
