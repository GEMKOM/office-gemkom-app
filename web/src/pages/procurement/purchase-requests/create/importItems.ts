// Bulk import (itemsManager.js previewBulkImport → detectColumnMapping →
// column mapping → processDataWithMapping), as pure functions.

export type ImportField = 'code' | 'name' | 'job_no' | 'quantity' | 'unit' | 'specs';
export type ColumnMapping = Record<ImportField, number>;
export type Cell = string | number | boolean | null | undefined;

export interface ImportedItem {
  code: string;
  name: string;
  job_no: string;
  quantity: number;
  unit: string;
  specs: string;
  specifications: string;
  item_description: string;
}

/** The selects of the mapping modal (no Özellikler select, as legacy). */
export const MAPPING_FIELDS: { field: Exclude<ImportField, 'specs'>; label: string }[] = [
  { field: 'code', label: 'Stok Kodu' },
  { field: 'name', label: 'Malzeme Adı' },
  { field: 'job_no', label: 'İş No' },
  { field: 'quantity', label: 'Miktar' },
  { field: 'unit', label: 'Birim' },
];

const KEYWORDS: Record<ImportField, string[]> = {
  code: ['kod', 'code', 'stok', 'ürün', 'malzeme', 'item', 'product', 'material', 'part', 'parça', 'sku', 'malzeme kodu', 'stok kodu'],
  name: ['ad', 'name', 'açıklama', 'description', 'ürün adı', 'malzeme adı', 'title', 'başlık', 'tanım', 'isim', 'malzeme adı', 'malzeme adi', 'isim', 'stok ismi'],
  job_no: ['srm. kodu', 'srm kodu', 'iş no', 'is no', 'job no', 'job number', 'work no', 'work number', 'proje no', 'project no', 'iş ismi'],
  quantity: ['miktar', 'quantity', 'adet', 'sayı', 'number', 'amount', 'qty', 'count', 'piece', 'talep miktari'],
  unit: ['birim', 'unit', 'ölçü', 'measure', 'uom', 'measurement'],
  specs: ['özellik', 'specs', 'specification', 'teknik', 'technical', 'detay', 'detail', 'açıklama', 'description', 'teknik özellikler', 'açıklama-1', 'açıklama-2'],
};

export function normalizeTurkish(text: Cell): string {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/** Legacy parseCSV: `;` if the line has one, else `,`; no quoted separators. */
export function parseCsv(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => (line.includes(';') ? line.split(';') : line.split(',')).map((v) => v.trim().replace(/^["']|["']$/g, '')));
}

export function detectColumnMapping(headers: readonly Cell[], dataRows: readonly (readonly Cell[])[] = []): ColumnMapping {
  const m: ColumnMapping = { code: -1, name: -1, job_no: -1, quantity: -1, unit: -1, specs: -1 };
  headers.forEach((header, index) => {
    if (!header) return;
    const lower = String(header).toLowerCase().trim();
    const norm = normalizeTurkish(header);
    const raw = String(header);
    const is = (word: string, upper: string) => lower === word || norm === word || raw === upper;
    if (m.code === -1 && is('kod', 'KOD')) m.code = index;
    if (m.name === -1 && is('isim', 'İSİM')) m.name = index;
    if (m.quantity === -1 && is('miktar', 'MİKTAR')) m.quantity = index;
    if (m.unit === -1 && is('birim', 'BİRİM')) m.unit = index;
    if (m.code === -1 && is('stok kodu', 'STOK KODU')) m.code = index;
    if (m.name === -1 && is('stok ismi', 'STOK İSMİ')) m.name = index;
    if (m.job_no === -1 && is('iş kodu', 'İŞ KODU')) m.job_no = index;
    if (m.quantity === -1 && is('talep miktari', 'TALEP MİKTARI')) m.quantity = index;
    for (const field of Object.keys(KEYWORDS) as ImportField[]) {
      if (m[field] !== -1) continue;
      if (KEYWORDS[field].some((k) => lower === k || lower.includes(k) || norm === k || norm.includes(k))) {
        m[field] = index;
      }
    }
  });
  const first = dataRows[0];
  if (first) {
    if (m.quantity === -1) {
      const i = first.findIndex((v) => v && !Number.isNaN(parseFloat(String(v).replace(',', '.'))));
      if (i >= 0) m.quantity = i;
    }
    if (m.code === -1) {
      const i = first.findIndex((v) => v && String(v).length <= 20 && !Number.isNaN(parseFloat(String(v))));
      if (i >= 0) m.code = i;
    }
  }
  headers.forEach((header, index) => {
    if (!header) return;
    const lower = String(header).toLowerCase().trim();
    const norm = normalizeTurkish(header);
    if (m.code === -1 && lower.includes('malzeme') && lower.includes('kod')) m.code = index;
    if (m.name === -1 && lower.includes('malzeme') && lower.includes('ad')) m.name = index;
    if (m.name === -1 && (lower === 'isim' || norm === 'isim')) m.name = index;
    // Legacy threw a ReferenceError here (headerUpper) and the whole file failed to read.
    if (m.job_no === -1 && (lower === 'srm. kodu' || norm === 'srm. kodu' || String(header).toUpperCase() === 'SRM. KODU')) {
      m.job_no = index;
    }
    if (m.quantity === -1 && (lower === 'miktar' || norm === 'miktar')) m.quantity = index;
    if (m.unit === -1 && (lower === 'birim' || norm === 'birim')) m.unit = index;
    if (m.specs === -1 && lower.includes('teknik') && lower.includes('özellik')) m.specs = index;
  });
  return m;
}

function cell(row: readonly Cell[], index: number | undefined): string {
  if (index === undefined || index === -1 || index >= row.length) return '';
  const value = row[index];
  return value ? String(value).trim() : '';
}

function parseQuantity(value: string): number {
  const n = parseFloat(value.replace(',', '.'));
  return Number.isNaN(n) ? 0 : n;
}

export interface ImportResult {
  items: ImportedItem[];
  errors: string[];
  skippedRows: number;
}

/**
 * Legacy processDataWithMapping. Specs: the mapped specs column (the mapping
 * modal has none, so always empty) plus every "açıklama" column, ' | '-joined.
 */
export function processRows(
  dataRows: readonly (readonly Cell[])[],
  mapping: Partial<ColumnMapping>,
  headers: readonly Cell[],
): ImportResult {
  const items: ImportedItem[] = [];
  const errors: string[] = [];
  let skippedRows = 0;
  const aciklama = headers
    .map((h, i) => ({ h: h ? String(h) : '', i }))
    .filter(({ h }) => {
      const lower = h.toLowerCase();
      const upper = h.toUpperCase();
      return lower.includes('açıklama') || lower.includes('aciklama') || upper.includes('AÇIKLAMA') || upper.includes('ACIKLAMA');
    })
    .map(({ i }) => i);
  dataRows.forEach((row, index) => {
    if (!row || row.length === 0) {
      skippedRows++;
      return;
    }
    const n = index + 2;
    let specs = cell(row, mapping.specs);
    const combined = aciklama.map((i) => cell(row, i)).filter((v) => v.trim() !== '').join(' | ');
    if (combined) specs = specs ? `${specs} | ${combined}` : combined;
    const item: ImportedItem = {
      code: cell(row, mapping.code),
      name: cell(row, mapping.name),
      job_no: cell(row, mapping.job_no),
      quantity: parseQuantity(cell(row, mapping.quantity)),
      unit: cell(row, mapping.unit),
      specs,
      specifications: specs,
      item_description: '',
    };
    let valid = true;
    const fail = (message: string) => {
      errors.push(`Satır ${n}: ${message} - satır atlandı`);
      skippedRows++;
      valid = false;
    };
    if (!item.code) fail('Stok kodu eksik');
    if (!item.name) fail('Malzeme adı eksik');
    if (!item.job_no) fail('İş no eksik');
    if (item.quantity <= 0) fail('Geçersiz miktar değeri');
    if (!item.unit) fail('Birim eksik');
    if (valid) items.push(item);
  });
  return { items, errors, skippedRows };
}

/** Reads the first sheet (or CSV) as rows of cells. */
export async function readSpreadsheet(file: File): Promise<Cell[][]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return parseCsv(await file.text());
  }
  const XLSX = await import('xlsx');
  const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1 });
}
