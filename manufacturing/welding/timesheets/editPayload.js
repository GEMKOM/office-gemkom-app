/**
 * PATCH body for PUT/PATCH /welding/timesheets/submissions/{id}/.
 *
 * The 49baf3e phone-like editor stored the draft as `jobs: [{job_no, cells}]`
 * and sent that field name to the server. The submissions API (and the
 * welder's /mobile/submit/) take `rows`. A wrong field is ignored, Kaydet
 * still returns 200, and Onayla then books the unedited hours.
 *
 * Keep original row `key`s so a keyed PATCH still updates the same lines,
 * and emit a cleared row for any source key the editor dropped so those
 * hours are not left on the submission.
 */

export const CELL_COUNT = 15;

export function padCells(cells, length = CELL_COUNT) {
    return Array.from({ length }, (_, i) => !!(cells && cells[i]));
}

function sourceForJob(job, sourceRows, usedKeys) {
    if (job.key && !usedKeys.has(job.key)) {
        return (sourceRows || []).find((row) => row.key === job.key) || { key: job.key, kind: job.kind };
    }
    return (sourceRows || []).find((row) => (
        row.job_no && String(row.job_no) === String(job.job_no) && row.key && !usedKeys.has(row.key)
    ));
}

/**
 * @param {{blankDay?: boolean, note?: string, jobs?: Array<{key?: string, kind?: string, job_no?: string, cells?: boolean[]}>, sourceRows?: Array<{key?: string, kind?: string, job_no?: string}>, cellCount?: number}} draft
 */
export function buildSubmissionEdits(draft = {}) {
    const cellCount = draft.cellCount || CELL_COUNT;
    const note = draft.note || '';
    if (draft.blankDay) {
        return { blank_day: true, note, rows: [] };
    }

    const usedKeys = new Set();
    const rows = [];

    for (const job of draft.jobs || []) {
        if (!job.job_no || !(job.cells || []).some(Boolean)) continue;
        const source = sourceForJob(job, draft.sourceRows, usedKeys);
        const item = { cells: padCells(job.cells, cellCount) };
        if (source && source.key) {
            item.key = source.key;
            usedKeys.add(source.key);
            if (source.kind === 'blank' || !source.kind) item.job_no = job.job_no;
        } else {
            item.job_no = job.job_no;
            const blank = (draft.sourceRows || []).find((row) => (
                row.kind === 'blank' && row.key && !usedKeys.has(row.key)
            ));
            if (blank) {
                item.key = blank.key;
                usedKeys.add(blank.key);
            }
        }
        rows.push(item);
    }

    for (const source of draft.sourceRows || []) {
        if (!source.key || usedKeys.has(source.key)) continue;
        const item = { key: source.key, cells: padCells([], cellCount) };
        if (source.kind === 'blank') item.job_no = '';
        rows.push(item);
    }

    return { blank_day: false, note, rows };
}
