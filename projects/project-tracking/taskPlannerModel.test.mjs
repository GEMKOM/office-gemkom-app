/**
 * Tests for the Görev Planlama plan state.
 *
 *     node projects/project-tracking/taskPlannerModel.test.mjs
 */

import assert from 'node:assert/strict';
import {
    buildBulkPlanPayload,
    cloneRows,
    displayOrder,
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
} from './taskPlannerModel.js';

let failures = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`  ok   ${name}`);
    } catch (error) {
        failures += 1;
        console.log(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
    }
}

// Shape of GET /projects/task-templates/2/ ("Standart Üretim Akışı").
const TEMPLATE = {
    id: 2,
    name: 'Standart Üretim Akışı',
    items: [
        { id: 8, department: 'design', title: 'Dizayn', sequence: 1, weight: 10, task_type: null, depends_on: [], parent: null, children: [] },
        { id: 9, department: 'planning', title: 'Planlama', sequence: 2, weight: 10, task_type: null, depends_on: [], parent: null, children: [
            { id: 20, department: 'planning', title: 'CNC Kesim', sequence: 2, weight: 8, task_type: 'cnc_cutting' },
            { id: 19, department: 'planning', title: 'Talepler', sequence: 1, weight: 2, task_type: null },
        ] },
        { id: 13, department: 'logistics', title: 'Sevkiyat', sequence: 6, weight: 1, task_type: null, depends_on: [9, 8], parent: null, children: [] },
    ],
};

const titles = (rows) => displayOrder(rows).map(({ row, depth }) => `${'  '.repeat(depth)}${row.title}`);
const byTitle = (rows, title) => rows.find((r) => r.title === title);

check('template becomes rows with keyed parents and dependencies', () => {
    const rows = rowsFromTemplate(TEMPLATE);
    assert.deepEqual(titles(rows), ['Dizayn', 'Planlama', '  Talepler', '  CNC Kesim', 'Sevkiyat']);
    const sevkiyat = byTitle(rows, 'Sevkiyat');
    assert.deepEqual(new Set(sevkiyat.dependsOn), new Set([byTitle(rows, 'Planlama').key, byTitle(rows, 'Dizayn').key]));
    assert.equal(byTitle(rows, 'CNC Kesim').parentKey, byTitle(rows, 'Planlama').key);
    assert.equal(byTitle(rows, 'CNC Kesim').task_type, 'cnc_cutting');
    assert.ok(rows.every((r) => r.templateId === 2));
});

check('template rows line up after the job\'s saved tasks', () => {
    const base = nextSequenceBase([], [{ sequence: 1 }, { sequence: 4 }]);
    assert.equal(base, 4);
    const rows = rowsFromTemplate(TEMPLATE, { sequenceBase: base });
    assert.deepEqual(rows.filter((r) => !r.parentKey).map((r) => r.sequence), [5, 6, 10]);
    // Subtask sequences are local to their parent and stay put.
    assert.equal(byTitle(rows, 'Talepler').sequence, 1);
});

check('every template application gets fresh keys', () => {
    const a = rowsFromTemplate(TEMPLATE);
    const b = rowsFromTemplate(TEMPLATE);
    const keys = new Set([...a, ...b].map((r) => r.key));
    assert.equal(keys.size, a.length + b.length);
});

check('removing a main row takes its subtasks and scrubs dependencies', () => {
    const rows = rowsFromTemplate(TEMPLATE);
    const planlama = byTitle(rows, 'Planlama');
    const after = removeRow(rows, planlama.key);
    assert.deepEqual(titles(after), ['Dizayn', 'Sevkiyat']);
    assert.deepEqual(byTitle(after, 'Sevkiyat').dependsOn, [byTitle(rows, 'Dizayn').key]);
});

check('a department change carries down to subtasks', () => {
    const rows = rowsFromTemplate(TEMPLATE);
    const after = setRowDepartment(rows, byTitle(rows, 'Planlama').key, 'procurement');
    assert.equal(byTitle(after, 'CNC Kesim').department, 'procurement');
    assert.equal(byTitle(after, 'Dizayn').department, 'design');
});

check('manual rows: main after the last sequence, subtask under its parent', () => {
    let rows = rowsFromTemplate(TEMPLATE);
    const main = newMainRow(rows, [], 'painting', 'Boya');
    assert.equal(main.sequence, 7);
    assert.equal(main.title, 'Boya');
    rows = [...rows, main];
    const sub = newSubRow(rows, byTitle(rows, 'Planlama').key);
    assert.equal(sub.sequence, 3);
    assert.equal(sub.department, 'planning');
});

check('cloning re-links copies and re-bases sequences for the target', () => {
    const source = rowsFromTemplate(TEMPLATE, { sequenceBase: 4 });
    const copy = cloneRows(source, { sequenceBase: 0 });
    assert.deepEqual(copy.filter((r) => !r.parentKey).map((r) => r.sequence), [1, 2, 6]);
    assert.ok(copy.every((r) => !source.some((s) => s.key === r.key)));
    assert.equal(byTitle(copy, 'CNC Kesim').parentKey, byTitle(copy, 'Planlama').key);
    assert.deepEqual(new Set(byTitle(copy, 'Sevkiyat').dependsOn), new Set([byTitle(copy, 'Planlama').key, byTitle(copy, 'Dizayn').key]));
});

check('payload: negative temp ids per plan, parents and in-plan deps only', () => {
    const rows = rowsFromTemplate(TEMPLATE);
    const plans = new Map([
        ['900-01', []],
        ['900-01-01', rows],
        ['900-01-02', [newMainRow([], [], 'design', 'Dizayn')]],
    ]);
    const { plans: out } = buildBulkPlanPayload(plans, ['900-01', '900-01-01', '900-01-02']);
    assert.deepEqual(out.map((p) => p.job_order), ['900-01-01', '900-01-02']);
    const [first, second] = out;
    assert.deepEqual(first.tasks.map((t) => t.temp_id), [-1, -2, -3, -4, -5]);
    const tempOf = (title) => first.tasks[rows.indexOf(byTitle(rows, title))].temp_id;
    const cnc = first.tasks.find((t) => t.title === 'CNC Kesim');
    assert.equal(cnc.parent, tempOf('Planlama'));
    assert.equal(cnc.task_type, 'cnc_cutting');
    assert.deepEqual(first.dependencies, [{ task: tempOf('Sevkiyat'), depends_on: [tempOf('Planlama'), tempOf('Dizayn')] }]);
    assert.equal(second.tasks[0].temp_id, -1);
    assert.equal('parent' in second.tasks[0], false);
});

check('error temp_id maps back to its row', () => {
    const rows = rowsFromTemplate(TEMPLATE);
    assert.equal(rowKeyForTempId(rows, -3), rows[2].key);
    assert.equal(rowKeyForTempId(rows, -99), null);
});

check('validation catches what the backend would refuse', () => {
    const rows = rowsFromTemplate(TEMPLATE);
    const sub = { ...newSubRow(rows, byTitle(rows, 'Planlama').key), title: '  ' };
    const bad = [...rows.map((r) => (r.title === 'Dizayn' ? { ...r, weight: 0 } : r)), sub];
    const messages = validatePlan(bad).map((p) => p.message);
    assert.deepEqual(messages.sort(), ['Alt görev başlığı boş', 'Ağırlık en az 1 olmalı']);
    assert.deepEqual(validatePlan(rows), []);
});

check('summary and template detection', () => {
    const plans = new Map([['a', rowsFromTemplate(TEMPLATE)], ['b', []], ['c', [newMainRow([], [], 'design', '')]]]);
    assert.deepEqual(summarizePlans(plans), { jobCount: 2, taskCount: 6 });
    assert.equal(planHasTemplate(plans.get('a'), '2'), true);
    assert.equal(planHasTemplate(plans.get('c'), 2), false);
});

if (failures) {
    console.log(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall passing');
