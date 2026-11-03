import {
  buildBulkPlanPayload,
  cloneRows,
  displayOrder,
  formatServerError,
  newMainRow,
  newSubRow,
  nextSequenceBase,
  planHasTemplate,
  removeRow,
  rowKeyForTempId,
  rowsFromTemplate,
  setRowDepartment,
  summarizePlans,
  validatePlan,
  type PlanRow,
  type TemplateSource,
} from './taskPlannerModel';

// Shape of GET /projects/task-templates/2/ ("Standart Üretim Akışı").
const TEMPLATE: TemplateSource = {
  id: 2,
  name: 'Standart Üretim Akışı',
  items: [
    { id: 8, department: 'design', title: 'Dizayn', sequence: 1, weight: 10, task_type: null, depends_on: [], parent: null, children: [] },
    {
      id: 9,
      department: 'planning',
      title: 'Planlama',
      sequence: 2,
      weight: 10,
      task_type: null,
      depends_on: [],
      parent: null,
      children: [
        { id: 20, title: 'CNC Kesim', sequence: 2, weight: 8, task_type: 'cnc_cutting' },
        { id: 19, title: 'Talepler', sequence: 1, weight: 2, task_type: null },
      ],
    },
    { id: 13, department: 'logistics', title: 'Sevkiyat', sequence: 6, weight: 1, task_type: null, depends_on: [9, 8], parent: null, children: [] },
  ],
};

const titles = (rows: PlanRow[]) =>
  displayOrder(rows).map(({ row, depth }) => `${'  '.repeat(depth)}${row.title}`);
const byTitle = (rows: PlanRow[], title: string) => rows.find((r) => r.title === title)!;

it('template becomes rows with keyed parents and dependencies', () => {
  const rows = rowsFromTemplate(TEMPLATE);
  expect(titles(rows)).toEqual(['Dizayn', 'Planlama', '  Talepler', '  CNC Kesim', 'Sevkiyat']);
  const sevkiyat = byTitle(rows, 'Sevkiyat');
  expect(new Set(sevkiyat.dependsOn)).toEqual(new Set([byTitle(rows, 'Planlama').key, byTitle(rows, 'Dizayn').key]));
  expect(byTitle(rows, 'CNC Kesim').parentKey).toBe(byTitle(rows, 'Planlama').key);
  expect(byTitle(rows, 'CNC Kesim').task_type).toBe('cnc_cutting');
  expect(rows.every((r) => r.templateId === 2)).toBe(true);
});

it("template rows line up after the job's saved tasks", () => {
  const base = nextSequenceBase([], [{ sequence: 1 }, { sequence: 4 }]);
  expect(base).toBe(4);
  const rows = rowsFromTemplate(TEMPLATE, { sequenceBase: base });
  expect(rows.filter((r) => !r.parentKey).map((r) => r.sequence)).toEqual([5, 6, 10]);
  // Subtask sequences are local to their parent and stay put.
  expect(byTitle(rows, 'Talepler').sequence).toBe(1);
});

it('every template application gets fresh keys', () => {
  const a = rowsFromTemplate(TEMPLATE);
  const b = rowsFromTemplate(TEMPLATE);
  const keys = new Set([...a, ...b].map((r) => r.key));
  expect(keys.size).toBe(a.length + b.length);
});

it('removing a main row takes its subtasks and scrubs dependencies', () => {
  const rows = rowsFromTemplate(TEMPLATE);
  const planlama = byTitle(rows, 'Planlama');
  const after = removeRow(rows, planlama.key);
  expect(titles(after)).toEqual(['Dizayn', 'Sevkiyat']);
  expect(byTitle(after, 'Sevkiyat').dependsOn).toEqual([byTitle(rows, 'Dizayn').key]);
});

it('a department change carries down to subtasks', () => {
  const rows = rowsFromTemplate(TEMPLATE);
  const after = setRowDepartment(rows, byTitle(rows, 'Planlama').key, 'procurement');
  expect(byTitle(after, 'CNC Kesim').department).toBe('procurement');
  expect(byTitle(after, 'Dizayn').department).toBe('design');
});

it('manual rows: main after the last sequence, subtask under its parent', () => {
  let rows = rowsFromTemplate(TEMPLATE);
  const main = newMainRow(rows, [], 'painting', 'Boya');
  expect(main.sequence).toBe(7);
  expect(main.title).toBe('Boya');
  rows = [...rows, main];
  const sub = newSubRow(rows, byTitle(rows, 'Planlama').key);
  expect(sub.sequence).toBe(3);
  expect(sub.department).toBe('planning');
});

it('cloning re-links copies and re-bases sequences for the target', () => {
  const source = rowsFromTemplate(TEMPLATE, { sequenceBase: 4 });
  const copy = cloneRows(source, { sequenceBase: 0 });
  expect(copy.filter((r) => !r.parentKey).map((r) => r.sequence)).toEqual([1, 2, 6]);
  expect(copy.every((r) => !source.some((s) => s.key === r.key))).toBe(true);
  expect(byTitle(copy, 'CNC Kesim').parentKey).toBe(byTitle(copy, 'Planlama').key);
  expect(new Set(byTitle(copy, 'Sevkiyat').dependsOn)).toEqual(
    new Set([byTitle(copy, 'Planlama').key, byTitle(copy, 'Dizayn').key]),
  );
});

it('payload: negative temp ids per plan, parents and in-plan deps only', () => {
  const rows = rowsFromTemplate(TEMPLATE);
  const plans = new Map<string, PlanRow[]>([
    ['900-01', []],
    ['900-01-01', rows],
    ['900-01-02', [newMainRow([], [], 'design', 'Dizayn')]],
  ]);
  const { plans: out } = buildBulkPlanPayload(plans, ['900-01', '900-01-01', '900-01-02']);
  expect(out.map((p) => p.job_order)).toEqual(['900-01-01', '900-01-02']);
  const [first, second] = out as [(typeof out)[number], (typeof out)[number]];
  expect(first.tasks.map((t) => t.temp_id)).toEqual([-1, -2, -3, -4, -5]);
  const tempOf = (title: string) => first.tasks[rows.indexOf(byTitle(rows, title))]!.temp_id;
  const cnc = first.tasks.find((t) => t.title === 'CNC Kesim')!;
  expect(cnc.parent).toBe(tempOf('Planlama'));
  expect(cnc.task_type).toBe('cnc_cutting');
  expect(first.dependencies).toEqual([
    { task: tempOf('Sevkiyat'), depends_on: [tempOf('Planlama'), tempOf('Dizayn')] },
  ]);
  expect(second.tasks[0]!.temp_id).toBe(-1);
  expect('parent' in second.tasks[0]!).toBe(false);
});

it('error temp_id maps back to its row', () => {
  const rows = rowsFromTemplate(TEMPLATE);
  expect(rowKeyForTempId(rows, -3)).toBe(rows[2]!.key);
  expect(rowKeyForTempId(rows, -99)).toBeNull();
});

it('validation catches what the backend would refuse', () => {
  const rows = rowsFromTemplate(TEMPLATE);
  const sub = { ...newSubRow(rows, byTitle(rows, 'Planlama').key), title: '  ' };
  const bad = [...rows.map((r) => (r.title === 'Dizayn' ? { ...r, weight: 0 } : r)), sub];
  const messages = validatePlan(bad).map((p) => p.message);
  expect(messages.sort()).toEqual(['Alt görev başlığı boş', 'Ağırlık en az 1 olmalı']);
  expect(validatePlan(rows)).toEqual([]);
});

it('summary and template detection', () => {
  const plans = new Map<string, PlanRow[]>([
    ['a', rowsFromTemplate(TEMPLATE)],
    ['b', []],
    ['c', [newMainRow([], [], 'design', '')]],
  ]);
  expect(summarizePlans(plans)).toEqual({ jobCount: 2, taskCount: 6 });
  expect(planHasTemplate(plans.get('a')!, '2')).toBe(true);
  expect(planHasTemplate(plans.get('c')!, 2)).toBe(false);
});

it('server errors read as one line with Turkish field names', () => {
  expect(formatServerError({ message: 'Geçersiz plan', errors: { weight: ['En az 1'], foo: 'x' } })).toBe(
    'Geçersiz plan Ağırlık: En az 1; foo: x',
  );
  expect(formatServerError({ detail: 'Yetkiniz yok' })).toBe('Yetkiniz yok');
  expect(formatServerError(undefined)).toBe('');
});
