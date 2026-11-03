/**
 * The sheet's rows and columns: one group row per job order (root and
 * sub-jobs), the department tasks beneath it. Ported from
 * projects/project-tracking/planSheet.js (buildSheetRows, the column list,
 * the bar accessor and the editable-link overrides).
 */
import type { StatusFamily } from '@/ui/StatusBadge';
import { barState, causeSentence, fmtDateTr, groupRows, rootCauseLabel, type BarState } from './planSheetText';
import { departmentName, taskTitle, tr } from './sheetLang';
import type { BarSpan } from './timeline';
import type { PlanSheet, RowOverrides, SheetNode, SheetTaskRow } from './types';

export const STATUS_META: Record<string, { label: string; labelEn: string; family: StatusFamily }> = {
  pending: { label: 'Başlamadı', labelEn: 'Not started', family: 'grey' },
  blocked: { label: 'Engellendi', labelEn: 'Blocked', family: 'grey' },
  in_progress: { label: 'Devam Ediyor', labelEn: 'In progress', family: 'blue' },
  completed: { label: 'Tamamlandı', labelEn: 'Completed', family: 'green' },
  on_hold: { label: 'Beklemede', labelEn: 'On hold', family: 'orange' },
  cancelled: { label: 'İptal', labelEn: 'Cancelled', family: 'grey' },
  skipped: { label: 'Atlandı', labelEn: 'Skipped', family: 'grey' },
  active: { label: 'Aktif', labelEn: 'Active', family: 'blue' },
  draft: { label: 'Taslak', labelEn: 'Draft', family: 'grey' },
};

/** A grid row: a job (`group`) or one of its tasks. Field names match the
 *  column fields, so an editable link's override lands on the same key. */
export interface SheetGridRow {
  key: string;
  kind: 'group' | 'task';
  /** The job row a task row folds under. */
  groupKey?: string;
  indent: number;
  title: string;
  /** Job rows: the job's name (title is its number). */
  job_title?: string | null;
  job_no: string;
  node: SheetNode;
  /** Task rows: the computed payload row. */
  row?: SheetTaskRow;
  plan_start?: string | null;
  plan_end?: string | null;
  plan_wd?: number | null;
  progress?: number | null;
  status?: string | null;
  deviation?: number | null;
  projected_start?: string | null;
  projected_end?: string | null;
  cause?: string | null;
  job_target?: string | null;
  job_target_late?: boolean;
  job_target_delta_wd?: number | null;
  late_count?: number | null;
  collapsed?: boolean;
  /** With overrides: the computed row, so an edit back to it drops the override. */
  base?: SheetGridRow;
  /** With overrides: the fields this link changed. */
  edited?: Set<string>;
}

export type SheetField =
  | 'title'
  | 'plan_start'
  | 'plan_end'
  | 'plan_wd'
  | 'progress'
  | 'status'
  | 'deviation'
  | 'projected_end'
  | 'cause';

export interface SheetColumn {
  field: SheetField;
  label: string;
  /** Header tooltip. */
  title?: string;
  width: number;
  center?: boolean;
  /** Takes the frozen table's spare width (Neden). */
  grow?: boolean;
}

interface ColumnSpec extends Omit<SheetColumn, 'label' | 'title'> {
  label: [string, string];
  title?: [string, string];
}

const COLUMN_SPECS: ColumnSpec[] = [
  { field: 'title', label: ['Görev', 'Task'], width: 220 },
  { field: 'plan_start', label: ['Plan başl.', 'Plan start'], width: 84, center: true },
  { field: 'plan_end', label: ['Plan bitiş', 'Plan end'], width: 84, center: true },
  {
    field: 'plan_wd',
    label: ['Süre', 'Days'],
    width: 52,
    center: true,
    title: ['Plan penceresinin iş günü uzunluğu', 'Length of the plan window in working days'],
  },
  {
    field: 'progress',
    label: ['İlerleme', 'Progress'],
    width: 124,
    title: [
      'Gerçekleşen ilerleme; açık renk plana göre bugün beklenen',
      'Actual progress; the light fill is what the plan expects today',
    ],
  },
  { field: 'status', label: ['Durum', 'Status'], width: 110, center: true },
  {
    field: 'deviation',
    label: ['Sapma', 'Deviation'],
    width: 92,
    center: true,
    title: [
      'Plana göre iş günü: + geride, − önde; "zincir" = önceki görev geç bitirdiği için',
      'Working days against the plan: + behind, − ahead; "chain" = because the previous task finished late',
    ],
  },
  {
    field: 'projected_end',
    label: ['Öngörülen', 'Projected'],
    width: 86,
    center: true,
    title: [
      'Plan penceresi artı sapma: bu hızla, bu malzemeyle biteceği tarih',
      'Plan window plus deviation: the end date at the current pace',
    ],
  },
  { field: 'cause', label: ['Neden', 'Reason'], width: 264, grow: true },
];

/** Every column field, in order (Görev first). */
export const SHEET_FIELDS: readonly SheetField[] = COLUMN_SPECS.map((c) => c.field);

/** The Turkish labels, for the office's column pickers (the sales team's
 *  controls stay Turkish on an English link). */
export const SHEET_COLUMN_LABELS: Record<SheetField, string> = Object.fromEntries(
  COLUMN_SPECS.map((c) => [c.field, c.label[0]]),
) as Record<SheetField, string>;

/** The sheet's columns, or the subset named by `fields` (Görev always),
 *  labelled in the sheet's language. */
export function sheetColumns(fields?: readonly string[] | null): SheetColumn[] {
  const wanted = fields && fields.length ? new Set(['title', ...fields]) : null;
  return COLUMN_SPECS.filter((c) => !wanted || wanted.has(c.field)).map((c) => ({
    ...c,
    label: tr(c.label[0], c.label[1]),
    title: c.title ? tr(c.title[0], c.title[1]) : undefined,
  }));
}

/** Width the frozen table needs for these columns, so a column subset hands
 *  the difference to the timeline. */
export function columnsWidth(columns: readonly SheetColumn[]): number {
  return Math.round(columns.reduce((sum, c) => sum + c.width, 0));
}

export function groupKeyOf(node: Pick<SheetNode, 'job_no'>): string {
  return `job-${node.job_no}`;
}

// Main tasks carry the product name as their title (every main of 293-15 is
// "LOWER SHELL"), so the department is the label; the title is added only
// when it says more than the job's own title.
export function rowLabel(row: SheetTaskRow, node: Pick<SheetNode, 'title'>): string {
  const dept = departmentName(row.department, row.department_display);
  if (row.kind === 'main') {
    const title = (row.title || '').trim();
    return title && title !== (node.title || '').trim() ? `${dept} · ${taskTitle(title)}` : dept;
  }
  return taskTitle(row.title) || dept;
}

/**
 * Grid rows (group per job, task rows beneath) from the payload. A collapsed
 * job folds its own tasks AND every sub-job under it: nodes come in DFS
 * order, so a job whose parent is hidden or collapsed is skipped whole. The
 * collapsed job's own tasks stay in the list (visibleSheetRows drops them).
 * `mainOnly` keeps the department tasks only (a customer's view, no crews).
 */
export function buildSheetRows(
  sheet: Pick<PlanSheet, 'nodes' | 'rows'>,
  collapsed: ReadonlySet<string> = new Set(),
  { mainOnly = false }: { mainOnly?: boolean } = {},
): SheetGridRow[] {
  const rows: SheetGridRow[] = [];
  const hiddenJobs = new Set<string>();
  for (const { node, rows: taskRows } of groupRows(sheet)) {
    const groupKey = groupKeyOf(node);
    if (node.parent && (hiddenJobs.has(node.parent) || collapsed.has(`job-${node.parent}`))) {
      hiddenJobs.add(node.job_no);
      continue;
    }
    const rc = node.root_cause;
    const rootCauseText = rc
      ? `${rootCauseLabel(rc)}${rc.job_no && rc.job_no !== node.job_no ? ` (${rc.job_no})` : ''}: ` +
        causeSentence({ cause: rc.cause, own_deviation_wd: rc.own_deviation_wd })
      : '';
    const targetLate = Number(node.termin_gap_wd || 0) > 0;
    rows.push({
      key: groupKey,
      kind: 'group',
      indent: Math.min(node.depth, 2),
      title: node.job_no,
      job_title: node.title,
      job_no: node.job_no,
      node,
      plan_start: node.plan_start,
      plan_end: node.plan_end,
      plan_wd: null,
      progress: node.completion_percentage,
      status: node.status,
      deviation: node.deviation_wd,
      projected_start: node.projected_start,
      projected_end: node.projected_end,
      cause: rootCauseText,
      job_target: node.termin,
      job_target_late: targetLate,
      job_target_delta_wd: node.termin_gap_wd,
      late_count: node.late_count,
      collapsed: collapsed.has(groupKey),
    });
    for (const r of taskRows) {
      if (mainOnly && r.depth > 0) continue;
      rows.push({
        key: r.key,
        groupKey,
        kind: 'task',
        indent: Math.min(1 + r.depth, 4),
        title: rowLabel(r, node),
        job_no: r.job_no,
        node,
        row: r,
        plan_start: r.plan_start,
        plan_end: r.plan_end,
        plan_wd: r.plan_wd,
        progress: r.progress_pct,
        status: r.status,
        deviation: r.deviation_wd,
        projected_start: r.projected_start,
        projected_end: r.projected_end,
        // What the Neden cell shows, so an editable link's editor opens on
        // it (and can clear it) instead of on nothing.
        cause: causeSentence(r),
        job_target: node.termin,
        job_target_late: targetLate,
      });
    }
  }
  return rows;
}

/** Rows hidden inside a collapsed group dropped: the canvas height and the
 *  today line depend on the real row count. */
export function visibleSheetRows(rows: readonly SheetGridRow[], collapsed: ReadonlySet<string>): SheetGridRow[] {
  return rows.filter((r) => !(r.groupKey && collapsed.has(r.groupKey)));
}

export interface SheetBar {
  start: string;
  end: string;
  progress: number;
  state: BarState;
  label: string;
  title: string;
}

const clampPct = (value: unknown) => Math.max(0, Math.min(100, Number(value || 0)));

/** The plan bar of a row (the forecast, outlined, when nobody entered a plan). */
export function rowBar(row: SheetGridRow): SheetBar | null {
  if (row.kind === 'task' && row.row?.dead) return null;
  let start = row.plan_start;
  let end = row.plan_end;
  // Nobody entered a plan for this row: the forecast takes its place,
  // outlined instead of solid and with no deviation tail. Leaving the row
  // bare would hide work that is still very much scheduled.
  const projectedOnly = !start && !end && !!row.projected_end;
  if (projectedOnly) {
    start = row.projected_start || row.projected_end;
    end = row.projected_end;
  }
  if (!start || !end || end < start) return null;
  if (projectedOnly) {
    return {
      start,
      end,
      progress: clampPct(row.progress),
      state: 'projected',
      label: row.title,
      title:
        `${row.title} · ${tr('plan girilmemiş', 'no plan entered')}` +
        ` · ${tr('öngörülen', 'projected')} ${fmtDateTr(start)} – ${fmtDateTr(end)}`,
    };
  }
  // An edited deviation or status is the sales team's word over the computed
  // one, so the bar reads from the row like a job row does.
  const edited = !!row.edited && (row.edited.has('deviation') || row.edited.has('status'));
  const state: BarState =
    row.kind === 'group' || edited
      ? row.status === 'completed'
        ? 'done'
        : row.status === 'on_hold'
          ? 'hold'
          : Number(row.deviation || 0) > 0
            ? 'late'
            : 'on-time'
      : barState(row.row, row.node);
  const projected = row.projected_end;
  const deviates = !!projected && projected !== end;
  const dev = Number(row.deviation || 0);
  const signed = `${dev > 0 ? '+' : ''}${dev}`;
  const title =
    `${row.title} · plan ${fmtDateTr(start)} – ${fmtDateTr(end)}` +
    (deviates
      ? ` · ${tr('öngörülen', 'projected')} ${fmtDateTr(projected)} (${signed} ${tr('iş günü', 'working days')})`
      : '');
  return { start, end, progress: clampPct(row.progress), state, label: row.title, title };
}

/** The plan bar widened to the projected end: what the timeline's domain
 *  sees, so a projection tail never runs off the lane. */
export function domainBar(row: SheetGridRow): BarSpan | null {
  const bar = rowBar(row);
  if (!bar || !row.projected_end || row.projected_end <= bar.end) return bar;
  return { ...bar, end: row.projected_end };
}

// ---- editable links ---------------------------------------------------------
//
// A sales link (PlanSheetShareLink.editable) lets every cell be changed
// before the PDF is printed. The edits are overrides keyed by row key
// ("task:12", "job-009-37") and field; they sit on top of the computed rows
// and never reach the plan itself.

export type EditType = 'text' | 'date' | 'number' | 'select';

export const EDIT_TYPES: Record<SheetField, EditType> = {
  title: 'text',
  plan_start: 'date',
  plan_end: 'date',
  plan_wd: 'number',
  progress: 'number',
  status: 'select',
  deviation: 'number',
  projected_end: 'date',
  cause: 'text',
};

export const NUMBER_FIELDS: ReadonlySet<string> = new Set(['plan_wd', 'progress', 'deviation']);

/** The status editor's choices (Aktif and Taslak are job states, not task ones). */
export const STATUS_OPTIONS = Object.entries(STATUS_META)
  .filter(([value]) => !['active', 'draft'].includes(value))
  .map(([value, meta]) => ({ value, label: meta.label }));

/** The override field an edit of `field` on `row` lands in: a job row's
 *  Görev cell edits the job's name. */
export function overrideFieldOf(row: Pick<SheetGridRow, 'kind'>, field: string): string {
  return row.kind === 'group' && field === 'title' ? 'job_title' : field;
}

/** Rows with the link's edits laid over them; `base` keeps the computed row
 *  so an edit back to the original can drop the override. */
export function applyRowOverrides(
  rows: readonly SheetGridRow[],
  overrides: RowOverrides | null | undefined,
): SheetGridRow[] {
  if (!overrides) return rows as SheetGridRow[];
  return rows.map((row) => {
    const fields = overrides[row.key];
    if (!fields || !Object.keys(fields).length) return { ...row, base: row };
    return { ...row, ...fields, base: row, edited: new Set(Object.keys(fields)) } as SheetGridRow;
  });
}
