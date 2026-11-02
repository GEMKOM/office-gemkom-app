/**
 * Tests for CNC create-cut part row-index allocation.
 *
 *     node manufacturing/cnc-cutting/cuts/partIndex.test.mjs
 */

import assert from 'node:assert/strict';
import { nextRowIndex, lookupByRowIndex } from './partIndex.js';

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

console.log('partIndex');

check('empty container starts at 0', () => {
    assert.equal(nextRowIndex([]), 0);
});

check('sequential adds increment', () => {
    assert.equal(nextRowIndex([0]), 1);
    assert.equal(nextRowIndex([0, 1]), 2);
    assert.equal(nextRowIndex([0, 1, 2]), 3);
});

check('deleting the last row then adding reuses the hole at the end', () => {
    const live = [0, 1, 2].filter((i) => i !== 2);
    assert.deepEqual(live, [0, 1]);
    assert.equal(nextRowIndex(live), 2);
    assert.equal(live.includes(nextRowIndex(live)), false);
});

check('deleting a middle row then adding does not reuse the surviving index', () => {
    const live = [0, 1, 2].filter((i) => i !== 1);
    assert.deepEqual(live, [0, 2]);
    // children.length would be 2 and collide with the still-live last part.
    assert.equal(live.length, 2);
    const allocated = nextRowIndex(live);
    assert.equal(allocated, 3);
    assert.equal(live.includes(allocated), false);
});

check('deleting the first row then adding does not reuse a surviving index', () => {
    const live = [0, 1, 2].filter((i) => i !== 0);
    assert.deepEqual(live, [1, 2]);
    const allocated = nextRowIndex(live);
    assert.equal(allocated, 3);
    assert.equal(live.includes(allocated), false);
});

check('shifting the Map without updating DOM drops the survivor job on save', () => {
    const byIndex = new Map([
        [0, '100-01'],
        [1, '100-02'],
        [2, '100-03'],
    ]);
    byIndex.delete(1);
    // Old removePart compacted remaining keys (2 → 1) while DOM stayed 0, 2.
    const shifted = new Map();
    byIndex.forEach((value, oldIndex) => {
        shifted.set(oldIndex > 1 ? oldIndex - 1 : oldIndex, value);
    });
    const submitted = lookupByRowIndex([0, 2], shifted);
    assert.deepEqual(submitted, ['100-01', undefined]);
});

check('reusing a live index after a middle delete duplicates the new job', () => {
    const byIndex = new Map([
        [0, '100-01'],
        [1, '100-02'],
        [2, '100-03'],
    ]);
    byIndex.delete(1);
    // Old allocator: children.length === 2, which is still the last part.
    byIndex.set(2, '100-04');
    const submitted = lookupByRowIndex([0, 2, 2], byIndex);
    assert.deepEqual(submitted, ['100-01', '100-04', '100-04']);
});

check('unique index after a middle delete keeps every surviving job', () => {
    const byIndex = new Map([
        [0, '100-01'],
        [1, '100-02'],
        [2, '100-03'],
    ]);
    byIndex.delete(1);
    const live = [0, 2];
    const allocated = nextRowIndex(live);
    byIndex.set(allocated, '100-04');
    const submitted = lookupByRowIndex([...live, allocated], byIndex);
    assert.deepEqual(submitted, ['100-01', '100-03', '100-04']);
});

if (failures) {
    console.error(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
