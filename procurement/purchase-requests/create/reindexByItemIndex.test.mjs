/**
 * Tests for shifting offer / recommendation maps after a material row is deleted.
 *
 *     node procurement/purchase-requests/create/reindexByItemIndex.test.mjs
 */

import assert from 'node:assert/strict';
import {
    reindexKeyedByItemIndex,
    reindexOffersByItemIndex,
} from './reindexByItemIndex.js';

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

console.log('reindexByItemIndex');

check('deleting a middle row keeps the last item on its original supplier', () => {
    const recs = { 0: 's1', 1: 's2', 2: 's1' };
    assert.deepEqual(reindexKeyedByItemIndex(recs, 1), { 0: 's1', 1: 's1' });
});

check('deleting the first row shifts later recommendations down', () => {
    const recs = { 0: 's1', 1: 's2', 2: 's3' };
    assert.deepEqual(reindexKeyedByItemIndex(recs, 0), { 0: 's2', 1: 's3' });
});

check('deleting the last row drops only that key', () => {
    const recs = { 0: 's1', 1: 's2', 2: 's3' };
    assert.deepEqual(reindexKeyedByItemIndex(recs, 2), { 0: 's1', 1: 's2' });
});

check('always reindexes a supplier that never quoted the deleted row', () => {
    const offers = {
        s1: {
            0: { unitPrice: 10, totalPrice: 10, deliveryDays: 7 },
            1: { unitPrice: 20, totalPrice: 20, deliveryDays: 7 },
            2: { unitPrice: 30, totalPrice: 30, deliveryDays: 7 },
        },
        s2: {
            0: { unitPrice: 11, totalPrice: 11, deliveryDays: 5 },
            2: { unitPrice: 33, totalPrice: 33, deliveryDays: 5 },
        },
    };
    const next = reindexOffersByItemIndex(offers, 1);
    assert.deepEqual(Object.keys(next.s1).map(Number).sort(), [0, 1]);
    assert.equal(next.s1[1].unitPrice, 30);
    assert.deepEqual(Object.keys(next.s2).map(Number).sort(), [0, 1]);
    assert.equal(next.s2[1].unitPrice, 33);
});

check('empty or missing maps stay empty', () => {
    assert.deepEqual(reindexKeyedByItemIndex(null, 0), {});
    assert.deepEqual(reindexOffersByItemIndex(undefined, 1), {});
});

if (failures) {
    console.error(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall ok');
