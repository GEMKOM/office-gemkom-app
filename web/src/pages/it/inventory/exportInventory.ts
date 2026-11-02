import { fetchItDevices, type ItDevice, type ItDevicesParams } from '@/api/it/inventory';
import { inventoryExportColumns } from './columns';

export type ExportFormat = 'csv' | 'excel';

/** Legacy file name: `it_envanter_<YYYY-MM-DD>`. */
function exportFileName() {
  return `it_envanter_${new Date().toISOString().split('T')[0]}`;
}

function csvCell(value: unknown): string {
  // Legacy wrapped every cell in quotes; doubling inner quotes keeps the file valid.
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/** Legacy exportToCSV: one quoted line per row, UTF-8 (BOM so Excel reads the Turkish letters). */
function downloadCsv(rows: ItDevice[], fileName: string) {
  const lines = [
    inventoryExportColumns.map((c) => csvCell(c.header)).join(','),
    ...rows.map((row) => inventoryExportColumns.map((c) => csvCell(c.exportValue?.(row))).join(',')),
  ];
  const blob = new Blob(['﻿', lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Port of legacy exportDevices: the current filters and sort, one request with
 * page_size 10000, always fresh from the server. Returns the row count; 0
 * writes nothing.
 */
export async function exportInventory(
  params: Omit<ItDevicesParams, 'page' | 'page_size'>,
  format: ExportFormat,
): Promise<number> {
  const { results } = await fetchItDevices({ ...params, page: 1, page_size: 10000 });
  if (results.length === 0) return 0;

  if (format === 'csv') {
    downloadCsv(results, exportFileName());
  } else {
    // SheetJS stays out of the page bundle until the first export.
    const { exportToExcel } = await import('@/ui/DataTable/exportExcel');
    await exportToExcel(results, inventoryExportColumns, { fileName: exportFileName(), sheetName: 'Sheet1' });
  }
  return results.length;
}
