/**
 * An editable link's edits, as pure functions (ported from the "editing"
 * part of projects/plan-sheet/planSheetPage.js). The computed sheet stays as
 * the server sent it; sheetWithHeader lays the header's edits over a copy,
 * and the grid lays the row edits over its rows (applyRowOverrides).
 */
import { NUMBER_FIELDS, type SheetGridRow } from './sheetRows';
import type { HeaderOverrides, PlanSheet, RowOverrides } from './types';
import { workingDayDelta, type WorkdayCalendar } from './workdays';

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/** The sheet as it is shown: the header edits laid over the computed one. A
 *  working-day pill follows its two dates when one of them was edited, unless
 *  the pill itself was typed in. */
export function sheetWithHeader(sheet: PlanSheet, header: HeaderOverrides, calendar: WorkdayCalendar): PlanSheet {
  const h = header;
  const jo = { ...(sheet.job_order || {}) };
  if (hasOwn(h, 'job_no')) jo.job_no = h.job_no;
  if (hasOwn(h, 'title')) jo.title = h.title;
  if (hasOwn(h, 'customer_name')) jo.customer_name = h.customer_name;
  if (hasOwn(h, 'start')) jo.created_at = h.start;
  const out: PlanSheet = { ...sheet, job_order: jo };
  if (hasOwn(h, 'termin')) out.termin = h.termin;
  if (hasOwn(h, 'plan_end')) out.plan_end = h.plan_end;
  if (hasOwn(h, 'projected_end')) out.projected_end = h.projected_end;
  const pill = (
    key: 'plan_vs_termin_wd' | 'deviation_wd' | 'termin_gap_wd',
    from: 'termin' | 'plan_end',
    to: 'plan_end' | 'projected_end',
  ) => {
    if (hasOwn(h, key)) out[key] = h[key];
    else if (hasOwn(h, from) || hasOwn(h, to)) out[key] = workingDayDelta(calendar, out[from], out[to]);
  };
  pill('plan_vs_termin_wd', 'termin', 'plan_end');
  pill('deviation_wd', 'plan_end', 'projected_end');
  pill('termin_gap_wd', 'termin', 'projected_end');
  // The root job row carries the termin line and the gap pill on the grid.
  if (['termin', 'projected_end', 'termin_gap_wd'].some((k) => hasOwn(h, k))) {
    out.nodes = (sheet.nodes || []).map((node) =>
      node.parent ? node : { ...node, termin: out.termin, termin_gap_wd: out.termin_gap_wd },
    );
  }
  return out;
}

export type HeaderTextKey = 'job_no' | 'title' | 'customer_name';
export type HeaderDateKey = 'start' | 'termin' | 'plan_end' | 'projected_end';
export type HeaderWdKey = 'plan_vs_termin_wd' | 'deviation_wd' | 'termin_gap_wd';

/** The header fields of a sheet (computed, or with the edits laid over). */
export function headerValues(sheet: PlanSheet): Record<HeaderTextKey | HeaderDateKey, string | null | undefined> {
  const jo = sheet.job_order || {};
  return {
    job_no: jo.job_no,
    title: jo.title,
    customer_name: jo.customer_name,
    start: jo.created_at,
    termin: sheet.termin,
    plan_end: sheet.plan_end,
    projected_end: sheet.projected_end,
  };
}

/** A typed cell value as stored: numbers parsed (progress kept to 0–100),
 *  blanks as null. Throws on a number field that is not a number. */
export function normalizeCellValue(field: string, value: unknown): unknown {
  if (NUMBER_FIELDS.has(field)) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error('Geçerli bir sayı girin.');
    return field === 'progress' ? Math.max(0, Math.min(100, n)) : n;
  }
  return value === '' ? null : value;
}

/**
 * The link's row overrides after a cell edit. Writing the computed value back
 * drops the edit; a task's plan dates move its length too, unless the length
 * was typed.
 */
export function applyCellEdit(
  overrides: RowOverrides,
  row: SheetGridRow,
  field: string,
  value: unknown,
  calendar: WorkdayCalendar,
): RowOverrides {
  const next = normalizeCellValue(field, value);
  const base = (row.base || row) as unknown as Record<string, unknown>;
  const fields: Record<string, unknown> = { ...(overrides[row.key] || {}) };
  if (String(next ?? '') === String(base[field] ?? '')) delete fields[field];
  else fields[field] = next;
  if (row.kind === 'task' && (field === 'plan_start' || field === 'plan_end')) {
    const start = (hasOwn(fields, 'plan_start') ? fields.plan_start : base.plan_start) as string | null;
    const end = (hasOwn(fields, 'plan_end') ? fields.plan_end : base.plan_end) as string | null;
    const wd = start && end ? calendar.workingDaysInclusive(start, end) : null;
    if (wd != null && String(wd) !== String(base.plan_wd ?? '')) fields.plan_wd = wd;
    else delete fields.plan_wd;
  }
  const out = { ...overrides };
  if (Object.keys(fields).length) out[row.key] = fields;
  else delete out[row.key];
  return out;
}
