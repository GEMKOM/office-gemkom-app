import type { DepartmentTask } from '@/api/projects/departmentTasks';
import type { JobOrder } from '@/api/projects/jobOrders';

// The list's rows: root job orders with their expanded children, department
// tasks and subtasks merged in below them (legacy mergeExpandedChildren /
// mergeDepartmentTaskRows in jobOrderList.js).

export type JobRow = JobOrder & { _kind: 'job'; hierarchy_level: number };
export type TaskRow = DepartmentTask & { _kind: 'task'; _parentJobNo: string; hierarchy_level: number };
export type TrackingRow = JobRow | TaskRow;

export const isTaskRow = (row: TrackingRow): row is TaskRow => row._kind === 'task';

export function rowId(row: TrackingRow): string {
  return isTaskRow(row) ? `dept-task-${row.id}` : `job-${row.job_no}`;
}

/** A "completed" job below 100 % is shown as active again. */
export function normalizeJobOrderStatus<T extends JobOrder>(jobOrder: T): T {
  const completion = Number(jobOrder.completion_percentage);
  if (jobOrder.status === 'completed' && !Number.isNaN(completion) && completion < 100) {
    return { ...jobOrder, status: 'active' };
  }
  return jobOrder;
}

/** A production phase mirror (e.g. 270-01/P1). */
export function isPhaseJobRow(row: JobOrder): boolean {
  return Boolean(row.is_phase_job || row.source_job_order);
}

export interface MergeSources {
  /** "Tüm İşler (Ana + Alt)": the list already holds children, so they are not merged again. */
  showAll: boolean;
  hidePhases: boolean;
  expandedChildren: ReadonlySet<string>;
  expandedTasks: ReadonlySet<string>;
  expandedSubtasks: ReadonlySet<number>;
  children: (jobNo: string) => JobOrder[] | undefined;
  tasks: (jobNo: string) => DepartmentTask[] | undefined;
  subtasks: (taskId: number) => DepartmentTask[] | undefined;
}

function mergeTasks(
  tasks: DepartmentTask[],
  parentJobNo: string,
  level: number,
  src: MergeSources,
  out: TrackingRow[],
) {
  for (const task of tasks) {
    out.push({ ...task, _kind: 'task', _parentJobNo: parentJobNo, hierarchy_level: level });
    if (src.expandedSubtasks.has(task.id)) {
      mergeTasks(src.subtasks(task.id) ?? [], parentJobNo, level + 1, src, out);
    }
  }
}

function mergeJobs(jobs: JobOrder[], level: number, src: MergeSources, out: TrackingRow[]) {
  for (const raw of jobs) {
    if (src.hidePhases && isPhaseJobRow(raw)) continue;
    const job = normalizeJobOrderStatus(raw);
    const rowLevel = src.showAll ? (job.hierarchy_level ?? 0) : level;
    out.push({ ...job, _kind: 'job', hierarchy_level: rowLevel });
    if (!src.showAll && src.expandedChildren.has(job.job_no)) {
      mergeJobs(src.children(job.job_no) ?? [], level + 1, src, out);
    }
    if (src.expandedTasks.has(job.job_no)) {
      mergeTasks(src.tasks(job.job_no) ?? [], job.job_no, rowLevel + 1, src, out);
    }
  }
}

export function mergeRows(roots: JobOrder[], src: MergeSources): TrackingRow[] {
  const out: TrackingRow[] = [];
  mergeJobs(roots, 0, src, out);
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days from today to the date (negative when past). */
export function daysUntil(value: string, today = new Date()): number {
  return Math.ceil((startOfDay(new Date(value)).getTime() - startOfDay(today).getTime()) / DAY_MS);
}

/**
 * Row tint: red past due, yellow due within a week. Completed jobs never
 * look late.
 */
export function dueTone(row: JobOrder, today = new Date()): 'past-due' | 'due-soon' | null {
  if (!row.target_completion_date || row.status === 'completed') return null;
  const days = daysUntil(row.target_completion_date, today);
  if (days < 0) return 'past-due';
  if (days <= 7) return 'due-soon';
  return null;
}

// ---------------------------------------------------------------------------
// Adaptive widths (legacy applyAdaptiveCompactColumnConfig)
// ---------------------------------------------------------------------------

const FIT_PROFILES = {
  _expand: { normal: 64, min: 20 },
  job_no: { normal: 160, min: 100 },
  title: { normal: 260, min: 120 },
  customer_name: { normal: 180, min: 78 },
  target_completion_date: { normal: 130, min: 96 },
  completion_percentage: { normal: 240, min: 108 },
  _projected_completion: { normal: 190, min: 104 },
} as const;

export type FitField = keyof typeof FIT_PROFILES;

const FIT_LEVEL_STEPS = 8;

export interface Fit {
  /** 0 = normal widths, 1 = minimum widths, in 1/8 steps. */
  level: number;
  tight: boolean;
  ultra: boolean;
  widths: Record<FitField, number>;
  actionsWidth: number;
}

/**
 * Column widths that fit the table's viewport. Snapped to eighths so a
 * resize only re-renders on a real step change.
 */
export function computeFit(viewportWidth: number, hideActions: boolean): Fit {
  const fields = Object.keys(FIT_PROFILES) as FitField[];
  const action = hideActions ? { normal: 58, min: 48 } : { normal: 88, min: 72 };
  const totalNormal = fields.reduce((s, f) => s + FIT_PROFILES[f].normal, 0) + action.normal;
  const totalMin = fields.reduce((s, f) => s + FIT_PROFILES[f].min, 0) + action.min;
  const target = Math.max(320, viewportWidth - 36);
  const raw = viewportWidth > 0 ? Math.max(0, Math.min(1, (totalNormal - target) / Math.max(1, totalNormal - totalMin))) : 0;
  const level = Math.round(raw * FIT_LEVEL_STEPS) / FIT_LEVEL_STEPS;
  const width = (p: { normal: number; min: number }) =>
    Math.max(p.min, Math.round(p.normal - (p.normal - p.min) * level));
  const widths = Object.fromEntries(fields.map((f) => [f, width(FIT_PROFILES[f])])) as Record<FitField, number>;
  return { level, tight: level > 0.22, ultra: level > 0.55, widths, actionsWidth: width(action) };
}
