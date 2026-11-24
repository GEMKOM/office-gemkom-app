import { columnValue } from './sorting';
import type { DataTableColumn } from './types';

// Same Excel formats as legacy table.js, so exported numbers stay summable.
const FORMATS = {
  number: '#,##0.00',
  integer: '#,##0',
  date: 'dd.mm.yyyy',
};

type Cell = string | number | null;

function headerText<T>(column: DataTableColumn<T>): string {
  if (column.exportHeader) return column.exportHeader;
  if (typeof column.header === 'string' || typeof column.header === 'number') return String(column.header);
  return column.key;
}

/** Excel serial for the local day of a Date. */
function excelDateSerial(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return (utc - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function exportCell<T>(column: DataTableColumn<T>, row: T): { value: Cell; format?: string } {
  const value = column.exportValue ? column.exportValue(row) : columnValue(column, row);
  if (value === null || value === undefined) return { value: '' };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { value: '' };
    return {
      value,
      format: column.exportFormat ?? (Number.isInteger(value) ? FORMATS.integer : FORMATS.number),
    };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { value: '' };
    return { value: excelDateSerial(value), format: column.exportFormat ?? FORMATS.date };
  }
  if (typeof value === 'boolean') return { value: value ? 'Evet' : 'Hayır' };
  if (Array.isArray(value)) return { value: value.join(', ') };
  if (typeof value === 'object') return { value: JSON.stringify(value) };
  return { value: String(value) };
}

/**
 * Writes rows to an .xlsx download. SheetJS is loaded only here, on the
 * first export, so it stays out of the page bundle.
 */
export async function exportToExcel<T>(
  rows: readonly T[],
  columns: readonly DataTableColumn<T>[],
  { fileName, sheetName = 'Sheet1' }: { fileName: string; sheetName?: string },
): Promise<void> {
  const XLSX = await import('xlsx');
  const exported = columns.filter((column) => !column.hidden && column.exportable !== false);

  const header: Cell[] = exported.map(headerText);
  const formats: (string | undefined)[][] = [];
  const body: Cell[][] = rows.map((row) => {
    const rowFormats: (string | undefined)[] = [];
    const cells = exported.map((column) => {
      const { value, format } = exportCell(column, row);
      rowFormats.push(format);
      return value;
    });
    formats.push(rowFormats);
    return cells;
  });
  const aoa = [header, ...body];

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const widths = header.map((h) => String(h ?? '').length);
  aoa.forEach((cells, r) => {
    cells.forEach((value, c) => {
      const format = r > 0 ? formats[r - 1]?.[c] : undefined;
      const cell = sheet[XLSX.utils.encode_cell({ r, c })] as { t?: string; z?: string } | undefined;
      if (cell && cell.t === 'n' && format) cell.z = format;
      const len =
        typeof value === 'number'
          ? format === FORMATS.date
            ? 10
            : Math.abs(value).toFixed(2).length + 4
          : String(value ?? '').length;
      widths[c] = Math.max(widths[c] ?? 0, len);
    });
  });
  sheet['!cols'] = widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 8), 60) }));
  if (header.length > 0) {
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: header.length - 1 } }),
    };
  }

  const book = XLSX.utils.book_new();
  // Sheet names are limited to 31 characters and some symbols.
  XLSX.utils.book_append_sheet(book, sheet, sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const name = fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(book, name);
}
