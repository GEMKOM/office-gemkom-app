/**
 * Tests for overtime participant row-index allocation.
 *
 *     node general/overtime/registry/participantIndex.test.mjs
 */

import assert from 'node:assert/strict';
import { nextRowIndex, lookupByRowIndex } from './participantIndex.js';

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

console.log('participantIndex');

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
    // children.length would be 2 and collide with Carol's still-live row.
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

check('reusing a live index overwrites the surviving dropdown on submit', () => {
    const byIndex = new Map([
        [0, 'Alice'],
        [1, 'Bob'],
        [2, 'Carol'],
    ]);
    byIndex.delete(1);
    // Old allocator: children.length === 2, which is still Carol.
    byIndex.set(2, 'Dave');
    const submitted = lookupByRowIndex([0, 2, 2], byIndex);
    assert.deepEqual(submitted, ['Alice', 'Dave', 'Dave']);
});

check('unique index after a middle delete keeps the surviving person', () => {
    const byIndex = new Map([
        [0, 'Alice'],
        [1, 'Bob'],
        [2, 'Carol'],
    ]);
    byIndex.delete(1);
    const live = [0, 2];
    const allocated = nextRowIndex(live);
    byIndex.set(allocated, 'Dave');
    const submitted = lookupByRowIndex([...live, allocated], byIndex);
    assert.deepEqual(submitted, ['Alice', 'Carol', 'Dave']);
});

if (failures) {
    console.error(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
