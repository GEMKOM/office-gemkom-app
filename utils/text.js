/**
 * Shared text helpers.
 *
 * `escapeHtml` used to be redefined in ~30 files with three slightly different
 * bodies (some escaped quotes, some didn't). This is the strict version — it
 * escapes all five entities, so it is safe in attribute context as well as in
 * text context. Import it; do not hand-roll another one.
 */

const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

/** Escape a value for interpolation into HTML text or an attribute. */
export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

/** Escape, then turn newlines into <br> — for plain (non-rich) multi-line text. */
export function escapeHtmlWithBreaks(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
}
