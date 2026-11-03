/**
 * The plan sheet payload: GET /projects/job-orders/{job_no}/plan-sheet/ (the
 * office) and the `sheet` of GET /projects/plan-sheet/shared/{token}/ (a share
 * link). Only the fields the sheet reads are typed.
 */

/** Why a row is behind; `code` picks the sentence (planSheetText causeSentence). */
export interface SheetCause {
  code?: string | null;
  what?: string | null;
  pending?: number | null;
  unordered?: number | null;
  until?: string | null;
  overdue?: boolean | null;
  count?: number | null;
  plan_end?: string | null;
  unplanned_cuts?: number | null;
  late_start_wd?: number | null;
  progress?: number | null;
  expected?: number | null;
  /** The crew or subcontractor the cause comes from ("SERHAN USTA"). */
  via?: string | null;
}

/** The row a job's (or the whole sheet's) delay is traced back to. */
export interface SheetRootCause {
  kind?: string | null;
  title?: string | null;
  department?: string | null;
  department_display?: string | null;
  job_no?: string | null;
  cause?: SheetCause | null;
  own_deviation_wd?: number | null;
}

/** One job order of the subtree, depth-first. */
export interface SheetNode {
  job_no: string;
  parent?: string | null;
  depth: number;
  title?: string | null;
  status?: string | null;
  plan_start?: string | null;
  plan_end?: string | null;
  projected_start?: string | null;
  projected_end?: string | null;
  completion_percentage?: number | null;
  deviation_wd?: number | null;
  termin?: string | null;
  termin_gap_wd?: number | null;
  late_count?: number | null;
  root_cause?: SheetRootCause | null;
}

/** One department task (or a crew / stage under it). */
export interface SheetTaskRow {
  key: string;
  job_no: string;
  depth: number;
  /** main | phase | block | stage | ... */
  kind?: string | null;
  role?: string | null;
  department?: string | null;
  department_display?: string | null;
  title?: string | null;
  status?: string | null;
  plan_start?: string | null;
  plan_end?: string | null;
  plan_wd?: number | null;
  projected_start?: string | null;
  projected_end?: string | null;
  progress_pct?: number | null;
  expected_pct?: number | null;
  deviation_wd?: number | null;
  own_deviation_wd?: number | null;
  chain_deviation_wd?: number | null;
  cause?: SheetCause | null;
  pushed_by_title?: string | null;
  /** Skipped or cancelled: the work was not done. */
  dead?: boolean | null;
  done?: boolean | null;
  plan_source?: string | null;
  duration_source?: string | null;
}

export interface SheetSummary {
  rows?: number;
  late_rows?: number;
  own_late_rows?: number;
  chain_only_rows?: number;
  default_duration_rows?: number;
  unplanned_rows?: number;
}

export interface SheetHoliday {
  date: string;
  is_half_day?: boolean;
}

export interface SheetJobOrder {
  job_no?: string | null;
  title?: string | null;
  customer_name?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface PlanSheet {
  job_order?: SheetJobOrder | null;
  today?: string | null;
  termin?: string | null;
  plan_end?: string | null;
  projected_end?: string | null;
  deviation_wd?: number | null;
  termin_gap_wd?: number | null;
  plan_vs_termin_wd?: number | null;
  root_cause?: SheetRootCause | null;
  nodes?: SheetNode[];
  rows?: SheetTaskRow[];
  holidays?: SheetHoliday[];
  summary?: SheetSummary | null;
}

/** An editable link's edits: row key → field → value. */
export type RowOverrides = Record<string, Record<string, unknown>>;

/** Header edits on an editable link (absent key = the computed value). */
export interface HeaderOverrides {
  job_no?: string | null;
  title?: string | null;
  customer_name?: string | null;
  start?: string | null;
  termin?: string | null;
  plan_end?: string | null;
  projected_end?: string | null;
  plan_vs_termin_wd?: number | null;
  deviation_wd?: number | null;
  termin_gap_wd?: number | null;
  note?: string;
}

/** The print choices made on an editable link. */
export interface ViewChoices {
  /** [] = every column. */
  columns?: string[];
  show_header?: boolean;
  main_only?: boolean;
  expand_all?: boolean;
  language?: 'tr' | 'en';
}

export interface LinkOverrides {
  rows?: RowOverrides;
  header?: HeaderOverrides;
  view?: ViewChoices;
}

export interface PlanSheetLinkOptions {
  main_only?: boolean;
  show_header?: boolean;
  language?: string | null;
  expand_all?: boolean;
  collapsed?: string[];
}

/** PlanSheetShareLink as the public endpoint returns it. */
export interface PlanSheetLink {
  expires_at?: string | null;
  columns?: string[] | null;
  options?: PlanSheetLinkOptions | null;
  editable?: boolean;
  overrides?: LinkOverrides | null;
}

export interface SharedPlanSheet {
  link?: PlanSheetLink | null;
  sheet: PlanSheet;
}
