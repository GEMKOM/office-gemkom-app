// Helpers for the timesheet-scan review form. Kept free of DOM / fetch so
// the ISO-date check can be unit-tested: a regex literal inside a template
// expression must use \d, not \\d (the latter matches a backslash + "d").

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
    return typeof value === 'string' && ISO_DATE_RE.test(value);
}

/** Value for <input type="date"> — empty unless the parsed date is YYYY-MM-DD. */
export function dateInputValue(value) {
    return isIsoDate(value) ? value : '';
}
