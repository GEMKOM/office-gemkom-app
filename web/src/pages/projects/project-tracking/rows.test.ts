import { describe, expect, it } from 'vitest';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import type { JobOrder } from '@/api/projects/jobOrders';
import { computeFit, dueTone, isPhaseJobRow, mergeRows, normalizeJobOrderStatus, rowId, type MergeSources } from './rows';

const job = (job_no: string, extra: Partial<JobOrder> = {}): JobOrder => ({
  job_no,
  title: job_no,
  status: 'active',
  ...extra,
});
const task = (id: number, extra: Partial<DepartmentTask> = {}): DepartmentTask => ({ id, title: `T${id}`, ...extra });

function sources(extra: Partial<MergeSources> = {}): MergeSources {
  return {
    showAll: false,
    hidePhases: false,
    expandedChildren: new Set(),
    expandedTasks: new Set(),
    expandedSubtasks: new Set(),
    children: () => undefined,
    tasks: () => undefined,
    subtasks: () => undefined,
    ...extra,
  };
}

describe('normalizeJobOrderStatus', () => {
  it('shows a completed job below 100 % as active', () => {
    expect(normalizeJobOrderStatus(job('1', { status: 'completed', completion_percentage: '80' })).status).toBe('active');
    expect(normalizeJobOrderStatus(job('1', { status: 'completed', completion_percentage: 100 })).status).toBe(
      'completed',
    );
    expect(normalizeJobOrderStatus(job('1', { status: 'completed', completion_percentage: null })).status).toBe(
      'active',
    );
  });
});

describe('mergeRows', () => {
  it('nests expanded children, tasks and subtasks under their parents', () => {
    const rows = mergeRows(
      [job('270', { children_count: 1, department_task_count: 1 }), job('271')],
      sources({
        expandedChildren: new Set(['270']),
        expandedTasks: new Set(['270']),
        expandedSubtasks: new Set([5]),
        children: (no) => (no === '270' ? [job('270-01')] : undefined),
        tasks: (no) => (no === '270' ? [task(5, { subtasks_count: 1 })] : undefined),
        subtasks: (id) => (id === 5 ? [task(6, { parent: 5 })] : undefined),
      }),
    );
    expect(rows.map(rowId)).toEqual(['job-270', 'job-270-01', 'dept-task-5', 'dept-task-6', 'job-271']);
    expect(rows.map((r) => r.hierarchy_level)).toEqual([0, 1, 1, 2, 0]);
  });

  it('hides production phases when asked', () => {
    const roots = [job('270'), job('270/P1', { is_phase_job: true }), job('271', { source_job_order: '270' })];
    expect(mergeRows(roots, sources({ hidePhases: true })).map(rowId)).toEqual(['job-270']);
    expect(isPhaseJobRow(roots[1]!)).toBe(true);
  });

  it('does not merge children again when the list already holds them', () => {
    const rows = mergeRows(
      [job('270'), job('270-01', { hierarchy_level: 1 })],
      sources({ showAll: true, expandedChildren: new Set(['270']), children: () => [job('270-01')] }),
    );
    expect(rows.map(rowId)).toEqual(['job-270', 'job-270-01']);
    expect(rows[1]!.hierarchy_level).toBe(1);
  });
});

describe('dueTone', () => {
  const today = new Date(2026, 10, 3, 15, 0);
  it('marks past-due and due-within-a-week jobs, never completed ones', () => {
    expect(dueTone(job('1', { target_completion_date: '2026-11-02' }), today)).toBe('past-due');
    expect(dueTone(job('1', { target_completion_date: '2026-11-03' }), today)).toBe('due-soon');
    expect(dueTone(job('1', { target_completion_date: '2026-11-10' }), today)).toBe('due-soon');
    expect(dueTone(job('1', { target_completion_date: '2026-11-11' }), today)).toBeNull();
    expect(dueTone(job('1', { target_completion_date: '2026-11-01', status: 'completed' }), today)).toBeNull();
    expect(dueTone(job('1'), today)).toBeNull();
  });
});

describe('computeFit', () => {
  it('keeps normal widths on a wide viewport', () => {
    const fit = computeFit(2000, false);
    expect(fit).toMatchObject({ level: 0, tight: false, ultra: false, actionsWidth: 88 });
    expect(fit.widths.job_no).toBe(160);
  });

  it('shrinks to minimum widths on a narrow one, in eighths', () => {
    const fit = computeFit(600, true);
    expect(fit).toMatchObject({ level: 1, tight: true, ultra: true, actionsWidth: 48 });
    expect(fit.widths.title).toBe(120);
    const mid = computeFit(1100, false);
    expect((mid.level * 8) % 1).toBe(0);
    expect(mid.level).toBeGreaterThan(0);
    expect(mid.level).toBeLessThan(1);
  });
});
