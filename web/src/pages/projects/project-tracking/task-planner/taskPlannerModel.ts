import type {
  BulkPlanDependency,
  BulkPlanPayload,
  BulkPlanTask,
} from '@/api/projects/departmentTasks';

/**
 * Görev Planlama: plan state for the project-tracking "Görev Ekle" modal
 * (port of projects/project-tracking/taskPlannerModel.js).
 *
 * A *plan* is the list of NEW department tasks one job order gets when the
 * modal is saved. The modal keeps one plan per job order in the subtree and
 * sends all of them in a single request (POST /department-tasks/bulk_plan/).
 *
 * Rows point at each other by a stable `key`, never by array position.
 * Every function is pure: it returns new arrays and never mutates its input.
 */

export interface PlanRow {
  key: string;
  department: string;
  title: string;
  sequence: number;
  weight: number;
  task_type: string | null;
  description: string;
  parentKey: string | null;
  dependsOn: string[];
  templateId: number | string | null;
}

/** A row of `job_orders` from GET /projects/job-orders/{no}/task-planner/. */
export interface PlannerTask {
  id?: number;
  title?: string | null;
  department?: string;
  department_display?: string;
  sequence?: number | null;
  status?: string;
  status_display?: string;
  subtask_count?: number | null;
}

export interface PlannerJob {
  job_no: string;
  title?: string | null;
  depth: number;
  status: string;
  status_display?: string;
  is_phase?: boolean;
  can_plan: boolean;
  tasks: PlannerTask[];
}

export interface TaskPlannerTree {
  job_orders?: PlannerJob[];
}

/** The parts of a task template (GET /task-templates/{id}/) the planner reads. */
export interface TemplateSourceChild {
  id?: number;
  title?: string | null;
  sequence?: number | null;
  weight?: number | null;
  task_type?: string | null;
  description?: string | null;
}

export interface TemplateSourceItem extends TemplateSourceChild {
  id: number;
  department?: string | null;
  parent?: number | null;
  depends_on?: number[] | null;
  children?: TemplateSourceChild[] | null;
}

export interface TemplateSource {
  id: number | string;
  name?: string;
  items?: TemplateSourceItem[] | null;
}

export type Plans = ReadonlyMap<string, readonly PlanRow[]>;

let keyCounter = 0;

export function newRowKey(): string {
  keyCounter += 1;
  return `r${keyCounter}`;
}

const bySequence = (a: { sequence?: number | null }, b: { sequence?: number | null }) =>
  (a.sequence || 0) - (b.sequence || 0);

/** parseInt over whatever the row holds (legacy parseInt(value, 10)). */
const toInt = (value: unknown) => parseInt(String(value), 10);

/** Highest main-task sequence across the job's saved tasks and its plan. */
export function nextSequenceBase(
  rows: readonly PlanRow[],
  existingTasks: readonly { sequence?: number | null }[] = [],
): number {
  let max = 0;
  existingTasks.forEach((t) => {
    max = Math.max(max, t.sequence || 0);
  });
  rows.forEach((r) => {
    if (!r.parentKey) max = Math.max(max, r.sequence || 0);
  });
  return max;
}

/**
 * Turn a template (main items with `children` nested and `depends_on` as item
 * ids) into fresh rows. Main rows are pushed past `sequenceBase` so they line
 * up after what the job already has.
 */
export function rowsFromTemplate(
  template: TemplateSource | null | undefined,
  { sequenceBase = 0 }: { sequenceBase?: number } = {},
): PlanRow[] {
  if (!template) return [];
  const mains = (template.items || [])
    .filter((item) => item.parent === null || item.parent === undefined)
    .slice()
    .sort(bySequence);
  const keyByItemId = new Map(mains.map((item) => [item.id, newRowKey()]));
  const rows: PlanRow[] = [];

  mains.forEach((item, index) => {
    const key = keyByItemId.get(item.id)!;
    const department = item.department ?? '';
    rows.push({
      key,
      department,
      title: item.title || '',
      sequence: sequenceBase + (item.sequence || index + 1),
      weight: item.weight || 10,
      task_type: item.task_type || null,
      description: item.description || '',
      parentKey: null,
      dependsOn: (item.depends_on || [])
        .map((id) => keyByItemId.get(id))
        .filter((k): k is string => Boolean(k)),
      templateId: template.id,
    });
    (item.children || [])
      .slice()
      .sort(bySequence)
      .forEach((child, childIndex) => {
        rows.push({
          key: newRowKey(),
          department,
          title: child.title || '',
          sequence: child.sequence || childIndex + 1,
          weight: child.weight || 10,
          task_type: child.task_type || null,
          description: child.description || '',
          parentKey: key,
          dependsOn: [],
          templateId: template.id,
        });
      });
  });
  return rows;
}

/** Copy rows with fresh keys (parent / dependency links follow along). */
export function cloneRows(
  rows: readonly PlanRow[],
  { sequenceBase = 0 }: { sequenceBase?: number } = {},
): PlanRow[] {
  const keyMap = new Map(rows.map((r) => [r.key, newRowKey()]));
  const mainSeqs = rows.filter((r) => !r.parentKey).map((r) => r.sequence || 0);
  const shift = sequenceBase - (mainSeqs.length ? Math.min(...mainSeqs) - 1 : 0);
  return rows.map((r) => ({
    ...r,
    key: keyMap.get(r.key)!,
    sequence: r.parentKey ? r.sequence : Math.max(1, (r.sequence || 0) + shift),
    parentKey: r.parentKey ? keyMap.get(r.parentKey) || null : null,
    dependsOn: (r.dependsOn || []).map((k) => keyMap.get(k)).filter((k): k is string => Boolean(k)),
  }));
}

export function newMainRow(
  rows: readonly PlanRow[],
  existingTasks: readonly { sequence?: number | null }[],
  department: string,
  departmentLabel: string,
): PlanRow {
  return {
    key: newRowKey(),
    department,
    title: departmentLabel || '',
    sequence: nextSequenceBase(rows, existingTasks) + 1,
    weight: 10,
    task_type: null,
    description: '',
    parentKey: null,
    dependsOn: [],
    templateId: null,
  };
}

export function newSubRow(rows: readonly PlanRow[], parentKey: string): PlanRow {
  const parent = rows.find((r) => r.key === parentKey);
  const siblings = rows.filter((r) => r.parentKey === parentKey);
  return {
    key: newRowKey(),
    department: parent ? parent.department : '',
    title: '',
    sequence: siblings.reduce((max, r) => Math.max(max, r.sequence || 0), 0) + 1,
    weight: 10,
    task_type: null,
    description: '',
    parentKey,
    dependsOn: [],
    templateId: parent ? parent.templateId : null,
  };
}

/** The key and every key below it. */
function subtreeKeys(rows: readonly PlanRow[], key: string): Set<string> {
  const keys = new Set([key]);
  let grew = true;
  while (grew) {
    grew = false;
    rows.forEach((r) => {
      if (r.parentKey && keys.has(r.parentKey) && !keys.has(r.key)) {
        keys.add(r.key);
        grew = true;
      }
    });
  }
  return keys;
}

/** Drop a row and everything under it; scrub it from other rows' dependencies. */
export function removeRow(rows: readonly PlanRow[], key: string): PlanRow[] {
  const doomed = subtreeKeys(rows, key);
  return rows
    .filter((r) => !doomed.has(r.key))
    .map((r) => {
      const dependsOn = (r.dependsOn || []).filter((k) => !doomed.has(k));
      return dependsOn.length === (r.dependsOn || []).length ? r : { ...r, dependsOn };
    });
}

/** A subtask always belongs to its parent's department (the backend enforces it too). */
export function setRowDepartment(
  rows: readonly PlanRow[],
  key: string,
  department: string,
): PlanRow[] {
  const descendants = subtreeKeys(rows, key);
  return rows.map((r) => (descendants.has(r.key) ? { ...r, department } : r));
}

/** Mains by sequence, each followed by its subtasks (depth-first). Stable. */
export function displayOrder(rows: readonly PlanRow[]): { row: PlanRow; depth: number }[] {
  const childrenOf = new Map<string, { r: PlanRow; index: number }[]>();
  rows.forEach((r, index) => {
    const bucket = r.parentKey || '';
    if (!childrenOf.has(bucket)) childrenOf.set(bucket, []);
    childrenOf.get(bucket)!.push({ r, index });
  });
  const out: { row: PlanRow; depth: number }[] = [];
  const walk = (parentKey: string, depth: number) => {
    const kids = (childrenOf.get(parentKey) || [])
      .slice()
      .sort((a, b) => bySequence(a.r, b.r) || a.index - b.index);
    kids.forEach(({ r }) => {
      out.push({ row: r, depth });
      walk(r.key, depth + 1);
    });
  };
  walk('', 0);
  return out;
}

export function planHasTemplate(rows: readonly PlanRow[], templateId: number | string): boolean {
  return rows.some((r) => String(r.templateId) === String(templateId));
}

export interface PlanProblem {
  key: string;
  message: string;
}

/** Problems that would make the save fail, phrased for the user. */
export function validatePlan(rows: readonly PlanRow[]): PlanProblem[] {
  const problems: PlanProblem[] = [];
  rows.forEach((r) => {
    if (!r.parentKey && !r.department) problems.push({ key: r.key, message: 'Departman seçilmedi' });
    if (r.parentKey && !(r.title || '').trim()) {
      problems.push({ key: r.key, message: 'Alt görev başlığı boş' });
    }
    const weight = Number(r.weight);
    if (!Number.isInteger(weight) || weight < 1) {
      problems.push({ key: r.key, message: 'Ağırlık en az 1 olmalı' });
    }
  });
  return problems;
}

/**
 * Build the bulk_plan request body. `plans` maps job_no → rows; `order` is
 * the job list order so the payload (and any error) follows the tree.
 */
export function buildBulkPlanPayload(plans: Plans, order: readonly string[]): BulkPlanPayload {
  const out: BulkPlanPayload['plans'] = [];
  order.forEach((jobNo) => {
    const rows = plans.get(jobNo) || [];
    if (rows.length === 0) return;
    const tempId = new Map(rows.map((r, i) => [r.key, -(i + 1)]));
    const tasks = rows.map((r) => {
      const task: BulkPlanTask = {
        temp_id: tempId.get(r.key)!,
        department: r.department,
        title: (r.title || '').trim(),
        sequence: toInt(r.sequence) || 1,
        weight: toInt(r.weight) || 10,
      };
      if (r.parentKey && tempId.has(r.parentKey)) task.parent = tempId.get(r.parentKey);
      if (r.task_type) task.task_type = r.task_type;
      if (r.description) task.description = r.description;
      return task;
    });
    const dependencies: BulkPlanDependency[] = rows
      .map((r) => ({
        task: tempId.get(r.key)!,
        depends_on: (r.dependsOn || [])
          .filter((k) => tempId.has(k) && k !== r.key)
          .map((k) => tempId.get(k)!),
      }))
      .filter((d) => d.depends_on.length > 0);
    out.push({ job_order: jobNo, tasks, dependencies });
  });
  return { plans: out };
}

export function summarizePlans(plans: Plans): { jobCount: number; taskCount: number } {
  let jobCount = 0;
  let taskCount = 0;
  plans.forEach((rows) => {
    if (rows.length > 0) {
      jobCount += 1;
      taskCount += rows.length;
    }
  });
  return { jobCount, taskCount };
}

/** temp_id from a bulk_plan error → the row key it came from. */
export function rowKeyForTempId(rows: readonly PlanRow[], tempId: number): string | null {
  const index = -tempId - 1;
  return rows[index] ? rows[index].key : null;
}

const SERVER_FIELD_LABELS: Record<string, string> = {
  department: 'Departman',
  title: 'Başlık',
  weight: 'Ağırlık',
  sequence: 'Sıra',
  task_type: 'Görev tipi',
  description: 'Açıklama',
};

/** A bulk_plan error body (`message`/`detail` + `errors` per field) as one line. */
export function formatServerError(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const body = data as Record<string, unknown>;
  let message = String(body.message || body.detail || '');
  if (body.errors && typeof body.errors === 'object') {
    const parts = Object.entries(body.errors as Record<string, unknown>).map(([field, value]) => {
      const text = Array.isArray(value) ? value.join(' ') : String(value);
      return `${SERVER_FIELD_LABELS[field] || field}: ${text}`;
    });
    if (parts.length) message = `${message} ${parts.join('; ')}`.trim();
  }
  return message;
}
