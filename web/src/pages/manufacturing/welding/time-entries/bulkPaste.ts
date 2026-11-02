import type { JobOrderOption } from '@/api/reference/jobOrders';
import type { UserOption } from '@/api/reference/users';

// The "Toplu Zaman Kaydı" editor's rows and its Excel paste, ported from
// time-entries.js (setupBulkCreateForm / parseExcelData) with the same name
// matching.

export const MAX_BULK_ROWS = 300;

export const OVERTIME_OPTIONS = [
  { value: 'regular', label: 'Normal (1x)' },
  { value: 'after_hours', label: 'Fazla Mesai (1.5x)' },
  { value: 'holiday', label: 'Tatil (2x)' },
] as const;

export const OVERTIME_LABELS: Record<string, string> = Object.fromEntries(
  OVERTIME_OPTIONS.map((o) => [o.value, o.label]),
);

/** One editor row; every field is the raw text, as in legacy. */
export interface BulkRow {
  /** Stable id for the table (legacy used the array index). */
  _key: string;
  employee: string;
  /** Label for an employee the active list lacks (pasted, since left). */
  employee_label?: string;
  job_no: string;
  date: string;
  hours: string;
  overtime_type: string;
  description: string;
}

export type BulkField = 'employee' | 'job_no' | 'date' | 'hours' | 'overtime_type' | 'description';

export const BULK_COLUMNS: { key: BulkField; label: string; required: boolean }[] = [
  { key: 'employee', label: 'Çalışan', required: true },
  { key: 'job_no', label: 'İş No', required: true },
  { key: 'date', label: 'Tarih', required: true },
  { key: 'hours', label: 'Saat', required: true },
  { key: 'overtime_type', label: 'Mesai Tipi', required: true },
  { key: 'description', label: 'Açıklama', required: false },
];

let nextKey = 0;
export function newRowKey(): string {
  nextKey += 1;
  return `r${nextKey}`;
}

export function blankRow(): BulkRow {
  return {
    _key: newRowKey(),
    employee: '',
    job_no: '',
    date: '',
    hours: '',
    overtime_type: '',
    description: '',
  };
}

export function isBlankRow(row: BulkRow): boolean {
  return BULK_COLUMNS.every((c) => !row[c.key]);
}

// ---- name matching (verbatim port) ------------------------------------------

const TURKISH_FOLD: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

export function foldTurkishChars(value: unknown): string {
  return String(value ?? '')
    .split('')
    .map((ch) => TURKISH_FOLD[ch] ?? ch)
    .join('');
}

export function normalizePersonName(value: unknown): string {
  return foldTurkishChars(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

type NamedUser = Pick<UserOption, 'username' | 'full_name' | 'first_name' | 'last_name'>;

export function getUserDisplayName(user: NamedUser | null | undefined): string {
  if (!user) return '';
  if (user.full_name) return user.full_name;
  if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
  return user.username || '';
}

export function getUserOptionLabel(user: NamedUser | null | undefined): string {
  if (!user) return '';
  const displayName = getUserDisplayName(user);
  if (displayName && user.username) return `${displayName} (${user.username})`;
  return displayName || user.username || '';
}

export function collectUserNameVariants(user: NamedUser): Set<string> {
  const variants = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizePersonName(value);
    if (normalized) variants.add(normalized);
  };

  add(user.username);
  add(user.full_name);
  if (user.first_name) add(user.first_name);
  if (user.last_name) add(user.last_name);
  if (user.first_name && user.last_name) {
    add(`${user.first_name} ${user.last_name}`);
    add(`${user.last_name} ${user.first_name}`);
  }
  if (user.full_name && user.full_name.includes(',')) {
    const parts = user.full_name
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
      add(`${parts[0]} ${parts[1]}`);
    }
  }

  return variants;
}

/**
 * Exact variant match wins at once; otherwise the user whose variant and the
 * input contain one another with the longest overlap (first such user on ties).
 * Parenthesised parts ("Ali Veli (ali)") are dropped first.
 */
export function matchEmployeeFromPaste<U extends NamedUser>(
  employeeText: unknown,
  userList: readonly U[],
): U | null {
  const cleaned = String(employeeText ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalizedInput = normalizePersonName(cleaned);
  if (!normalizedInput) return null;

  let bestMatch: U | null = null;
  let bestScore = 0;

  for (const user of userList) {
    for (const variant of collectUserNameVariants(user)) {
      if (variant === normalizedInput) return user;
      if (variant.includes(normalizedInput) || normalizedInput.includes(variant)) {
        const score = Math.min(variant.length, normalizedInput.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = user;
        }
      }
    }
  }

  return bestMatch;
}

// ---- Excel paste --------------------------------------------------------------

export interface FailedPasteRow {
  rowNumber: number;
  employee: string;
  job_no: string;
  date: string;
  hours: string;
  reason: string;
}

export interface PasteResult {
  rows: BulkRow[];
  failed: FailedPasteRow[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Legacy tried `new Date(text)` first and fell back to DD.MM.YYYY. That read
 * "05.10.2026" month-first and shifted every local date a day back through
 * toISOString, so the day-first form is tried first and parsed dates keep
 * their local day.
 */
export function parsePastedDate(dateText: string): string {
  if (!dateText) return '';
  const dayFirst = dateText.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  // "10/30/2026" cannot be day-first; it falls through to Date like before.
  if (dayFirst && Number(dayFirst[2]) <= 12) {
    const [, day = '', month = '', year = ''] = dayFirst;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const iso = dateText.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const date = new Date(dateText);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return dateText; // as-is, like legacy
}

function parseOvertime(text: string): string {
  const overtimeText = text.toLowerCase();
  if (
    overtimeText.includes('mesai') ||
    overtimeText.includes('after') ||
    overtimeText === '1.5x' ||
    overtimeText === '1,5x'
  ) {
    return 'after_hours';
  }
  if (overtimeText.includes('tatil') || overtimeText.includes('holiday') || overtimeText === '2x') {
    return 'holiday';
  }
  return 'regular';
}

/**
 * Legacy parseExcelData. Tab-separated lines (comma-separated when a line has
 * fewer than four tab cells): Çalışan, İş No, Tarih, Saat, Mesai Tipi,
 * Açıklama. A first line naming the columns is skipped. `rowNumber` counts
 * the non-empty lines, header included.
 */
export function parseExcelPaste(
  rawText: string,
  users: readonly UserOption[],
  allUsers: readonly UserOption[],
  jobOrders: readonly JobOrderOption[],
): PasteResult {
  const lines = rawText
    .trim()
    .split(/\r?\n/g)
    .filter((line) => line.trim().length > 0);
  const rows: BulkRow[] = [];
  const failed: FailedPasteRow[] = [];
  if (lines.length === 0) return { rows, failed };

  const firstLineLower = (lines[0] ?? '').toLowerCase();
  const startIndex =
    firstLineLower.includes('çalışan') ||
    firstLineLower.includes('employee') ||
    firstLineLower.includes('iş no') ||
    firstLineLower.includes('job')
      ? 1
      : 0;

  // Job numbers are checked without case; the row gets the listed spelling.
  const jobNos = new Map<string, string>();
  for (const job of jobOrders) {
    const normalized = (job.job_no || '').toString().trim().toLowerCase();
    if (normalized && !jobNos.has(normalized)) jobNos.set(normalized, job.job_no);
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i] ?? '';
    let cells = line.split('\t').map((cell) => cell.trim());

    if (cells.length < 4) {
      const cellsComma = line.split(',').map((cell) => cell.trim());
      if (cellsComma.length >= 4) {
        cells = cellsComma;
      } else {
        failed.push({
          rowNumber: i + 1,
          employee: cells[0] || '',
          job_no: cells[1] || '',
          date: cells[2] || '',
          hours: cells[3] || '',
          reason: 'Sütun sayısı yetersiz',
        });
        continue;
      }
    }

    const employeeText = (cells[0] || '').replace(/^\uFEFF/, '').trim();
    const matchedUser =
      matchEmployeeFromPaste(employeeText, users) ?? matchEmployeeFromPaste(employeeText, allUsers);
    const employeeId = matchedUser?.id ? String(matchedUser.id) : '';

    const dateText = cells[2] || '';
    const dateValue = parsePastedDate(dateText);

    let hoursValue = '';
    const hoursText = cells[3] || '';
    if (hoursText) {
      const hours = Number.parseFloat(hoursText.replace(',', '.'));
      if (!Number.isNaN(hours) && hours > 0) hoursValue = hours.toString();
    }

    const overtimeTypeValue = parseOvertime(cells[4] || '');
    const descriptionValue = cells[5] || '';
    const jobNoRaw = (cells[1] || '').trim();
    const listedJobNo = jobNos.get(jobNoRaw.toLowerCase());

    if (employeeId && jobNoRaw && listedJobNo && dateValue && hoursValue) {
      rows.push({
        _key: newRowKey(),
        employee: employeeId,
        employee_label: getUserOptionLabel(matchedUser),
        job_no: listedJobNo,
        date: dateValue,
        hours: hoursValue,
        overtime_type: overtimeTypeValue,
        description: descriptionValue,
      });
    } else {
      const reasons: string[] = [];
      if (!employeeId) reasons.push('Çalışan bulunamadı');
      if (!jobNoRaw) reasons.push('İş no boş');
      if (jobNoRaw && !listedJobNo) reasons.push('İş no listede yok');
      if (!dateValue) reasons.push('Tarih geçersiz');
      if (!hoursValue) reasons.push('Saat geçersiz');
      failed.push({
        rowNumber: i + 1,
        employee: employeeText,
        job_no: jobNoRaw,
        date: dateText,
        hours: hoursText,
        reason: reasons.join(', '),
      });
    }
  }

  return { rows, failed };
}

/**
 * Legacy getBulkCreateUsersForRow: the active users, plus the row's own
 * employee from the full list when they have since left.
 */
export function usersForRow(
  row: Pick<BulkRow, 'employee'>,
  users: readonly UserOption[],
  allUsers: readonly UserOption[],
): readonly UserOption[] {
  const rowEmployeeId = row.employee;
  if (!rowEmployeeId) return users;
  if (users.some((user) => user.id != null && String(user.id) === rowEmployeeId)) return users;
  const matchedFromAll = allUsers.find(
    (user) => user.id != null && String(user.id) === rowEmployeeId,
  );
  return matchedFromAll ? [...users, matchedFromAll] : users;
}

/** Legacy handleBulkCreateSave checks: required fields, then hours > 0. */
export function validateBulkRows(rows: readonly BulkRow[]): string[] | null {
  const requiredFields: BulkField[] = ['employee', 'job_no', 'date', 'hours', 'overtime_type'];
  const missing: string[] = [];
  rows.forEach((row, index) => {
    for (const field of requiredFields) {
      if (!row[field] || row[field].toString().trim() === '') {
        missing.push(`Satır ${index + 1}: ${BULK_COLUMNS.find((c) => c.key === field)?.label}`);
      }
    }
  });
  if (missing.length > 0) return ['Lütfen aşağıdaki zorunlu alanları doldurun:', ...missing];

  const errors: string[] = [];
  rows.forEach((row, index) => {
    if (row.hours && Number.parseFloat(row.hours) <= 0) {
      errors.push(`Satır ${index + 1}: Saat 0'dan büyük olmalıdır`);
    }
  });
  if (errors.length > 0) return ['Lütfen aşağıdaki hataları düzeltin:', ...errors];
  return null;
}
