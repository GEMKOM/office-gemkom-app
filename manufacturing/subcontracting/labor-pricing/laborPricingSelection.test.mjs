/**
 * Tests for which job orders Parametreleri Kaydet persists onto.
 *
 *     node manufacturing/subcontracting/labor-pricing/laborPricingSelection.test.mjs
 */

import assert from 'node:assert/strict';
import { asJobNos, resolveSaveJobNos } from './laborPricingSelection.js';

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

console.log('laborPricingSelection');
check('multi-select dropdown value is the job list', () => {
    assert.deepEqual(asJobNos(['240-01', '240-02']), ['240-01', '240-02']);
});
check('empty dropdown is empty, not a leftover string', () => {
    assert.deepEqual(asJobNos([]), []);
    assert.deepEqual(asJobNos(''), []);
    assert.deepEqual(asJobNos(null), []);
    assert.deepEqual(asJobNos(undefined), []);
});
check('save follows the live dropdown, not the last Hesapla selection', () => {
    assert.deepEqual(
        resolveSaveJobNos({ filterJobNos: ['240-02'], computedJobNos: ['240-01', '240-02'] }),
        ['240-02'],
    );
});
check('clearing the dropdown does not fall back to the last compute', () => {
    assert.deepEqual(
        resolveSaveJobNos({ filterJobNos: [], computedJobNos: ['240-01'] }),
        [],
    );
});
check('save after adding a job without Hesapla includes the new job', () => {
    assert.deepEqual(
        resolveSaveJobNos({ filterJobNos: ['240-01', '240-02'], computedJobNos: ['240-01'] }),
        ['240-01', '240-02'],
    );
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall ok');
