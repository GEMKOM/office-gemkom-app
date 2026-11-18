import type { CncPart, ProcessPart } from '@/api/manufacturing/cncTasks';
import { saveBlob } from '@/ui/files';

// The Mikro import file of Ağırlık Düşüşü, the same as blue-app's parts
// export: one row per part, no header, ";" between fields, CRLF, UTF-8 with a
// BOM. Columns: stok kodu (empty), "C", the kg to deduct (Turkish decimals,
// 2 places), empty, iş emri no, depo "2".

/** "1.234,56": Turkish thousands and decimal separators, always 2 decimals. */
export function turkishKg(value: number): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cell(value: string): string {
  return /[;,"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface DeductRow {
  job_no: string;
  deduct_kg: number;
}

export function mikroCsv(rows: readonly DeductRow[]): string {
  return rows
    .map((row) => ['', 'C', turkishKg(row.deduct_kg), '', row.job_no, '2'].map(cell).join(';'))
    .join('\r\n');
}

/** parts_export_YYYY-MM-DDTHH-MM-SS.csv (UTC), as blue-app named it. */
export function mikroCsvFileName(now = new Date()): string {
  return `parts_export_${now.toISOString().replace(/[:.]/g, '-').slice(0, -5)}.csv`;
}

export function downloadMikroCsv(rows: readonly DeductRow[]) {
  const blob = new Blob(['﻿' + mikroCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  saveBlob(blob, mikroCsvFileName());
}

/**
 * Per part of a processed cut: its kg over all sheets plus its share of the
 * stored fire (by weight); the backend's warehouse preview gives the same.
 */
export function partDeductions(
  parts: readonly CncPart[],
  sheets: number,
  fireKg: number | null,
): ProcessPart[] {
  // A part's weight_kg is its row's total (all its pieces), per sheet.
  const kgOf = (p: CncPart) => Number(p.weight_kg || 0) * sheets;
  const total = parts.reduce((sum, p) => sum + kgOf(p), 0);
  return parts.map((p) => {
    const kg = kgOf(p);
    const fire = fireKg !== null && total > 0 ? (fireKg * kg) / total : 0;
    return {
      id: p.id,
      job_no: p.job_no || '',
      image_no: p.image_no ?? null,
      position_no: p.position_no ?? null,
      weight_kg: p.weight_kg === null || p.weight_kg === undefined ? null : String(p.weight_kg),
      quantity: p.quantity ?? null,
      parts_kg: kg.toFixed(3),
      fire_kg: fire.toFixed(3),
      deduct_kg: (kg + fire).toFixed(3),
    };
  });
}

export function deductRows(parts: readonly ProcessPart[]): DeductRow[] {
  return parts.map((p) => ({ job_no: p.job_no, deduct_kg: Number(p.deduct_kg) }));
}
