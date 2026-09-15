/**
 * Order of the job-order groups on a sheet.
 *
 *  'job_no' — by iş emri number (numeric-aware Turkish collation). The
 *             default since 2026-08-29: a planner looking for 293-03-07
 *             finds it where the numbers say it is, on every sheet.
 *  'start'  — by planned start, earliest first: the resource's timeline
 *             read top to bottom, the way the team Excel sheets were laid
 *             out (Halit Nalbant, 2026-09-15). Undated jobs go last; ties
 *             fall back to the job number so the order is stable.
 */
export const SORT_MODES = ['job_no', 'start'];
export const DEFAULT_SORT = 'job_no';

export function normalizeSortMode(mode) {
    return SORT_MODES.includes(mode) ? mode : DEFAULT_SORT;
}

export function compareJobNos(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'tr',
        { numeric: true, sensitivity: 'base' });
}

/**
 * Comparator over job numbers for the given mode. `startOf(jobNo)` returns
 * the 'YYYY-MM-DD' start the sheet shows for that job, or null.
 */
export function compareJobsBy(mode, startOf) {
    if (normalizeSortMode(mode) !== 'start') return compareJobNos;
    return (a, b) => {
        const sa = startOf(a) || null;
        const sb = startOf(b) || null;
        if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
        if (sa && !sb) return -1;
        if (!sa && sb) return 1;
        return compareJobNos(a, b);
    };
}

/** Earliest of the given 'YYYY-MM-DD' strings; null when none is set. */
export function earliestDate(dates) {
    let out = null;
    for (const d of dates || []) {
        if (d && (!out || d < out)) out = d;
    }
    return out;
}
