import type {
  OccasionTheme,
  SpecialDay,
  SpecialDayCategory,
  TemplateKind,
} from '@/api/general/specialDays';

export interface Placeholder {
  token: string;
  label: string;
}

const FIRST_NAME: Placeholder = { token: '{first_name}', label: 'Adı' };
const FULL_NAME: Placeholder = { token: '{full_name}', label: 'Adı soyadı' };

export const TEMPLATE_PLACEHOLDERS: Record<TemplateKind, Placeholder[]> = {
  birthday: [FIRST_NAME, FULL_NAME],
  work_anniversary: [FIRST_NAME, FULL_NAME, { token: '{years}', label: 'Kaçıncı yıl' }],
  public_holiday: [FIRST_NAME, FULL_NAME, { token: '{holiday_name}', label: 'Bayramın adı' }],
};

export const DAY_PLACEHOLDERS: Placeholder[] = [
  FIRST_NAME,
  FULL_NAME,
  { token: '{name}', label: 'Günün adı' },
];

/** What the live previews fill the placeholders with. */
export const SAMPLE_PERSON = { first_name: 'Ayşe', full_name: 'Ayşe Kaya' };

export const TEMPLATE_SAMPLE: Record<TemplateKind, Record<string, string | number>> = {
  birthday: { ...SAMPLE_PERSON },
  work_anniversary: { ...SAMPLE_PERSON, years: 5 },
  public_holiday: { ...SAMPLE_PERSON, holiday_name: 'Cumhuriyet Bayramı' },
};

const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_]*$/u;

/**
 * The backend's special_days.services.render, for previews: plain {name}
 * placeholders are filled (unknown names become empty), {{ and }} are literal
 * braces, and anything else (a stray brace, {}, {0}, {a.b}, {a:>3}, {a!r})
 * shows the whole text as written.
 */
export function renderTemplate(text: string, context: Record<string, string | number>): string {
  const source = text ?? '';
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{') {
      if (source[i + 1] === '{') {
        out += '{';
        i += 2;
        continue;
      }
      const end = source.indexOf('}', i + 1);
      if (end === -1) return source;
      const field = source.slice(i + 1, end);
      if (!IDENTIFIER.test(field)) return source;
      out += field in context ? String(context[field]) : '';
      i = end + 1;
    } else if (ch === '}') {
      if (source[i + 1] !== '}') return source;
      out += '}';
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** The tokens in `text` that the kind does not fill (they render empty). */
export function unknownPlaceholders(text: string, allowed: Placeholder[]): string[] {
  const known = new Set(allowed.map((p) => p.token));
  const found = new Set<string>();
  for (const match of (text ?? '').matchAll(/(?<!\{)\{([\p{L}_][\p{L}\p{N}_]*)\}(?!\})/gu)) {
    const token = `{${match[1]}}`;
    if (!known.has(token)) found.add(token);
  }
  return [...found];
}

export const CATEGORY_LABEL: Record<SpecialDayCategory, string> = {
  company: 'Şirket',
  national: 'Milli',
  religious: 'Dini',
  international: 'Uluslararası',
  commemoration: 'Anma günü',
};

export const THEME_LABEL: Record<OccasionTheme, string> = {
  birthday: 'Doğum günü',
  anniversary: 'Yıl dönümü',
  national: 'Milli',
  religious: 'Dini',
  company: 'Şirket',
  soft: 'Sade',
};

/** The backend's DEFAULT_THEME_FOR_CATEGORY. */
export const DEFAULT_THEME: Record<SpecialDayCategory, OccasionTheme> = {
  company: 'company',
  national: 'national',
  religious: 'religious',
  international: 'soft',
  commemoration: 'national',
};

export const MONTHS = [
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

/** A real day of the month in a leap year (29 Şubat is allowed, as on the backend). */
export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= new Date(2000, month, 0).getDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The day to preview: a one-off's date, or a yearly day's next occurrence
 * from `today` (today included). 29 Şubat waits for the next leap year.
 */
export function nextOccurrence(
  day: Pick<SpecialDay, 'month' | 'day' | 'date'>,
  today: string,
): string | null {
  if (day.date) return day.date;
  if (!day.month || !day.day || !isValidMonthDay(day.month, day.day)) return null;
  const startYear = Number(today.slice(0, 4));
  for (let year = startYear; year < startYear + 9; year += 1) {
    if (day.day > new Date(year, day.month, 0).getDate()) continue;
    const iso = `${year}-${pad(day.month)}-${pad(day.day)}`;
    if (iso >= today) return iso;
  }
  return null;
}

/** "Her yıl 29 Ekim", or the one-off date as "15 Aralık 2026". */
export function whenLabel(day: Pick<SpecialDay, 'month' | 'day' | 'date'>): string {
  if (day.date) {
    const [y, m, d] = day.date.split('-').map(Number);
    return `${d} ${MONTHS[(m ?? 0) - 1] ?? ''} ${y}`;
  }
  if (day.month && day.day) return `Her yıl ${day.day} ${MONTHS[day.month - 1] ?? ''}`;
  return '';
}
