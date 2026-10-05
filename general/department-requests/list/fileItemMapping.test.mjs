/**
 * Tests for department-request create file→item mapping after a row delete.
 *
 *     node general/department-requests/list/fileItemMapping.test.mjs
 */

import assert from 'node:assert/strict';
import { shiftAttachTargets } from './fileItemMapping.js';

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

console.log('shiftAttachTargets');

check('delete first of three keeps a file on the last item (index 2 → 1)', () => {
    assert.deepEqual(shiftAttachTargets([2], 0), [1]);
});

check('delete middle of three keeps a file on the last item (index 2 → 1)', () => {
    assert.deepEqual(shiftAttachTargets([2], 1), [1]);
});

check('delete first of three keeps a file on the second item (index 1 → 0)', () => {
    assert.deepEqual(shiftAttachTargets([1], 0), [0]);
});

check('delete the mapped item drops it', () => {
    assert.deepEqual(shiftAttachTargets([0], 0), []);
    assert.deepEqual(shiftAttachTargets([1], 1), []);
});

check('delete first keeps both later items as 0 and 1', () => {
    assert.deepEqual(shiftAttachTargets([1, 2], 0), [0, 1]);
});

check('delete middle keeps first and shifts last (0 and 2 → 0 and 1)', () => {
    assert.deepEqual(shiftAttachTargets([0, 2], 1), [0, 1]);
});

check('request-level target is left alone', () => {
    assert.deepEqual(shiftAttachTargets(['request', 2], 0), ['request', 1]);
    assert.deepEqual(shiftAttachTargets(['request'], 1), ['request']);
});

check('empty / missing attachTo is safe', () => {
    assert.deepEqual(shiftAttachTargets([], 0), []);
    assert.deepEqual(shiftAttachTargets(null, 0), []);
});

check('double-adjust (remap then shift) is the bug this replaces', () => {
    // updateItemIndices remapped remaining oldIndex→newIndex, then removeItem
    // also decremented indices > deleted. File on item 2 after deleting 0:
    const remapped = [2].map((t) => (t === 2 ? 1 : t)); // 2 → 1
    const doubleAdjusted = shiftAttachTargets(remapped, 0); // 1 → 0
    assert.deepEqual(doubleAdjusted, [0]);
    assert.deepEqual(shiftAttachTargets([2], 0), [1]);
});

check('double-adjust after deleting the middle row drops the last item file', () => {
    const remapped = [2].map((t) => (t === 2 ? 1 : t)); // 2 → 1
    const doubleAdjusted = shiftAttachTargets(remapped, 1); // 1 filtered out
    assert.deepEqual(doubleAdjusted, []);
    assert.deepEqual(shiftAttachTargets([2], 1), [1]);
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
