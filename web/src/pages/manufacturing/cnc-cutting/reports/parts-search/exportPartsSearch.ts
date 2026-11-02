import type { CncPartSearchRow } from '@/api/manufacturing/cncParts';
import type { DataTableColumn } from '@/ui';
import { plateSourceText } from './plateSource';

/** "dd.mm.yyyy hh:mm", as legacy formatDateForExport. */
function exportDate(timestamp: unknown): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp as string | number);
  if (Number.isNaN(date.getTime())) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const orDash = (value: unknown) =>
  value === null || value === undefined || value === '' ? '-' : value;

// The legacy export's columns, including Durum which the table doesn't show.
const exportColumns: DataTableColumn<CncPartSearchRow>[] = [
  { key: 'id', header: 'ID', exportValue: (r) => orDash(r.id) },
  { key: 'job_no', header: 'İş No', exportValue: (r) => orDash(r.job_no) },
  { key: 'image_no', header: 'Resim No', exportValue: (r) => orDash(r.image_no) },
  { key: 'position_no', header: 'Pozisyon No', exportValue: (r) => orDash(r.position_no) },
  {
    key: 'weight_kg',
    header: 'Ağırlık (kg)',
    exportValue: (r) => (r.weight_kg ? Number(r.weight_kg) : '-'),
    exportFormat: '0.000',
  },
  { key: 'quantity', header: 'Adet', exportValue: (r) => (r.quantity ? Number(r.quantity) : '-') },
  { key: 'nesting_id', header: 'Nesting ID', exportValue: (r) => orDash(r.nesting_id) },
  { key: 'plate_source', header: 'Plaka Kaynağı', exportValue: plateSourceText },
  {
    key: 'planned_start_ms',
    header: 'Planlanan Başlangıç',
    exportValue: (r) => exportDate(r.planned_start_ms),
  },
  {
    key: 'planned_end_ms',
    header: 'Planlanan Bitiş',
    exportValue: (r) => exportDate(r.planned_end_ms),
  },
  {
    key: 'completion_date',
    header: 'Tamamlanma Tarihi',
    exportValue: (r) => exportDate(r.completion_date),
  },
  {
    key: 'status',
    header: 'Durum',
    exportValue: (r) => (r.completion_date ? 'Tamamlandı' : 'Devam Ediyor'),
  },
];

/**
 * Port of handleExport in partsSearch.js: the rows on screen to
 * `cnc_parca_arama_<YYYY-MM-DD>`. Legacy wrote a CSV; this writes the .xlsx
 * the other ported pages use.
 */
export async function exportPartsSearch(rows: readonly CncPartSearchRow[]): Promise<void> {
  const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
  await exportToExcel(rows, exportColumns, {
    fileName: `cnc_parca_arama_${new Date().toISOString().split('T')[0]}`,
    sheetName: 'CNC Parça Arama',
  });
}
