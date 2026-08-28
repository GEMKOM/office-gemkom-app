/**
 * Tests for which schedule keys a dirty department row sends on bulk-save.
 *
 *     node manufacturing/welding/capacity-planning/deptSchedulePatch.test.mjs
 */

import assert from 'node:assert/strict';
import { deptSchedulePatch } from './deptSchedulePatch.js';

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

const imalat = {
    duration_wd: 8,
    entered_duration_wd: 20,
    start_date: '2026-08-03',
    end_date: '2026-08-14',
};

console.log('deptSchedulePatch');
check('child-date reflow does not send manufacturing duration', () => {
    const patch = deptSchedulePatch('manufacturing', new Set(['start_date']), imalat);
    assert.deepEqual(patch, {
        start_date: '2026-08-03',
        end_date: '2026-08-14',
    });
    assert.equal('duration_wd' in patch, false);
});
check('İmalat duration edit sends the entered number, not the date-span', () => {
    const patch = deptSchedulePatch('manufacturing', new Set(['duration_wd']), imalat);
    assert.deepEqual(patch, { duration_wd: 20 });
    assert.equal('start_date' in patch, false);
    assert.equal('end_date' in patch, false);
});
check('İmalat duration falls back to duration_wd when nothing was entered', () => {
    const patch = deptSchedulePatch(
        'manufacturing',
        new Set(['duration_wd']),
        { duration_wd: 12, entered_duration_wd: null, start_date: null, end_date: null },
    );
    assert.deepEqual(patch, { duration_wd: 12 });
});
check('welding date edit never sends duration', () => {
    const patch = deptSchedulePatch('welding', new Set(['start_date', 'end_date']), imalat);
    assert.deepEqual(patch, {
        start_date: '2026-08-03',
        end_date: '2026-08-14',
    });
    assert.equal('duration_wd' in patch, false);
});
check('status-only dirty sends no schedule keys', () => {
    assert.deepEqual(deptSchedulePatch('manufacturing', new Set(['status']), imalat), {});
});

if (failures) {
    console.error(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
