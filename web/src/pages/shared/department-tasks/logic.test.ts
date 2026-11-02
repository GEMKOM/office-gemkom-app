import { ApiError } from '@/api/client';
import type { DepartmentTask } from '@/api/projects/departmentTasks';
import { DESIGN_TASKS, MANUFACTURING_TASKS, PLANNING_TASKS } from './config';
import {
  availableTabs,
  canCompleteRow,
  canSelfStartRevision,
  canSkipRow,
  canViewRow,
  designReviewBadge,
  detectQcColumns,
  displayTitle,
  filterParams,
  FILTER_DEFAULTS,
  flattenTasks,
  ganttDateRange,
  isInternalTeamAssignmentForTask,
  isSubcontractingAssignmentForTask,
  legacyErrorText,
  listOrdering,
  parseCsv,
  progressColor,
  qcReviewsFromSheet,
  toGanttTask,
  toGanttUserRows,
} from './logic';

const task = (over: Partial<DepartmentTask> = {}): DepartmentTask => ({
  id: 1,
  status: 'pending',
  ...over,
});
const keys = (t: DepartmentTask, config = PLANNING_TASKS) =>
  availableTabs(config, t).map((x) => x.key);

describe('availableTabs (legacy getAvailableActions)', () => {
  it('gives a plain pending task edit, start and delete', () => {
    expect(keys(task({ can_start: true }))).toEqual(['edit', 'start', 'delete']);
  });

  it('hides start without can_start and on part rows', () => {
    expect(keys(task())).toEqual(['edit', 'delete']);
    expect(keys(task({ type: 'cnc_part', can_start: true, subtasks_count: 2 }))).toEqual([]);
  });

  it('sales_consult tasks only get the consultation tab (+ undo when completed)', () => {
    expect(keys(task({ task_type: 'sales_consult', can_start: true }))).toEqual(['consultation']);
    expect(keys(task({ task_type: 'sales_consult', status: 'completed' }))).toEqual([
      'consultation',
      'uncomplete',
    ]);
  });

  it('puts the release review and consultation first for design', () => {
    const t = task({ pending_approval_release_id: 5, is_consultation: true, subtasks_count: 1 });
    expect(keys(t, DESIGN_TASKS)).toEqual([
      'consultation',
      'release-approval',
      'edit',
      'add-subtask',
    ]);
    // Not on other departments.
    expect(keys(t)).toEqual(['consultation', 'edit']);
  });

  it('offers self-start revision on design tasks with a current release', () => {
    const t = task({ current_release_id: 9, subtasks_count: 1 });
    expect(keys(t, DESIGN_TASKS)).toContain('self-start-revision');
    expect(keys({ ...t, is_under_revision: true }, DESIGN_TASKS)).not.toContain(
      'self-start-revision',
    );
  });

  it('manufacturing: QC submit, welding assignments; painting everywhere', () => {
    const welding = task({ task_type: 'welding', qc_required: true, subtasks_count: 1 });
    expect(keys(welding, MANUFACTURING_TASKS)).toEqual([
      'edit',
      'submit-qc',
      'qc-reviews',
      'subcontractor',
      'internal-team',
    ]);
    expect(keys(welding)).toEqual(['edit', 'qc-reviews']);
    expect(keys(task({ task_type: 'painting', subtasks_count: 1 }))).toEqual([
      'edit',
      'subcontractor',
    ]);
    expect(
      keys(task({ task_type: 'internal_team', subtasks_count: 1 }), MANUFACTURING_TASKS),
    ).toEqual(['edit', 'internal-team']);
  });

  it('part main tasks get NCRs and bulk subtasks', () => {
    expect(keys(task({ task_type: 'part', subtasks_count: 3 }))).toEqual([
      'edit',
      'ncrs',
      'bulk-subtask',
    ]);
    expect(keys(task({ task_type: 'part', parent: 4, subtasks_count: 3 }))).toEqual(['edit']);
  });
});

describe('row actions', () => {
  it('Tamamla: in progress, QC approved, not waiting for a design review', () => {
    expect(canCompleteRow(PLANNING_TASKS, task({ status: 'in_progress' }))).toBe(true);
    expect(canCompleteRow(PLANNING_TASKS, task({ status: 'pending' }))).toBe(false);
    expect(canCompleteRow(PLANNING_TASKS, task({ status: 'in_progress', qc_required: true }))).toBe(
      false,
    );
    expect(
      canCompleteRow(
        PLANNING_TASKS,
        task({ status: 'in_progress', qc_required: true, has_qc_approval: true }),
      ),
    ).toBe(true);
    const reviewing = task({ status: 'in_progress', pending_approval_release_id: 3 });
    expect(canCompleteRow(DESIGN_TASKS, reviewing)).toBe(false);
    expect(canCompleteRow(PLANNING_TASKS, reviewing)).toBe(true);
  });

  it('Tamamla on procurement items: undelivered planning items only', () => {
    const item = task({
      task_type: 'procurement_item',
      planning_request_item_id: 7,
      is_delivered: false,
    });
    expect(canCompleteRow(PLANNING_TASKS, item)).toBe(true);
    expect(canCompleteRow(PLANNING_TASKS, { ...item, is_delivered: true })).toBe(false);
    expect(canViewRow(item)).toBe(false);
    expect(canSkipRow(item)).toBe(false);
  });

  it('Atla and Revizyonu Başlat', () => {
    expect(canSkipRow(task({ status: 'in_progress' }))).toBe(true);
    expect(canSkipRow(task({ status: 'skipped' }))).toBe(false);
    expect(canSkipRow(task({ task_type: 'sales_consult' }))).toBe(false);
    expect(canSelfStartRevision(DESIGN_TASKS, task({ current_release_id: 1 }))).toBe(true);
    expect(canSelfStartRevision(PLANNING_TASKS, task({ current_release_id: 1 }))).toBe(false);
  });

  it('design review badge', () => {
    expect(
      designReviewBadge(
        DESIGN_TASKS,
        task({
          pending_approval_release_id: 1,
          pending_release_approval_state: { approval_count: 1, required_count: 2 },
        }),
      ),
    ).toEqual({ kind: 'pending', progress: ' (1/2)' });
    expect(designReviewBadge(DESIGN_TASKS, task({ rejected_release_id: 1 }))).toEqual({
      kind: 'rejected',
    });
    expect(designReviewBadge(DESIGN_TASKS, task({ rejected_release_id: 1, parent: 2 }))).toBeNull();
    expect(designReviewBadge(PLANNING_TASKS, task({ rejected_release_id: 1 }))).toBeNull();
  });
});

describe('filterParams (legacy applyFilterValuesToOptions)', () => {
  it('maps the default to status__in and drops empties', () => {
    expect(filterParams(FILTER_DEFAULTS)).toEqual({ status__in: 'pending,in_progress' });
  });

  it('single status, search, job order, customer and assignee', () => {
    expect(
      filterParams({
        ...FILTER_DEFAULTS,
        status: 'completed',
        search: 'x',
        job_order: '254-01',
        customer: '12',
        assigned_to: '7',
      }),
    ).toEqual({
      status: 'completed',
      search: 'x',
      job_order: '254-01',
      customer: 12,
      assigned_to: 7,
    });
  });

  it('unassigned, and target dates that legacy never sent', () => {
    expect(
      filterParams({
        ...FILTER_DEFAULTS,
        status: '',
        assigned_to: '__unassigned__',
        target_start_date: '2026-01-01',
      }),
    ).toEqual({ assigned_to__isnull: true });
  });

  it('ordering: the sorted column, else target_start_date in the Gantt', () => {
    expect(listOrdering('title', 'desc', false)).toBe('-title');
    expect(listOrdering(null, 'asc', false)).toBe('');
    expect(listOrdering(null, 'asc', true)).toBe('target_start_date');
  });
});

describe('flattenTasks', () => {
  it('nests expanded subtasks recursively with their levels', () => {
    const mains = [task({ id: 1 }), task({ id: 2 })];
    const subs: Record<number, DepartmentTask[]> = {
      1: [task({ id: 11, parent: 1 }), task({ id: 12, parent: 1 })],
      11: [task({ id: 111, parent: 11 })],
    };
    const flat = flattenTasks(mains, new Set([1, 11]), (id) => subs[id]);
    expect(flat.rows.map((r) => r.id)).toEqual([1, 11, 111, 12, 2]);
    expect([...flat.levels.entries()]).toEqual([
      [1, 0],
      [11, 1],
      [111, 2],
      [12, 1],
      [2, 0],
    ]);
  });

  it('ignores loaded children of collapsed rows', () => {
    const flat = flattenTasks([task({ id: 1 })], new Set(), () => [task({ id: 5, parent: 1 })]);
    expect(flat.rows).toHaveLength(1);
  });
});

describe('cells', () => {
  it('main tasks show the job order title, cut at 50', () => {
    const long = 'x'.repeat(60);
    expect(displayTitle(task({ title: 'own', job_order_title: long })).short).toBe(
      `${'x'.repeat(49)}…`,
    );
    expect(displayTitle(task({ title: 'own', parent: 3, job_order_title: 'jo' })).full).toBe('own');
  });

  it('progress colours', () => {
    expect([0, 10, 30, 60, 90, 100].map(progressColor)).toEqual([
      '#6b7280',
      '#ef4444',
      '#f59e0b',
      '#3b82f6',
      '#10b981',
      '#059669',
    ]);
  });
});

describe('Gantt', () => {
  it('date windows', () => {
    const base = new Date(2026, 10, 4); // Wednesday
    expect(ganttDateRange('month', base)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(ganttDateRange('week', base)).toEqual({ start: '2026-11-02', end: '2026-11-08' });
    expect(ganttDateRange('day', base)).toEqual({ start: '2026-11-04', end: '2026-11-04' });
    expect(ganttDateRange('year', base)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('task bars fill a missing end with one day', () => {
    const bar = toGanttTask(
      task({ id: 3, job_order: '254-01', target_start_date: '2026-11-01' }),
      0,
    );
    expect(bar.ti_number).toBe('254-01');
    expect(bar.planned_end_ms! - bar.planned_start_ms!).toBe(86_400_000);
    expect(bar.plan_order).toBe(1);
  });

  it('user rows, unassigned last only when used', () => {
    const users = [
      { id: 1, name: 'Ali' },
      { id: 2, name: 'Ayşe' },
    ];
    const rows = toGanttUserRows(
      [
        task({ id: 1, assigned_to: 1, target_start_date: '2026-11-02' }),
        task({ id: 2, assigned_to: 99, target_start_date: '2026-11-01' }),
        task({ id: 3, assigned_to: 1 }),
      ],
      users,
    );
    expect(rows.map((r) => [r.ti_number, r.title])).toEqual([
      ['Ali', '1 görev'],
      ['Ayşe', '0 görev'],
      ['Atanmamis', '1 görev'],
    ]);
    expect(toGanttUserRows([], users)).toHaveLength(2);
  });
});

describe('assignment matching', () => {
  it('subcontracting/painting tasks match their own subtask id', () => {
    const t = task({ id: 10, task_type: 'subcontracting' });
    expect(isSubcontractingAssignmentForTask({ department_task: 10 }, t)).toBe(true);
    expect(isSubcontractingAssignmentForTask({ subtask: { id: 10 } }, t)).toBe(true);
    expect(isSubcontractingAssignmentForTask({ department_task: 11 }, t)).toBe(false);
  });

  it('welding tasks match the parent fields or an expanded child', () => {
    const t = task({ id: 10, task_type: 'welding' });
    expect(isSubcontractingAssignmentForTask({ kaynak_task_id: '10' }, t)).toBe(true);
    expect(isSubcontractingAssignmentForTask({ department_task: 55 }, t)).toBe(false);
    expect(isSubcontractingAssignmentForTask({ department_task: 55 }, t, [task({ id: 55 })])).toBe(
      true,
    );
    expect(
      isInternalTeamAssignmentForTask({ department_task_detail: { id: 3, parent: 10 } }, t),
    ).toBe(true);
    expect(
      isInternalTeamAssignmentForTask(
        { department_task: 3 },
        task({ id: 3, task_type: 'internal_team' }),
      ),
    ).toBe(true);
  });
});

describe('QC Excel import', () => {
  it('detects Turkish headers', () => {
    expect(
      detectQcColumns(['Konum', 'İncelenen Miktar', 'Çizim No', 'Pozisyon No', 'Notlar']),
    ).toEqual({
      location: 0,
      quantity_inspected: 1,
      drawing_no: 2,
      position_no: 3,
      notes: 4,
    });
  });

  it('parses CSV with quotes and builds reviews', () => {
    const rows = parseCsv('Konum,Miktar,Not\n"Atölye B, Raf 3",5,ilk parti\n\n,,\n');
    expect(rows[1]).toEqual(['Atölye B, Raf 3', '5', 'ilk parti']);
    expect(qcReviewsFromSheet(rows)).toEqual([
      {
        location: 'Atölye B, Raf 3',
        quantity_inspected: 5,
        position_no: '',
        drawing_no: '',
        notes: 'ilk parti',
      },
      { location: '', quantity_inspected: null, position_no: '', drawing_no: '', notes: '' },
    ]);
  });
});

describe('legacyErrorText', () => {
  it('joins the body values, else the fallback', () => {
    expect(
      legacyErrorText(new ApiError(400, { weight: ['Geçersiz'], title: ['Boş'] }, 'x'), 'F'),
    ).toBe('Geçersiz, Boş');
    expect(legacyErrorText(new ApiError(400, { message: 'M', a: ['b'] }, 'x'), 'F', true)).toBe(
      'M',
    );
    expect(legacyErrorText(new ApiError(500, 'oops', 'x'), 'F')).toBe('F');
    expect(legacyErrorText(new Error('net'), 'F')).toBe('F');
  });
});

describe('Gantt model', () => {
  // Importing GanttView pulls in Mantine and the Gantt, which can take longer
  // than the default 5s when the whole suite runs in parallel.
  it('task rows get one bar, user rows a bar per segment', async () => {
    const { toGanttModel } = await import('./GanttView');
    const task = toGanttTask(
      {
        id: 3,
        job_order: '254-01',
        title: 'x',
        status: 'in_progress',
        target_start_date: '2026-11-01',
      },
      0,
    );
    const undated = toGanttTask({ id: 4, title: 'y' }, 1);
    const model = toGanttModel([task, undated]);
    expect(model.rows.map((r) => r.id)).toEqual(['3', '4']);
    expect(model.bars).toHaveLength(1);
    expect(model.bars[0]).toMatchObject({ rowId: '3', taskId: 3, tone: 'blue', label: '254-01' });

    const users = toGanttUserRows(
      [{ id: 5, assigned_to: 1, status: 'pending', target_start_date: '2026-11-02' }],
      [{ id: 1, name: 'Ali' }],
    );
    const byUser = toGanttModel(users);
    expect(byUser.rows.map((r) => r.label)).toEqual(['Ali']);
    expect(byUser.bars[0]).toMatchObject({ rowId: 'user-1', taskId: 5 });
  }, 20_000);
});
