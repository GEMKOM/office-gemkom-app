/**
 * Tests for the Puantaj Onayı submission PATCH body.
 *
 *     node manufacturing/welding/timesheets/editPayload.test.mjs
 */

import assert from 'node:assert/strict';
import { buildSubmissionEdits, padCells, CELL_COUNT } from './editPayload.js';

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

const weekday = [
    { key: 'pre-0', kind: 'preprinted', job_no: '270-01' },
    { key: 'gen', kind: 'general', job_no: '1000' },
    { key: 'blank-0', kind: 'blank', job_no: '195-02' },
];

check('sends rows, not jobs — otherwise Kaydet silently drops hour edits', () => {
    const body = buildSubmissionEdits({
        jobs: [{ job_no: '270-01', cells: [true, true] }],
        sourceRows: weekday,
    });
    assert.equal('jobs' in body, false);
    assert.ok(Array.isArray(body.rows));
    assert.equal(body.blank_day, false);
});

check('keeps the original key so a keyed PATCH updates the same line', () => {
    const cells = padCells([true, true, true]);
    const body = buildSubmissionEdits({
        jobs: [{ job_no: '270-01', cells }],
        sourceRows: weekday,
    });
    assert.equal(body.rows.length, 3);
    assert.deepEqual(body.rows[0], { key: 'pre-0', cells });
});

check('sends job_no only for blank (or new) rows, matching the previous editor', () => {
    const body = buildSubmissionEdits({
        jobs: [
            { job_no: '270-01', cells: [true] },
            { job_no: '195-02', cells: [false, true] },
        ],
        sourceRows: weekday,
    });
    const blank = body.rows.find((row) => row.key === 'blank-0');
    assert.equal(blank.job_no, '195-02');
    const printed = body.rows.find((row) => row.key === 'pre-0');
    assert.equal('job_no' in printed, false);
});

check('a newly added job reuses an unused blank-row key when the sheet has one', () => {
    const cells = padCells([true]);
    const body = buildSubmissionEdits({
        jobs: [{ job_no: '280-03', cells }],
        sourceRows: weekday,
    });
    const added = body.rows.find((row) => row.job_no === '280-03');
    assert.deepEqual(added, { key: 'blank-0', job_no: '280-03', cells });
});

check('a newly added job is sent as job_no + cells when there is no blank slot (no invented key)', () => {
    const cells = padCells([true]);
    const body = buildSubmissionEdits({
        jobs: [{ job_no: '280-03', cells }],
        sourceRows: [
            { key: 'pre-0', kind: 'preprinted', job_no: '270-01' },
        ],
    });
    const added = body.rows.find((row) => row.job_no === '280-03');
    assert.deepEqual(added, { job_no: '280-03', cells });
    assert.equal('key' in added, false);
});

check('dropped jobs emit a cleared row so leftover hours are not approved', () => {
    const body = buildSubmissionEdits({
        jobs: [{ job_no: '270-01', cells: [true] }],
        sourceRows: weekday,
    });
    const cleared = body.rows.filter((row) => !row.cells.some(Boolean));
    assert.deepEqual(cleared.map((row) => row.key).sort(), ['blank-0', 'gen']);
    assert.equal(cleared.find((row) => row.key === 'blank-0').job_no, '');
    assert.equal('job_no' in cleared.find((row) => row.key === 'gen'), false);
});

check('blank day matches the phone submit: empty rows, blank_day true', () => {
    const body = buildSubmissionEdits({
        blankDay: true,
        note: 'izin',
        jobs: [{ job_no: '270-01', cells: [true] }],
        sourceRows: weekday,
    });
    assert.deepEqual(body, { blank_day: true, note: 'izin', rows: [] });
});

check('jobs with no marked cells are omitted from the active set', () => {
    const body = buildSubmissionEdits({
        jobs: [
            { job_no: '270-01', cells: [false, false] },
            { job_no: '1000', cells: [true] },
        ],
        sourceRows: weekday,
    });
    assert.equal(body.rows.some((row) => row.key === 'pre-0' && row.cells.some(Boolean)), false);
    assert.equal(body.rows.find((row) => row.key === 'gen').cells[0], true);
});

check('pads cells to the timesheet layout length', () => {
    const body = buildSubmissionEdits({
        jobs: [{ job_no: '270-01', cells: [true] }],
        sourceRows: weekday,
    });
    assert.equal(body.rows[0].cells.length, CELL_COUNT);
    assert.equal(body.rows[0].cells[0], true);
    assert.equal(body.rows[0].cells[1], false);
});

check('prefers the job\'s own key when the editor still has it', () => {
    const cells = padCells([true]);
    const body = buildSubmissionEdits({
        jobs: [{ key: 'blank-0', kind: 'blank', job_no: '195-02', cells }],
        sourceRows: weekday,
    });
    assert.deepEqual(body.rows[0], { key: 'blank-0', cells, job_no: '195-02' });
});

if (failures) {
    console.log(`\n${failures} failing`);
    process.exit(1);
}
console.log('\nall passed');
