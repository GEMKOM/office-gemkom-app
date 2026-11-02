import type { CuttingPlanTask, MachiningPlanOperation } from '@/api/manufacturing/capacityPlanning';
import type { GanttBar, GanttRow } from '@/ui/Gantt';

// Planner rows -> Gantt rows and bars. Cached per row object: the draft keeps
// untouched rows by identity, so their bars stay the same objects and the
// Gantt re-renders only what was edited.

export interface TaskBar<T> extends GanttBar {
  task: T;
}

const cuttingRows = new WeakMap<CuttingPlanTask, GanttRow>();
const cuttingBars = new WeakMap<CuttingPlanTask, TaskBar<CuttingPlanTask>>();

export function byPlanOrder<T extends { plan_order?: number | null }>(a: T, b: T): number {
  return (a.plan_order || 0) - (b.plan_order || 0);
}

/** Legacy updateGanttChart: planned rows in queue order; bars where there are dates. */
export function cuttingGantt(tasks: readonly CuttingPlanTask[]) {
  const planned = tasks.filter((t) => t.in_plan).sort(byPlanOrder);
  const rows: GanttRow[] = [];
  const bars: TaskBar<CuttingPlanTask>[] = [];
  for (const task of planned) {
    let row = cuttingRows.get(task);
    if (!row) {
      const dated = Boolean(task.planned_start_ms && task.planned_end_ms);
      row = {
        id: task.key,
        label: task.key,
        sublabel: dated
          ? (task.name ?? undefined)
          : `${task.name ? `${task.name} · ` : ''}Tarih atanmamış`,
        locked: Boolean(task.plan_locked),
        muted: !dated,
      };
      cuttingRows.set(task, row);
    }
    rows.push(row);
    if (task.planned_start_ms && task.planned_end_ms) {
      let bar = cuttingBars.get(task);
      if (!bar) {
        bar = {
          id: task.key,
          rowId: task.key,
          start: task.planned_start_ms,
          end: Math.max(task.planned_end_ms, task.planned_start_ms),
          label: task.key,
          title: task.name ? `${task.key} · ${task.name}` : task.key,
          tone: task.plan_locked ? 'yellow' : 'brand',
          locked: Boolean(task.plan_locked),
          task,
        };
        cuttingBars.set(task, bar);
      }
      bars.push(bar);
    }
  }
  return { rows, bars };
}

const machiningRows = new WeakMap<MachiningPlanOperation, GanttRow>();
const machiningBars = new WeakMap<MachiningPlanOperation, TaskBar<MachiningPlanOperation>>();

/** Row id of the "Planlanmamış" band in the machining queue. */
export const UNPLANNED_GROUP = '__unplanned__';
const unplannedGroupRow: GanttRow = { id: UNPLANNED_GROUP, label: 'Planlanmamış', group: true };

/**
 * The machining queue: planned operations in order, then a "Planlanmamış"
 * band with the rest (legacy showed those at the bottom of the table, and
 * dragging one into the queue planned it). Dates are server-computed.
 */
export function machiningGantt(tasks: readonly MachiningPlanOperation[]) {
  const planned = tasks.filter((t) => t.in_plan).sort(byPlanOrder);
  const unplanned = tasks.filter((t) => !t.in_plan);
  const rows: GanttRow[] = [];
  const bars: TaskBar<MachiningPlanOperation>[] = [];
  const rowFor = (task: MachiningPlanOperation) => {
    let row = machiningRows.get(task);
    if (!row) {
      row = {
        id: task.key,
        label: task.key,
        sublabel: [task.name, task.part_name].filter(Boolean).join(' · ') || undefined,
        locked: Boolean(task.plan_locked),
        muted: !task.in_plan,
      };
      machiningRows.set(task, row);
    }
    return row;
  };
  for (const task of planned) {
    rows.push(rowFor(task));
    if (task.planned_start_ms && task.planned_end_ms) {
      let bar = machiningBars.get(task);
      if (!bar) {
        bar = {
          id: task.key,
          rowId: task.key,
          start: task.planned_start_ms,
          end: Math.max(task.planned_end_ms, task.planned_start_ms),
          label: task.key,
          title: task.name ? `${task.key} · ${task.name}` : task.key,
          tone: task.plan_locked ? 'yellow' : task.projected_late ? 'red' : 'brand',
          locked: Boolean(task.plan_locked),
          task,
        };
        machiningBars.set(task, bar);
      }
      bars.push(bar);
    }
  }
  if (unplanned.length) {
    rows.push(unplannedGroupRow);
    for (const task of unplanned) rows.push(rowFor(task));
  }
  return { rows, bars };
}
