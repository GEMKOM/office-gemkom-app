/**
 * Tests for planning-request item data-index allocation after a middle-row delete.
 *
 *     node planning/department-requests/itemIndex.test.mjs
 */

import assert from 'node:assert/strict';
import {
    nextItemIndex,
    shiftAttachTargets,
    jobNoForRow
} from './itemIndex.js';

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

function dropdown(jobNo) {
    return { getValue: () => jobNo };
}

console.log('itemIndex');

check('empty form starts at 0', () => {
    assert.equal(nextItemIndex([]), 0);
});

check('contiguous rows allocate the next length', () => {
    assert.equal(nextItemIndex([0, 1, 2]), 3);
});

check('deleting a middle row does not reuse the survivor index', () => {
    const remaining = [0, 2];
    // children.length would be 2 and collide with the live data-index=2 row
    assert.equal(remaining.length, 2);
    assert.equal(nextItemIndex(remaining), 3);
    assert.notEqual(nextItemIndex(remaining), 2);
});

check('file attach_to drops the deleted item and shifts later ones', () => {
    assert.deepEqual(shiftAttachTargets(['request', 1, 2], 1), ['request', 1]);
    assert.deepEqual(shiftAttachTargets([1], 1), []);
    assert.deepEqual(shiftAttachTargets(['request'], 1), ['request']);
});

check('delete middle then add keeps each surviving job and the new one', () => {
    const dropdowns = new Map([
        [0, dropdown('270-01')],
        [1, dropdown('270-02')],
        [2, dropdown('270-03')]
    ]);
    dropdowns.delete(1);
    const addIndex = nextItemIndex([0, 2]);
    dropdowns.set(addIndex, dropdown('270-04'));

    assert.equal(addIndex, 3);
    assert.equal(jobNoForRow(dropdowns, 0), '270-01');
    assert.equal(jobNoForRow(dropdowns, 2), '270-03');
    assert.equal(jobNoForRow(dropdowns, 3), '270-04');
});

check('children.length allocation overwrites the survivor job', () => {
    const dropdowns = new Map([
        [0, dropdown('270-01')],
        [2, dropdown('270-03')]
    ]);
    dropdowns.set([0, 2].length, dropdown('270-04'));
    assert.equal(jobNoForRow(dropdowns, 2), '270-04');
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
