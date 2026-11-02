/**
 * Tests for the subtask_schedule a dirty block sends on bulk-save.
 *
 *     node planning/project-planning/blockSchedulePatch.test.mjs
 */

import assert from 'node:assert/strict';
import { blockSchedulePatch } from './blockSchedulePatch.js';

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

// 284-07: the second subcontractor's unit, started 20.06.2026.
const saved = { actual_start_date: '2026-06-20' };
const unset = { actual_start_date: null };
const subtask = (actual_start_date) => ({ status: 'in_progress', progress: 40, actual_start_date });

console.log('blockSchedulePatch');
check('unstaged block, date unchanged: status + progress exactly, no date key', () => {
    const patch = blockSchedulePatch(saved, subtask('2026-06-20'), false);
    assert.deepEqual(patch, { status: 'in_progress', progress: 40 });
    assert.equal('actual_start_date' in patch, false);
    assert.deepEqual(blockSchedulePatch(unset, subtask(null), false),
        { status: 'in_progress', progress: 40 });
});
check('staged block, date unchanged: nothing to send', () => {
    assert.equal(blockSchedulePatch(saved, subtask('2026-06-20'), true), null);
    assert.equal(blockSchedulePatch(unset, subtask(null), true), null);
});
check('unstaged block, date entered: travels next to status + progress', () => {
    assert.deepEqual(blockSchedulePatch(unset, subtask('2026-06-20'), false),
        { status: 'in_progress', progress: 40, actual_start_date: '2026-06-20' });
});
check('staged block, date entered: the date alone, never status or progress', () => {
    const patch = blockSchedulePatch(unset, subtask('2026-06-20'), true);
    assert.deepEqual(patch, { actual_start_date: '2026-06-20' });
    assert.equal('status' in patch, false);
    assert.equal('progress' in patch, false);
});
check('cleared date is sent as an explicit null, on both shapes', () => {
    const unstaged = blockSchedulePatch(saved, subtask(null), false);
    assert.equal('actual_start_date' in unstaged, true);
    assert.equal(unstaged.actual_start_date, null);
    assert.deepEqual(blockSchedulePatch(saved, subtask(null), true), { actual_start_date: null });
});
check('moved date is sent as the new one', () => {
    assert.deepEqual(blockSchedulePatch(saved, subtask('2026-02-12'), true),
        { actual_start_date: '2026-02-12' });
});
check('no snapshot (block adopted mid-save) counts as no date', () => {
    assert.equal(blockSchedulePatch(undefined, subtask(null), true), null);
    assert.deepEqual(blockSchedulePatch(undefined, subtask('2026-06-20'), true),
        { actual_start_date: '2026-06-20' });
});
check('a subtask that never carried the field is unchanged', () => {
    assert.equal(blockSchedulePatch({}, { status: 'pending', progress: 0 }, true), null);
    assert.deepEqual(blockSchedulePatch({}, { status: 'pending', progress: 0 }, false),
        { status: 'pending', progress: 0 });
});

if (failures) {
    console.error(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
