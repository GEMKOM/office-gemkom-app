import type { ProductionPlanTask } from '@/api/manufacturing/machiningCapacityReports';
import type { GanttBar, GanttRow, GanttTone } from '@/ui/Gantt';

// Legacy processTasksForProgress + the Gantt / completion-modal maths of
// manufacturing/machining/reports/production-plan/production-plan.js.

export type PlanStatus =
  'completed' | 'ready-for-completion' | 'on-hold' | 'delayed' | 'in-progress';

export interface PlanBar extends GanttBar {
  task: ProductionPlanTask;
  status: PlanStatus;
}

/** Legacy custom progress colours: green done/in progress, blue ready, red late, yellow hold. */
const PROGRESS_TONE: Record<PlanStatus, GanttTone> = {
  completed: 'green',
  'ready-for-completion': 'blue',
  'in-progress': 'green',
  delayed: 'red',
  'on-hold': 'yellow',
};

const toMs = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Progress and status of a task, as legacy processTasksForProgress. */
export function taskProgress(
  task: ProductionPlanTask,
  now = Date.now(),
): { progress: number; status: PlanStatus } {
  const spent = task.total_hours_spent;
  const estimated = task.estimated_hours;
  if (spent !== undefined && estimated !== undefined) {
    const est = Number(estimated);
    const raw = Math.min(100, Math.round((Number(spent ?? 0) / est) * 100));
    // 0 / 0 (no estimate, nothing spent) is NaN in legacy too; it drew no fill.
    const progress = Number.isFinite(raw) ? raw : 0;
    if (task.completion_date) return { progress: 100, status: 'completed' };
    if (raw >= 100) return { progress, status: 'ready-for-completion' };
    if (task.is_hold || task.category === 'hold') return { progress, status: 'on-hold' };
    if (task.planned_end_ms && now > task.planned_end_ms) return { progress, status: 'delayed' };
    return { progress, status: 'in-progress' };
  }
  if (spent !== undefined) return { progress: 50, status: 'in-progress' };
  return { progress: 0, status: 'in-progress' };
}

/** Rows in plan order, red bars with a progress fill coloured by status; no keys in bars (legacy). */
export function productionPlanGantt(tasks: readonly ProductionPlanTask[], now = Date.now()) {
  const sorted = [...tasks].sort((a, b) => (a.plan_order || 0) - (b.plan_order || 0));
  const rows: GanttRow[] = [];
  const bars: PlanBar[] = [];
  for (const task of sorted) {
    const title = task.title || task.name || `Görev ${task.key}`;
    rows.push({ id: task.key, label: task.key, sublabel: title });
    // Fallbacks as legacy: actual start, then completion date.
    const start = task.planned_start_ms ?? task.actual_start_ms ?? null;
    const end = task.planned_end_ms ?? toMs(task.completion_date);
    if (!start || !end) continue;
    const { progress, status } = taskProgress(task, now);
    bars.push({
      id: task.key,
      rowId: task.key,
      start,
      end: Math.max(start, end),
      title: `${task.key} · ${title}`,
      tone: 'brand',
      progress,
      progressTone: PROGRESS_TONE[status],
      task,
      status,
    });
  }
  return { rows, bars };
}

const dayOnly = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const DAY = 86_400_000;

export interface Performance {
  efficiency: string;
  hourDifference: string;
  dateDifference: string;
}

/** "Performans Analizi" of the completion modal (legacy showCompletionDataModal). */
export function performance(
  task: ProductionPlanTask,
  now = Date.now(),
): Performance & { progressPercentage: number } {
  const estimated = task.estimated_hours ? Number(task.estimated_hours) : 0;
  const spent = task.total_hours_spent || 0;
  if (task.completion_date) {
    const efficiency = task.estimated_hours ? `${((estimated / spent) * 100).toFixed(1)}%` : 'N/A';
    const hourDifference = task.estimated_hours ? `${(estimated - spent).toFixed(2)} saat` : 'N/A';
    let dateDifference = 'N/A';
    const done = toMs(task.completion_date);
    if (done && task.planned_end_ms) {
      const diffDays = (dayOnly(done) - dayOnly(task.planned_end_ms)) / DAY;
      dateDifference =
        diffDays > 0
          ? `+${diffDays} gün gecikme`
          : diffDays < 0
            ? `${Math.abs(diffDays)} gün erken`
            : 'Tam zamanında';
    }
    return { efficiency, hourDifference, dateDifference, progressPercentage: 100 };
  }
  let progressPercentage = 0;
  if (estimated > 0) progressPercentage = Math.min(Math.max((spent / estimated) * 100, 0), 100);
  let efficiency = 'N/A';
  if (spent > 0 && estimated > 0 && progressPercentage > 0) {
    const projected = (spent / progressPercentage) * 100;
    efficiency = `${((estimated / projected) * 100).toFixed(1)}%`;
  } else if (spent > 0 && estimated > 0) {
    efficiency = `${((estimated / spent) * 100).toFixed(1)}%`;
  }
  let hourDifference = 'N/A';
  if (estimated > 0) {
    const diff = (spent - estimated).toFixed(2);
    hourDifference =
      spent > estimated
        ? `${diff} saat fazla`
        : spent < estimated
          ? `${Math.abs(Number(diff))} saat kaldı`
          : 'Tam zamanında';
  }
  let dateDifference = 'N/A';
  if (task.planned_end_ms) {
    const diffDays = (dayOnly(task.planned_end_ms) - dayOnly(now)) / DAY;
    dateDifference =
      diffDays > 0
        ? `${diffDays} gün kaldı`
        : diffDays < 0
          ? `${Math.abs(diffDays)} gün gecikme`
          : 'Bugün bitmesi gerekiyor';
  }
  return { efficiency, hourDifference, dateDifference, progressPercentage };
}
