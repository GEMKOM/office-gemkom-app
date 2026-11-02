import type { AccountingExportRow } from '@/api/accounting/subcontractingStatements';

// Row mapping of subcontracting-statements.js: the accounting export's keys
// (matched loosely, see normalizeKey) onto the fixed column layout accounting
// pastes into its own system.

export interface StatementColumn {
  field: string;
  label: string;
  aliases: string[];
  numeric?: boolean;
  footerSum?: boolean;
}

export const TURKISH_MONTHS = [
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

export const COLUMN_SCHEMA: StatementColumn[] = [
  { field: 's', label: 'S', aliases: [] },
  { field: 'stock_code', label: 'Stok Kodu', aliases: ['stock_code'] },
  { field: 'b1', label: 'B1', aliases: ['b1'] },
  { field: 'b2', label: 'B2', aliases: ['b2'] },
  {
    field: 'quantity_done',
    label: 'Yapılan Miktar',
    aliases: ['amount'],
    numeric: true,
    footerSum: true,
  },
  { field: 'unit_price', label: 'Birim Fiyat', aliases: ['unit_price'], numeric: true },
  { field: 'b3', label: 'B3', aliases: ['b3'] },
  { field: 'b4', label: 'B4', aliases: ['b4'] },
  { field: 'amount', label: 'Tutar', aliases: ['total_price'], numeric: true, footerSum: true },
  { field: 'project_code', label: 'Proje Kodu', aliases: ['job_no'] },
  { field: 'b5_1', label: 'B5', aliases: ['b5_1'] },
  { field: 'b5_2', label: 'B5', aliases: ['b5_2'] },
  { field: 'b5_3', label: 'B5', aliases: ['b5_3'] },
  { field: 'b5_4', label: 'B5', aliases: ['b5_4'] },
  { field: 'b5_5', label: 'B5', aliases: ['b5_5'] },
  { field: 'description', label: 'Açıklama', aliases: ['description'] },
  { field: 'subcontractor', label: 'Taşeron', aliases: ['subcontractor_name'] },
];

export type StatementRow = Record<string, unknown>;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Accepts 1.234,56 / 1,234.56 / 1234.56 / numbers; null when there is no number. */
export function parseLocaleNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9,.-]/g, '');
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    // Comma decimal: drop thousand dots.
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // Dot decimal: drop thousand commas.
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const TR_2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.234,50"; a value that is not a number stays as it is. */
export function formatTrNumber(value: unknown): string {
  const num = parseLocaleNumber(value);
  if (num === null) return value === null || value === undefined ? '' : String(value);
  return TR_2.format(num);
}

function normalizeKey(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function valueByAliases(row: AccountingExportRow, aliases: string[]): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const entries = Object.entries(row).map(([k, v]) => [normalizeKey(k), v] as const);
  for (const alias of aliases) {
    const found = entries.find(([k]) => k === normalizeKey(alias));
    if (found && found[1] !== undefined && found[1] !== null) return found[1];
  }
  return null;
}

export function mapRowToSchema(row: AccountingExportRow): StatementRow {
  const mapped: StatementRow = {};
  for (const col of COLUMN_SCHEMA) {
    if (col.field === 's') {
      mapped[col.field] = 'S';
      continue;
    }
    const value = valueByAliases(row, col.aliases);
    mapped[col.field] = value === null || value === undefined ? '' : value;
  }
  return mapped;
}

type ValueType = 'boolean' | 'number' | 'date' | 'string';

function inferType(v: unknown): ValueType {
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string' && v.length >= 8 && Number.isFinite(Date.parse(v))) return 'date';
  return 'string';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'number') return value.toLocaleString('tr-TR');
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Legacy buildColumnsFromSchema: each text column formats by the type of its first filled cell. */
export function cellFormatters(rows: StatementRow[]): Record<string, (value: unknown) => string> {
  const out: Record<string, (value: unknown) => string> = {};
  for (const col of COLUMN_SCHEMA) {
    if (col.numeric) {
      out[col.field] = formatTrNumber;
      continue;
    }
    const sample = rows
      .map((row) => row[col.field])
      .find((v) => v !== null && v !== undefined && v !== '');
    const type = inferType(sample ?? null);
    out[col.field] =
      type === 'date'
        ? (value) => {
            if (!value) return '-';
            const d = new Date(String(value));
            return Number.isNaN(d.getTime()) ? formatValue(value) : d.toLocaleString('tr-TR');
          }
        : formatValue;
  }
  return out;
}

/** Totals of the footerSum columns over the given rows. */
export function columnSums(rows: StatementRow[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const col of COLUMN_SCHEMA) {
    if (!col.footerSum) continue;
    sums[col.field] = rows.reduce((sum, row) => sum + (parseLocaleNumber(row[col.field]) ?? 0), 0);
  }
  return sums;
}
