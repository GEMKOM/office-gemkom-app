/**
 * Tests for the sheet's job-group ordering (İş No / Başlangıç toggle).
 *
 *     node manufacturing/welding/capacity-planning/jobSort.test.mjs
 */

import assert from 'node:assert/strict';
import {
    compareJobNos, compareJobsBy, earliestDate, normalizeSortMode,
} from './jobSort.js';

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

// Halit Nalbant's sheet on 2026-09-15: the block starts the sheet shows.
const starts = {
    '094-177-01': '2026-10-20',
    '094-177-02': '2026-10-20',
    '100-102': '2026-10-09',
    '195-35-01': null,             // İmalat start typed, no duration -> no plan
    '195-35-02': null,
    '293-05-01': '2026-09-13',
    '293-05-02': '2026-09-13',
    '293-11-02': '2026-12-07',
};
const jobs = Object.keys(starts);
const startOf = (jobNo) => starts[jobNo];

check('job_no: numeric-aware, so 094 < 100 < 195 < 293', () => {
    const out = jobs.slice().sort(compareJobsBy('job_no', startOf));
    assert.deepEqual(out, [
        '094-177-01', '094-177-02', '100-102', '195-35-01', '195-35-02',
        '293-05-01', '293-05-02', '293-11-02',
    ]);
});

check('start: earliest first, ties by job number, undated last', () => {
    const out = jobs.slice().sort(compareJobsBy('start', startOf));
    assert.deepEqual(out, [
        '293-05-01', '293-05-02',      // 13.09
        '100-102',                     // 09.10
        '094-177-01', '094-177-02',    // 20.10
        '293-11-02',                   // 07.12
        '195-35-01', '195-35-02',      // no start
    ]);
});

check('start: input order does not leak into the result', () => {
    const shuffled = ['293-11-02', '195-35-02', '094-177-02', '293-05-02',
        '100-102', '195-35-01', '293-05-01', '094-177-01'];
    const out = shuffled.sort(compareJobsBy('start', startOf));
    assert.deepEqual(out, jobs.slice().sort(compareJobsBy('start', startOf)));
});

check('start: all undated falls back to job number', () => {
    const out = ['293-05-01', '100-102'].sort(compareJobsBy('start', () => null));
    assert.deepEqual(out, ['100-102', '293-05-01']);
});

check('unknown mode is the job-number order', () => {
    assert.equal(normalizeSortMode('bogus'), 'job_no');
    assert.equal(normalizeSortMode(null), 'job_no');
    assert.equal(normalizeSortMode('start'), 'start');
    assert.equal(compareJobsBy('bogus', startOf), compareJobNos);
});

check('compareJobNos treats null as the empty string', () => {
    assert.ok(compareJobNos(null, '100-102') < 0);
    assert.equal(compareJobNos(null, undefined), 0);
});

check('earliestDate skips blanks and returns null for none', () => {
    assert.equal(earliestDate(['2026-10-20', null, '2026-09-13', '']), '2026-09-13');
    assert.equal(earliestDate([null, undefined]), null);
    assert.equal(earliestDate([]), null);
    assert.equal(earliestDate(undefined), null);
});

if (failures) {
    console.log(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall passed');
