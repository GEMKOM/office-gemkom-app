import type { StatusFamily } from '@/ui';

// The forecast vocabulary shared by Sunum Modu and the list's Öngörülen Bitiş
// column (legacy meetingView.js exported it to jobOrderList.js): both show the
// same numbers, so they read them through here.

export interface Badge {
  family: StatusFamily;
  label: string;
}

/** House badge families, no yellow (legacy CLASSIFICATION_BADGES). */
export const CLASSIFICATION_BADGES: Record<string, Badge> = {
  completed_on_time: { label: 'Zamanında', family: 'green' },
  completed_late: { label: 'Geç Bitti', family: 'red' },
  overdue: { label: 'Gecikmede', family: 'red' },
  at_risk: { label: 'Riskte', family: 'purple' },
  in_progress: { label: 'Devam Ediyor', family: 'blue' },
  not_started: { label: 'Başlamadı', family: 'grey' },
  unplanned: { label: 'Plansız', family: 'orange' },
  excluded: { label: 'Kapsam Dışı', family: 'grey' },
};

export const TASK_STATUS_FAMILIES: Record<string, StatusFamily> = {
  pending: 'grey',
  blocked: 'red',
  in_progress: 'blue',
  on_hold: 'orange',
  completed: 'green',
  cancelled: 'grey',
  skipped: 'grey',
};

/** Working days: "3", "2,5"; the sign is the caller's. */
export function formatWorkDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const abs = Math.abs(value);
  return (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)).replace('.', ',');
}

export interface Forecast {
  verdict?: string | null;
  variance_wd?: number | null;
  projected_completion_date?: string | null;
  phases?: unknown[] | null;
  worst_phase?: number | null;
  /** Working days lost waiting for material; absent on a stale snapshot. */
  material_wait_wd?: number | null;
  [key: string]: unknown;
}

/** The job-order verdict as one house badge (the hero's headline, condensed). */
export function verdictBadge(forecast: Forecast | null | undefined): Badge {
  const f = forecast ?? {};
  const wd = f.variance_wd;
  const late = wd !== null && wd !== undefined && wd > 0;
  const early = wd !== null && wd !== undefined && wd < 0;
  switch (f.verdict) {
    case 'on_track':
      return { family: 'green', label: early ? `${formatWorkDays(wd)} iş günü erken` : 'Zamanında' };
    case 'late_risk':
      return { family: 'red', label: late ? `+${formatWorkDays(wd)} iş günü geç` : 'Gecikecek' };
    case 'finished_on_time':
      return { family: 'green', label: 'Zamanında bitti' };
    case 'finished_late':
      return { family: 'red', label: late ? `+${formatWorkDays(wd)} iş günü geç bitti` : 'Geç bitti' };
    case 'no_target':
      return { family: 'orange', label: 'Hedef tarih yok' };
    case 'no_data':
      return { family: 'grey', label: 'Veri yok' };
    default:
      return { family: 'grey', label: 'Öngörü yok' };
  }
}

export interface TaskSchedule {
  classification?: string | null;
  projected_end_date?: string | null;
  actual_end_date?: string | null;
  projected_variance_wd?: number | null;
  end_variance_wd?: number | null;
  overdue_wd?: number | null;
  [key: string]: unknown;
}

export interface PlanTask {
  id: number;
  parent: number | null;
  status?: string;
  schedule: TaskSchedule;
  [key: string]: unknown;
}

export interface PlanNode {
  job_no: string;
  depth: number;
  target_completion_date?: string | null;
  summary?: { projected_completion?: string | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

/** `/job-orders/{no}/production-plan/` (only what the list and the deck read). */
export interface ProductionPlan {
  tasks?: PlanTask[];
  nodes?: PlanNode[];
  [key: string]: unknown;
}

/** Parents whose progress is carried by their children are hidden. */
export function visibleTasks<T extends { id: number; parent: number | null }>(tasks: T[]): T[] {
  const parentIds = new Set<number>();
  for (const t of tasks) if (t.parent !== null) parentIds.add(t.parent);
  return tasks.filter((t) => !parentIds.has(t.id));
}

export interface PlanTaskCounts {
  total: number;
  done: number;
  lateDone: number;
  late: number;
  risk: number;
  active: number;
  waiting: number;
  excluded: number;
}

/**
 * Task counts for a plan. Completed tasks count as done whatever their
 * classification (an undated finished task is not "plansız"), and
 * cancelled/skipped ('excluded') are their own bucket.
 */
export function summarizePlanTasks(tasks: PlanTask[] | null | undefined): PlanTaskCounts {
  const counts = { total: 0, done: 0, lateDone: 0, late: 0, risk: 0, active: 0, waiting: 0, excluded: 0 };
  for (const task of visibleTasks(tasks ?? [])) {
    const classification = task.schedule.classification;
    if (classification === 'excluded') {
      counts.excluded += 1;
      continue;
    }
    counts.total += 1;
    if (task.status === 'completed') {
      if (classification === 'completed_late') counts.lateDone += 1;
      else counts.done += 1;
    } else if (classification === 'overdue') counts.late += 1;
    else if (classification === 'at_risk') counts.risk += 1;
    else if (classification === 'in_progress') counts.active += 1;
    else counts.waiting += 1;
  }
  return counts;
}

export interface NodeProjection {
  projected: string | null;
  target: string | null;
}

/**
 * A sub-job's projection is the latest date in its own subtree run (`nodes`
 * is DFS-ordered with depth): its own tasks alone would under-report a parent
 * whose late work sits in a child job order.
 */
export function nodeProjections(plan: ProductionPlan | null | undefined): Map<string, NodeProjection> {
  const out = new Map<string, NodeProjection>();
  const nodes = plan?.nodes ?? [];
  nodes.forEach((node, i) => {
    let latest = node.summary?.projected_completion ?? null;
    for (let j = i + 1; j < nodes.length && nodes[j]!.depth > node.depth; j++) {
      const date = nodes[j]!.summary?.projected_completion;
      if (date && (!latest || date > latest)) latest = date;
    }
    out.set(node.job_no, { projected: latest, target: node.target_completion_date ?? null });
  });
  return out;
}
