/**
 * Timesheet scan review: date-input seeding and ISO check.
 *
 *     node manufacturing/welding/timesheets/scans/scanForm.test.mjs
 */

import assert from 'node:assert/strict';
import { ISO_DATE_RE, isIsoDate, dateInputValue } from './scanForm.js';

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

console.log('isIsoDate');
check('accepts YYYY-MM-DD', () => {
    assert.equal(isIsoDate('2026-10-08'), true);
    assert.equal(isIsoDate('2026-01-01'), true);
});
check('rejects empty, null, and non-strings', () => {
    assert.equal(isIsoDate(''), false);
    assert.equal(isIsoDate(null), false);
    assert.equal(isIsoDate(undefined), false);
    assert.equal(isIsoDate(20261008), false);
});
check('rejects datetimes and dotted dates', () => {
    assert.equal(isIsoDate('2026-10-08T00:00:00Z'), false);
    assert.equal(isIsoDate('08.10.2026'), false);
    assert.equal(isIsoDate('2026/10/08'), false);
});

console.log('dateInputValue');
check('seeds the date input from a parsed ISO date', () => {
    assert.equal(dateInputValue('2026-10-08'), '2026-10-08');
});
check('stays empty when the date is missing or not ISO', () => {
    assert.equal(dateInputValue(''), '');
    assert.equal(dateInputValue(null), '');
    assert.equal(dateInputValue('08.10.2026'), '');
});

console.log('over-escaped regex (the bug this locks in)');
check('a regex literal with \\\\d does not match ISO dates', () => {
    // What the review template had: /^\\d{4}-\\d{2}-\\d{2}$/ inside ${}.
    // In a regex literal that is backslash + "d", not a digit class.
    const overEscaped = /^\\d{4}-\\d{2}-\\d{2}$/;
    assert.equal(overEscaped.test('2026-10-08'), false);
    assert.equal(ISO_DATE_RE.test('2026-10-08'), true);
});

if (failures) {
    console.log(`\n${failures} failed`);
    process.exit(1);
}
console.log('\nall passed');
