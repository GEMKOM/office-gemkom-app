import type {
  ProcurementLine,
  ProcurementLineInput,
  ProcurementLinePreview,
} from '@/api/planning/procurementLines';
import type { WorkBook } from 'xlsx';

// The line editor's model and the Excel price compare, ported function by
// function from procurement-lines.js (no DOM; the modal renders from these).

/** As-loaded values, so edits (manual or Excel-applied) can be reverted. */
export interface LineSnapshot {
  quantity: string;
  unit_price: string;
  item_description: string;
}

/** One row of the editor. quantity/unit_price stay strings, as the legacy inputs held them. */
export interface EditLine {
  /** Client-side row id (new rows have no server id). */
  key: string;
  id?: number;
  item: number | null;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_description: string;
  quantity: string;
  unit_price: string;
  planning_request_item: number | null;
  order: number;
  price_source: string | null;
  price_date: string | null;
  /** Lines added in the modal have no snapshot. */
  orig?: LineSnapshot;
}

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

const str = (value: unknown, fallback = '') =>
  value === null || value === undefined ? fallback : String(value);

export function emptyLine(order = 0): EditLine {
  return {
    key: nextKey(),
    item: null,
    item_code: '',
    item_name: '',
    item_unit: '',
    item_description: '',
    quantity: '0',
    unit_price: '0',
    planning_request_item: null,
    order,
    price_source: null,
    price_date: null,
  };
}

/** mapSavedProcurementLines */
export function fromSavedLines(lines: ProcurementLine[]): EditLine[] {
  return lines.map((line, idx) => ({
    key: nextKey(),
    id: line.id,
    item: line.item ?? null,
    item_code: str(line.item_code),
    item_name: str(line.item_name),
    item_unit: str(line.item_unit),
    item_description: str(line.item_description),
    quantity: str(line.quantity, '0'),
    unit_price: str(line.unit_price, '0'),
    planning_request_item: line.planning_request_item ?? null,
    order: line.order ?? idx,
    price_source: line.price_source ?? null,
    price_date: line.price_date ?? null,
  }));
}

/** loadPreviewProcurementLines: an empty preview gives one empty line. */
export function fromPreviewLines(preview: ProcurementLinePreview[]): EditLine[] {
  if (preview.length === 0) return [emptyLine()];
  return preview.map((p, idx) => ({
    key: nextKey(),
    item: p.item ?? null,
    item_code: str(p.item_code),
    item_name: str(p.item_name),
    item_unit: str(p.item_unit),
    item_description: str(p.item_description),
    quantity: str(p.quantity, '0'),
    unit_price:
      p.unit_price_eur != null && p.unit_price_eur !== '' ? String(p.unit_price_eur) : '0',
    planning_request_item: p.planning_request_item ?? null,
    order: p.order ?? idx,
    price_source: p.price_source ?? null,
    price_date: p.price_date ?? null,
  }));
}

/** snapshotOriginalLines */
export function withSnapshots(lines: EditLine[]): EditLine[] {
  return lines.map((line) => ({
    ...line,
    orig: {
      quantity: line.quantity,
      unit_price: line.unit_price,
      item_description: line.item_description || '',
    },
  }));
}

const num = (value: unknown) => Number.parseFloat(String(value ?? '')) || 0;

export function lineAmount(line: EditLine): number {
  return num(line.quantity) * num(line.unit_price);
}

/** isLineChanged */
export function isLineChanged(line: EditLine): boolean {
  if (!line.orig) return false;
  const numDiff = (a: string, b: string) => Math.abs(num(a) - num(b)) > 1e-9;
  return (
    numDiff(line.quantity, line.orig.quantity) ||
    numDiff(line.unit_price, line.orig.unit_price) ||
    (line.item_description || '') !== (line.orig.item_description || '')
  );
}

/** Per cell, for the editor's dirty marks: is this field off its snapshot? */
export function isFieldChanged(line: EditLine, field: string): boolean {
  if (!line.orig) return false;
  if (field === 'quantity' || field === 'unit_price') {
    return Math.abs(num(line[field]) - num(line.orig[field])) > 1e-9;
  }
  if (field === 'item_description') {
    return (line.item_description || '') !== (line.orig.item_description || '');
  }
  return false;
}

/** restoreLineFromSnapshot */
export function restoreLine(line: EditLine): EditLine {
  if (!line.orig) return line;
  return {
    ...line,
    quantity: line.orig.quantity,
    unit_price: line.orig.unit_price,
    item_description: line.orig.item_description,
  };
}

/**
 * clampDecimals: clean numeric strings are cut to the backend's decimal
 * places (quantity 2, unit_price 6); anything else passes so DRF reports it.
 */
export function clampDecimals(value: string, places: number): string {
  const s = String(value ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const decimals = (s.split('.')[1] || '').length;
  if (decimals <= places) return s;
  return String(Number.parseFloat(Number.parseFloat(s).toFixed(places)));
}

/** saveLines payload: lines with neither item nor description are skipped. */
export function linesForSubmit(lines: EditLine[]): ProcurementLineInput[] {
  const payload: ProcurementLineInput[] = [];
  lines.forEach((line, idx) => {
    const itemDesc = (line.item_description || '').trim();
    const item = line.item ?? null;
    if (!item && !itemDesc) return;
    const planningRequestItem = line.planning_request_item ?? null;
    payload.push({
      item: item || undefined,
      item_description: itemDesc || undefined,
      quantity: line.quantity !== '' ? clampDecimals(line.quantity, 2) : '0',
      unit_price: line.unit_price !== '' ? clampDecimals(line.unit_price, 6) : '0',
      planning_request_item: planningRequestItem || undefined,
      order: typeof line.order === 'number' ? line.order : idx,
    });
  });
  return payload;
}

/** Number as the legacy inputs held it ('' for an emptied field). */
export function numberText(value: number | null): string {
  if (value === null) return '';
  // Avoid exponent notation for tiny/huge values (String(1e-7) = '1e-7').
  if (Math.abs(value) > 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e21)) {
    return value.toFixed(10).replace(/\.?0+$/, '');
  }
  return String(value);
}

// ---- Excel price compare ----------------------------------------------------

export const EXCEL_PRICE_TOLERANCE = 0.01;

export interface ExcelRow {
  code: string;
  rawCode: string;
  name: string;
  qty: number;
  amountEur: number;
  /** amountEur / qty; null when qty is 0. Set by buildExcelCompare. */
  unitPrice: number | null;
}

export interface ExcelCompare {
  fileName: string;
  byCode: Map<string, ExcelRow>;
  byName: Map<string, ExcelRow[]>;
  rows: ExcelRow[];
}

/** normalizeStockCode: strip all whitespace, uppercase. */
export function normalizeStockCode(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .toLocaleUpperCase('tr-TR');
}

/** normalizeStockName: collapse whitespace, uppercase (tr). */
export function normalizeStockName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleUpperCase('tr-TR');
}

const HEADER_FOLD: Record<string, string> = {
  İ: 'I',
  I: 'I',
  Ş: 'S',
  Ğ: 'G',
  Ü: 'U',
  Ö: 'O',
  Ç: 'C',
  ı: 'I',
};

/** normalizeHeader: uppercase, ASCII-fold Turkish chars, drop non-alphanumerics. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[İIŞĞÜÖÇı]/g, (ch) => HEADER_FOLD[ch] || ch)
    .replace(/[^A-Z0-9]/g, '');
}

/** parseExcelNumber: a number, or a Turkish-formatted string ("1.234,56"). */
export function parseExcelNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null || value === '') return 0;
  let s = String(value).trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * parseExcelComparisonRows. Expected columns (matched by header text):
 * STOK KODU, STOK İSMİ, TALEP MİKTARI, SİPARİŞ MİKTARI, Sip. Tutar EUR.
 */
export function parseExcelComparisonRows(
  workbook: WorkBook,
  sheetToJson: (sheet: WorkBook['Sheets'][string]) => unknown[][],
): Omit<ExcelRow, 'unitPrice'>[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  const grid = sheet ? sheetToJson(sheet) : [];

  // The header row: the first one (of 15) with a STOK KODU cell.
  let headerRowIdx = -1;
  const colIdx = { code: -1, name: -1, reqQty: -1, orderQty: -1, amountEur: -1 };
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const headers = (grid[r] ?? []).map(normalizeHeader);
    const codeIdx = headers.indexOf('STOKKODU');
    if (codeIdx === -1) continue;
    headerRowIdx = r;
    colIdx.code = codeIdx;
    colIdx.name = headers.indexOf('STOKISMI');
    colIdx.reqQty = headers.indexOf('TALEPMIKTARI');
    colIdx.orderQty = headers.indexOf('SIPARISMIKTARI');
    colIdx.amountEur = headers.findIndex(
      (h) => h.includes('SIP') && h.includes('TUTAR') && h.includes('EUR'),
    );
    break;
  }
  if (headerRowIdx === -1) {
    throw new Error('Excel dosyasında "STOK KODU" başlıklı sütun bulunamadı.');
  }
  if (colIdx.amountEur === -1) {
    throw new Error('Excel dosyasında "Sip. Tutar EUR" sütunu bulunamadı.');
  }

  const rows: Omit<ExcelRow, 'unitPrice'>[] = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const code = normalizeStockCode(row[colIdx.code]);
    if (!code) continue; // empty rows and the totals row at the bottom
    const orderQty = colIdx.orderQty !== -1 ? parseExcelNumber(row[colIdx.orderQty]) : 0;
    const reqQty = colIdx.reqQty !== -1 ? parseExcelNumber(row[colIdx.reqQty]) : 0;
    rows.push({
      code,
      rawCode: String(row[colIdx.code] ?? '').trim(),
      name: colIdx.name !== -1 ? String(row[colIdx.name] ?? '').trim() : '',
      qty: orderQty > 0 ? orderQty : reqQty,
      amountEur: parseExcelNumber(row[colIdx.amountEur]),
    });
  }
  return rows;
}

/** buildExcelCompareState: duplicate stock codes are aggregated (qty and amount summed). */
export function buildExcelCompare(
  rows: Omit<ExcelRow, 'unitPrice'>[],
  fileName: string,
): ExcelCompare {
  const byCode = new Map<string, ExcelRow>();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    if (existing) {
      existing.qty += row.qty;
      existing.amountEur += row.amountEur;
    } else {
      byCode.set(row.code, { ...row, unitPrice: null });
    }
  }
  const byName = new Map<string, ExcelRow[]>();
  for (const row of byCode.values()) {
    row.unitPrice = row.qty > 0 ? row.amountEur / row.qty : null;
    const nameKey = normalizeStockName(row.name);
    if (!nameKey) continue;
    const list = byName.get(nameKey) ?? [];
    list.push(row);
    byName.set(nameKey, list);
  }
  return { fileName, byCode, byName, rows: [...byCode.values()] };
}

/** Reads the uploaded file into a compare state (compareWithExcel). */
export async function readExcelCompare(file: File): Promise<ExcelCompare> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const rows = parseExcelComparisonRows(
    workbook,
    (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][],
  );
  return buildExcelCompare(rows, file.name);
}

/** getExcelMatchForLine: by stock code first, then by name (+ quantity when ambiguous). */
export function excelMatchFor(compare: ExcelCompare | null, line: EditLine): ExcelRow | null {
  if (!compare) return null;
  const code = normalizeStockCode(line.item_code);
  if (code && compare.byCode.has(code)) return compare.byCode.get(code) ?? null;
  const nameKey = normalizeStockName(line.item_name);
  const candidates = nameKey ? compare.byName.get(nameKey) : undefined;
  if (candidates && candidates.length) {
    const q = num(line.quantity);
    return candidates.find((r) => Math.abs(r.qty - q) < 1e-9) ?? candidates[0] ?? null;
  }
  return null;
}

export interface ExcelDiff {
  amountMismatch: boolean;
  qtyDiffers: boolean;
  unitDiffers: boolean;
}

/**
 * getExcelDiff: the mismatch is decided on the LINE TOTAL (qty × unit price
 * vs Excel "Sip. Tutar EUR"); qty/unit say which factor differs.
 */
export function excelDiff(line: EditLine, match: ExcelRow): ExcelDiff {
  const ourQty = num(line.quantity);
  const ourUnit = num(line.unit_price);
  const ourAmount = ourQty * ourUnit;
  return {
    amountMismatch: Math.abs(ourAmount - match.amountEur) > EXCEL_PRICE_TOLERANCE,
    // 0.005: the backend stores quantity at 2 decimals, so an Excel qty with
    // more decimals rounds on apply and must still count as equal.
    qtyDiffers: Math.abs(ourQty - match.qty) > 0.005,
    unitDiffers:
      match.unitPrice != null && Math.abs(ourUnit - match.unitPrice) > EXCEL_PRICE_TOLERANCE,
  };
}

/**
 * applyExcelToLine: the differing value(s) from Excel so the line total
 * matches. Null when nothing changed (no mismatch, or quantity 0).
 */
export function applyExcelToLine(line: EditLine, match: ExcelRow): EditLine | null {
  const diff = excelDiff(line, match);
  if (!diff.amountMismatch) return null;
  const next = { ...line };
  // Backend precision: quantity 2 decimals, unit_price 6 decimals.
  if (diff.qtyDiffers) next.quantity = String(Number.parseFloat(match.qty.toFixed(2)));
  if (diff.unitDiffers && match.unitPrice != null) {
    next.unit_price = String(Number.parseFloat(match.unitPrice.toFixed(6)));
  }
  const q = num(next.quantity);
  const u = num(next.unit_price);
  // Residual drift (Excel qty 0, rounding, or a sub-tolerance unit diff over a
  // large quantity): derive the unit price so the line total matches exactly.
  if (Math.abs(q * u - match.amountEur) > EXCEL_PRICE_TOLERANCE) {
    if (q <= 0) return null;
    next.unit_price = String(Number.parseFloat((match.amountEur / q).toFixed(6)));
  }
  return next;
}

export interface CompareStats {
  matched: number;
  mismatched: number;
  unmatchedLines: number;
  unmatchedExcelRows: ExcelRow[];
}

/** The figures renderCompareInfo shows. */
export function compareStats(compare: ExcelCompare | null, lines: EditLine[]): CompareStats {
  const stats: CompareStats = {
    matched: 0,
    mismatched: 0,
    unmatchedLines: 0,
    unmatchedExcelRows: [],
  };
  if (!compare) return stats;
  const matchedRows = new Set<ExcelRow>();
  for (const line of lines) {
    const match = excelMatchFor(compare, line);
    if (!match) {
      stats.unmatchedLines++;
      continue;
    }
    matchedRows.add(match);
    stats.matched++;
    if (excelDiff(line, match).amountMismatch) stats.mismatched++;
  }
  stats.unmatchedExcelRows = compare.rows.filter((r) => !matchedRows.has(r));
  return stats;
}

// ---- display ----------------------------------------------------------------

/** Turkish labels for price_source (read-only info in the modal). */
export const PRICE_SOURCE_LABELS: Record<string, string> = {
  po_line: 'PO satırı (bu planlama kalemi)',
  recommended_offer: 'Önerilen tedarikçi teklifi',
  any_offer: 'Herhangi bir tedarikçi teklifi',
  historical_po: 'Aynı katalog kalemi, son PO (herhangi bir iş)',
  none: 'Fiyat yok (serbest metin veya hiç satın alınmamış)',
};

export function formatPriceSource(value: string | null | undefined): string {
  if (value == null || value === '') return '–';
  return PRICE_SOURCE_LABELS[value] || value;
}

export function formatPriceDate(value: string | null | undefined): string {
  if (value == null || value === '') return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('tr-TR');
}

/** formatCompareNumber */
export function formatCompareNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return value.toFixed(digits);
}
