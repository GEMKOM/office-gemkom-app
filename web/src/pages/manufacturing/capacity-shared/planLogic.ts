// Pure plan edits of the capacity planners, ported from
// manufacturing/{cnc-cutting,linear-cutting,machining}/capacity/planning/planning.js.
// Each edit returns patches (key -> changed fields); the page keeps them in a
// draft over the server rows until "Planı Kaydet". See planLogic.test.ts.

import type {
  CuttingPlanSaveItem,
  CuttingPlanTask,
  MachiningPlanOperation,
  MachiningPlanSaveItem,
} from '@/api/manufacturing/capacityPlanning';
import type { ColumnEditor } from '@/ui';
import { localDateKey, parseClock, type MachineCalendar } from '@/ui/Gantt';

export type Patches<T> = Map<string, Partial<T>>;

interface Keyed {
  key: string;
}

/** Server rows with the draft applied; untouched rows keep their identity. */
export function applyOverrides<T extends Keyed>(
  rows: readonly T[],
  overrides: ReadonlyMap<string, Partial<T>>,
): T[] {
  if (overrides.size === 0) return rows as T[];
  return rows.map((row) => {
    const patch = overrides.get(row.key);
    return patch ? { ...row, ...patch } : row;
  });
}

/** Two field values are the same plan (null and undefined are both "unset"). */
export function sameValue(a: unknown, b: unknown): boolean {
  return a === b || (a == null && b == null);
}

/**
 * Merges `patches` into `overrides`, dropping fields that are back at the
 * server value, so undoing an edit leaves nothing to save.
 */
export function mergeOverrides<T extends Keyed>(
  overrides: ReadonlyMap<string, Partial<T>>,
  patches: ReadonlyMap<string, Partial<T>>,
  base: ReadonlyMap<string, T>,
): Map<string, Partial<T>> {
  const next = new Map(overrides);
  for (const [key, patch] of patches) {
    const merged: Partial<T> = { ...next.get(key), ...patch };
    const original = base.get(key);
    for (const field of Object.keys(merged) as (keyof T)[]) {
      if (original && sameValue(merged[field], original[field])) delete merged[field];
    }
    if (Object.keys(merged).length) next.set(key, merged);
    else next.delete(key);
  }
  return next;
}

function byPlanOrder<T extends { plan_order?: number | null }>(a: T, b: T): number {
  return (a.plan_order || 0) - (b.plan_order || 0);
}

function hours(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Queue order (drag in the table, or type a new "Sıra")

/**
 * `keys` with `key` moved to place `position` (1-based): the rows in between
 * shift by one, so places stay 1..n. Out-of-range places clamp to the first
 * or last; a position that is not a number changes nothing.
 */
export function moveToPosition(keys: readonly string[], key: string, position: number): string[] {
  if (!keys.includes(key) || !Number.isFinite(position)) return [...keys];
  const rest = keys.filter((k) => k !== key);
  const at = Math.min(Math.max(Math.trunc(position), 1), keys.length) - 1;
  rest.splice(at, 0, key);
  return rest;
}

/** plan_order 1..n in the order of `keys`, for the rows whose number changes. */
export function renumber<T extends Keyed & { plan_order?: number | null }>(
  rows: readonly T[],
  keys: readonly string[],
): Patches<T> {
  const current = new Map(rows.map((r) => [r.key, r.plan_order]));
  const patches: Patches<T> = new Map();
  keys.forEach((key, i) => {
    if (current.get(key) !== i + 1) patches.set(key, { plan_order: i + 1 } as Partial<T>);
  });
  return patches;
}

/**
 * The "Sıra" cell editor: a whole number from 1 to `max(row)` (the queue
 * length, or one more for a row that would join the queue).
 */
export function orderEditor<T>(max: (row: T) => number): ColumnEditor<T> {
  return {
    type: 'number',
    validate: (value, row) => {
      const last = max(row);
      return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= last
        ? true
        : `1 ile ${last} arasında bir sıra girin`;
    },
  };
}

// ---------------------------------------------------------------------------
// Cutting planners (CNC, linear)

const CUTTING_FIELDS = [
  'in_plan',
  'plan_order',
  'planned_start_ms',
  'planned_end_ms',
  'plan_locked',
] as const;

/** Rows whose plan differs from the server (legacy getChangedTasks). */
export function changedCuttingTasks(
  base: readonly CuttingPlanTask[],
  current: readonly CuttingPlanTask[],
): CuttingPlanTask[] {
  const originals = new Map(base.map((t) => [t.key, t]));
  const changed: CuttingPlanTask[] = [];
  for (const task of current) {
    const original = originals.get(task.key);
    if (!original) {
      if (task.in_plan) changed.push(task);
      continue;
    }
    if (CUTTING_FIELDS.some((f) => !sameValue(task[f], original[f]))) changed.push(task);
  }
  return changed;
}

/**
 * The bulk-save items exactly as legacy savePlan builds them: planned rows
 * send what they have (truthy dates / order, machine, name, lock), removed
 * rows send `in_plan: false` only.
 */
export function cuttingSaveItems(
  base: readonly CuttingPlanTask[],
  current: readonly CuttingPlanTask[],
): CuttingPlanSaveItem[] {
  const originals = new Map(base.map((t) => [t.key, t]));
  return changedCuttingTasks(base, current).map((task) => {
    const original = originals.get(task.key);
    if (!task.in_plan || (original?.in_plan && !task.in_plan))
      return { key: task.key, in_plan: false };
    const item: CuttingPlanSaveItem = { key: task.key, in_plan: true };
    if (task.machine_fk) item.machine_fk = task.machine_fk;
    if (task.name) item.name = task.name;
    if (task.planned_start_ms) item.planned_start_ms = task.planned_start_ms;
    if (task.planned_end_ms) item.planned_end_ms = task.planned_end_ms;
    if (task.plan_order) item.plan_order = task.plan_order;
    if (task.plan_locked !== undefined) item.plan_locked = Boolean(task.plan_locked);
    return item;
  });
}

/**
 * Moves a planned row before/after another and renumbers every planned row
 * 1..n (legacy reorderTasks). Legacy computed the same index for "before"
 * and "after"; this puts it where the drop line shows.
 */
export function reorderCutting(
  tasks: readonly CuttingPlanTask[],
  dragKey: string,
  targetKey: string,
  position: 'before' | 'after',
): Patches<CuttingPlanTask> {
  const planned = tasks.filter((t) => t.in_plan).sort(byPlanOrder);
  const from = planned.findIndex((t) => t.key === dragKey);
  if (from < 0 || dragKey === targetKey || !planned.some((t) => t.key === targetKey))
    return new Map();
  const [dragged] = planned.splice(from, 1);
  const target = planned.findIndex((t) => t.key === targetKey);
  planned.splice(position === 'before' ? target : target + 1, 0, dragged!);
  return new Map(planned.map((t, i) => [t.key, { plan_order: i + 1 }]));
}

/**
 * Moves a planned row to place `position` of `queue` (the planned rows as the
 * table shows them); the others shift and every row is renumbered 1..n.
 */
export function moveInQueue(
  queue: readonly CuttingPlanTask[],
  key: string,
  position: number,
): Patches<CuttingPlanTask> {
  if (!queue.some((t) => t.key === key)) return new Map();
  return renumber(
    queue,
    moveToPosition(
      queue.map((t) => t.key),
      key,
      position,
    ),
  );
}

/**
 * "Görev Düzenle": the fields as given; a new "Sıra" moves the row in the
 * queue instead of copying the number (legacy could leave two rows on one
 * place). An emptied "Sıra" keeps the row where it is.
 */
export function editPlannedTask(
  queue: readonly CuttingPlanTask[],
  key: string,
  values: Pick<
    Partial<CuttingPlanTask>,
    'planned_start_ms' | 'planned_end_ms' | 'plan_order' | 'plan_locked'
  >,
): Patches<CuttingPlanTask> {
  const { plan_order: order, ...fields } = values;
  const patches: Patches<CuttingPlanTask> = new Map([[key, { ...fields }]]);
  if (order != null) {
    for (const [k, patch] of moveInQueue(queue, key, order))
      patches.set(k, { ...patches.get(k), ...patch });
  }
  return patches;
}

/** "Plana Ekle": last in the queue, unlocked, no dates. */
export function addToPlan(
  tasks: readonly CuttingPlanTask[],
  key: string,
): Patches<CuttingPlanTask> {
  const maxOrder = Math.max(0, ...tasks.filter((t) => t.in_plan).map((t) => t.plan_order || 0));
  return new Map([
    [
      key,
      {
        in_plan: true,
        plan_order: maxOrder + 1,
        plan_locked: false,
        planned_start_ms: null,
        planned_end_ms: null,
      },
    ],
  ]);
}

/** "Plandan Çıkar". */
export function removeFromPlan(key: string): Patches<CuttingPlanTask> {
  return new Map([
    [
      key,
      {
        in_plan: false,
        plan_order: null,
        planned_start_ms: null,
        planned_end_ms: null,
        plan_locked: false,
      },
    ],
  ]);
}

// ---- autoschedule (legacy confirmAutoschedule, client side) ----

type Calendar = Pick<MachineCalendar, 'week_template' | 'work_exceptions'> | null | undefined;

function calendarDay(date: Date): number {
  return (date.getDay() + 6) % 7; // 0 = Monday
}

/**
 * The windows of a day. As in legacy, only a closed exception (no windows)
 * overrides the week template; an exception with windows is ignored. Legacy
 * compared toISOString() dates (the UTC day); the local day is meant.
 */
function windowsFor(date: Date, calendar: NonNullable<Calendar>) {
  const closed = calendar.work_exceptions?.some(
    (ex) => ex.date === localDateKey(date) && ex.windows.length === 0,
  );
  return closed ? [] : (calendar.week_template?.[String(calendarDay(date))] ?? []);
}

function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function inWindow(
  minutes: number,
  windows: readonly { start: string; end: string; end_next_day?: boolean }[],
) {
  return windows.some((w) => {
    const start = parseClock(w.start);
    const end = parseClock(w.end);
    return w.end_next_day ? minutes >= start || minutes <= end : minutes >= start && minutes <= end;
  });
}

/** The first working moment at or after `start` (legacy getNextWorkingTime). */
export function nextWorkingTime(start: Date, calendar: Calendar): Date {
  if (!calendar?.week_template) return start;
  const current = new Date(start);
  for (let attempts = 0; attempts < 365; attempts++) {
    const windows = windowsFor(current, calendar);
    if (windows.length > 0) {
      const minutes = minutesOf(current);
      if (inWindow(minutes, windows)) return current;
      const next = windows.find((w) => parseClock(w.start) > minutes);
      if (next) {
        const [h, m] = next.start.split(':').map(Number);
        current.setHours(h ?? 0, m ?? 0, 0, 0);
        return current;
      }
    }
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  return start;
}

/** When `durationMs` of working time from `start` ends (legacy getWorkingTimeEnd). */
export function workingTimeEnd(start: Date, durationMs: number, calendar: Calendar): Date {
  if (!calendar?.week_template) return new Date(start.getTime() + durationMs);
  const current = new Date(start);
  let remaining = durationMs;
  for (let attempts = 0; remaining > 0 && attempts < 365; attempts++) {
    const windows = windowsFor(current, calendar);
    if (windows.length === 0) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }
    const minutes = minutesOf(current);
    const window = windows.find(
      (w) => minutes >= parseClock(w.start) && minutes < parseClock(w.end),
    );
    if (window) {
      const available = parseClock(window.end) - minutes;
      const needed = remaining / 60_000;
      if (available >= needed) {
        const end = minutes + needed;
        current.setHours(Math.floor(end / 60), Math.floor(end % 60), 0, 0);
        return current;
      }
      remaining -= available * 60_000;
      const next = windows.find((w) => parseClock(w.start) > parseClock(window.end));
      if (next) {
        const [h, m] = next.start.split(':').map(Number);
        current.setHours(h ?? 0, m ?? 0, 0, 0);
      } else {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
    } else {
      const next = windows.find((w) => parseClock(w.start) > minutes);
      if (next) {
        const [h, m] = next.start.split(':').map(Number);
        current.setHours(h ?? 0, m ?? 0, 0, 0);
      } else {
        current.setDate(current.getDate() + 1);
        current.setHours(0, 0, 0, 0);
      }
    }
  }
  if (remaining <= 0) return current;
  return new Date(start.getTime() + durationMs);
}

export interface AutoscheduleOptions {
  /** 'order' keeps the queue; 'finish_time' sorts by due date and renumbers. */
  criteria: 'order' | 'finish_time';
  durationType: 'remaining' | 'estimated';
  start: Date;
}

/**
 * Plans every row in the plan back to back from `start` within the machine's
 * working hours (7/24 without a calendar). Missing hours count as 2.
 */
export function autoschedule(
  tasks: readonly CuttingPlanTask[],
  options: AutoscheduleOptions,
  calendar: Calendar,
): Patches<CuttingPlanTask> {
  const patches: Patches<CuttingPlanTask> = new Map();
  let queue = tasks.filter((t) => t.in_plan);
  if (options.criteria === 'finish_time') {
    const due = (t: CuttingPlanTask) =>
      t.finish_time ? new Date(t.finish_time).getTime() : new Date('2099-12-31').getTime();
    queue = [...queue].sort((a, b) => due(a) - due(b));
    queue.forEach((t, i) => patches.set(t.key, { plan_order: i + 1 }));
  } else {
    queue = [...queue].sort(byPlanOrder);
  }
  let cursor = nextWorkingTime(new Date(options.start), calendar);
  for (const task of queue) {
    const h =
      options.durationType === 'remaining'
        ? hours(task.remaining_hours) || hours(task.estimated_hours) || 2
        : hours(task.estimated_hours) || hours(task.remaining_hours) || 2;
    const duration = h * 3_600_000;
    const start = calendar?.week_template
      ? nextWorkingTime(new Date(cursor), calendar)
      : new Date(cursor);
    const end = workingTimeEnd(start, duration, calendar);
    patches.set(task.key, {
      ...patches.get(task.key),
      planned_start_ms: start.getTime(),
      planned_end_ms: end.getTime(),
    });
    cursor = new Date(end);
  }
  return patches;
}

// ---------------------------------------------------------------------------
// Machining queue

/**
 * Moves an operation to place `position` of the queue (planned rows by
 * plan_order). An unplanned row joins the queue there. As in legacy the moved
 * row is locked (the server keeps hand-placed rows where they are); the
 * queue is renumbered 1..n.
 */
export function moveMachiningTo(
  tasks: readonly MachiningPlanOperation[],
  key: string,
  position: number,
): Patches<MachiningPlanOperation> {
  const moved = tasks.find((t) => t.key === key);
  if (!moved || !Number.isFinite(position)) return new Map();
  const queue = tasks.filter((t) => t.in_plan).sort(byPlanOrder);
  const keys = queue.map((t) => t.key);
  if (!moved.in_plan) keys.push(key);
  const patches = renumber(tasks, moveToPosition(keys, key, position));
  patches.set(key, { ...patches.get(key), in_plan: true, plan_locked: true });
  return patches;
}

/**
 * Legacy reorderTasks of the machining planner (drop on a row): the dragged
 * row goes before/after the target in planned-then-unplanned order. Legacy
 * numbered planned rows by that combined place, which left gaps when a row
 * was dropped among the unplanned ones; here it lands at the end of the queue.
 */
export function reorderMachining(
  tasks: readonly MachiningPlanOperation[],
  dragKey: string,
  targetKey: string,
  position: 'before' | 'after',
): Patches<MachiningPlanOperation> {
  const planned = tasks.filter((t) => t.in_plan).sort(byPlanOrder);
  const all = [...planned, ...tasks.filter((t) => !t.in_plan)].map((t) => t.key);
  if (dragKey === targetKey || !all.includes(dragKey) || !all.includes(targetKey)) return new Map();
  const rest = all.filter((k) => k !== dragKey);
  const target = rest.indexOf(targetKey);
  rest.splice(position === 'before' ? target : target + 1, 0, dragKey);
  return moveMachiningTo(tasks, dragKey, rest.indexOf(dragKey) + 1);
}

/** Rows whose membership, order or lock differs (dates are server-computed). */
export function changedMachiningTasks(
  base: readonly MachiningPlanOperation[],
  current: readonly MachiningPlanOperation[],
): MachiningPlanOperation[] {
  const originals = new Map(base.map((t) => [t.key, t]));
  return current.filter((task) => {
    const original = originals.get(task.key);
    if (!original) return Boolean(task.in_plan);
    return (
      !sameValue(task.in_plan, original.in_plan) ||
      !sameValue(task.plan_order, original.plan_order) ||
      !sameValue(task.plan_locked, original.plan_locked)
    );
  });
}

/** Legacy savePlan payload: a bare array; dragged rows go out locked. */
export function machiningSaveItems(
  base: readonly MachiningPlanOperation[],
  current: readonly MachiningPlanOperation[],
  moved: ReadonlySet<string>,
): MachiningPlanSaveItem[] {
  return changedMachiningTasks(base, current).map((task) => {
    const item: MachiningPlanSaveItem = { key: task.key, in_plan: true };
    if (task.plan_order) item.plan_order = task.plan_order;
    if (moved.has(task.key)) item.plan_locked = true;
    return item;
  });
}
