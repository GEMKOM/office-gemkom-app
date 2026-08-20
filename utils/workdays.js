/**
 * Working-day (iş günü) date arithmetic — the client mirror of the backend's
 * projects/services/schedule.py, so the welding planning page can reconcile
 * date↔duration edits instantly while the server re-validates on save.
 *
 * Semantics (must stay in lockstep with the backend):
 *  - weekends count 0, full public holidays 0, half-day holidays (Arife) 0.5,
 *    ordinary weekdays 1 — so durations are multiples of 0.5;
 *  - spanEnd(start, n): the start day counts (a 1-workday task starting
 *    Monday ends Monday); a weekend/holiday start rolls forward;
 *  - spanStart(end, n): mirror — the end day counts, rolls backward;
 *  - workingDaysInclusive(start, end): closed interval [start, end].
 *
 * All dates are 'YYYY-MM-DD' strings. Never round-trip through
 * `new Date('YYYY-MM-DD')` for arithmetic — UTC parsing shifts the calendar
 * date in +03:00; this module only uses (y, m, d) constructor parts.
 */

const MAX_WALK_DAYS = 1100;

function toParts(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function toStr(date) {
    return `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, '0')}-` +
        `${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    const d = toParts(dateStr);
    d.setDate(d.getDate() + days);
    return toStr(d);
}

/**
 * Build a workday calendar from the board payload's holiday list.
 * @param {Array<{date: string, is_half_day: boolean}>} holidays
 */
export function createWorkdayCalendar(holidays = []) {
    const holidayValues = new Map();
    for (const h of holidays) {
        holidayValues.set(h.date, h.is_half_day ? 0.5 : 0);
    }

    function dayValue(dateStr) {
        const dow = toParts(dateStr).getDay(); // 0=Sun, 6=Sat
        if (dow === 0 || dow === 6) return 0;
        const holiday = holidayValues.get(dateStr);
        return holiday === undefined ? 1 : holiday;
    }

    function isWorkday(dateStr) {
        return dayValue(dateStr) > 0;
    }

    function isNonWorkingDay(dateStr) {
        return dayValue(dateStr) === 0;
    }

    /** Working-day length of [start, end]; null if missing/reversed. */
    function workingDaysInclusive(startStr, endStr) {
        if (!startStr || !endStr || endStr < startStr) return null;
        let total = 0;
        let current = startStr;
        for (let i = 0; i < MAX_WALK_DAYS && current <= endStr; i++) {
            total += dayValue(current);
            current = addDays(current, 1);
        }
        return total;
    }

    /** End date of a task of `durationWd` working days starting ON startStr. */
    function spanEnd(startStr, durationWd) {
        if (!startStr || !durationWd || durationWd <= 0) return startStr;
        let total = dayValue(startStr);
        let current = startStr;
        for (let i = 0; i < MAX_WALK_DAYS; i++) {
            if (total >= durationWd) return current;
            current = addDays(current, 1);
            total += dayValue(current);
        }
        return current;
    }

    /** Start date of a task of `durationWd` working days ending ON endStr. */
    function spanStart(endStr, durationWd) {
        if (!endStr || !durationWd || durationWd <= 0) return endStr;
        let total = dayValue(endStr);
        let current = endStr;
        for (let i = 0; i < MAX_WALK_DAYS; i++) {
            if (total >= durationWd) return current;
            current = addDays(current, -1);
            total += dayValue(current);
        }
        return current;
    }

    return {
        dayValue,
        isWorkday,
        isNonWorkingDay,
        workingDaysInclusive,
        spanEnd,
        spanStart,
    };
}

/**
 * Client mirror of the backend's reconcile_schedule: given the edited field,
 * return the consistent {duration_wd, start_date, end_date} triple.
 *
 * @param {'start'|'end'|'duration'} editedField
 * @param {{duration_wd: ?number, start_date: ?string, end_date: ?string}} row
 * @param calendar from createWorkdayCalendar
 * @returns {{duration_wd: ?number, start_date: ?string, end_date: ?string}}
 *          or {error: string} when the edit is invalid.
 */
export function reconcileScheduleEdit(editedField, row, calendar) {
    let { duration_wd: duration, start_date: start, end_date: end } = row;

    if (start && end && end < start) {
        return { error: 'Bitiş tarihi başlangıç tarihinden önce olamaz.' };
    }

    if (editedField === 'start' || editedField === 'duration') {
        if (editedField === 'start' && !start) {
            // start cleared: keep end + duration
        } else if (start && duration > 0) {
            end = calendar.spanEnd(start, duration);
        } else if (start && end) {
            duration = calendar.workingDaysInclusive(start, end);
        } else if (end && duration > 0) {
            start = calendar.spanStart(end, duration);
        }
    } else if (editedField === 'end') {
        if (!end) {
            if (start && duration > 0) end = calendar.spanEnd(start, duration);
        } else if (start) {
            duration = calendar.workingDaysInclusive(start, end);
            end = calendar.spanEnd(start, duration); // snap off weekends/holidays
        } else if (duration > 0) {
            start = calendar.spanStart(end, duration);
        }
    }

    return { duration_wd: duration, start_date: start, end_date: end };
}
