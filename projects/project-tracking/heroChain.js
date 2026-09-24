/**
 * The hero's date chain — Başlangıç → Termin → Plan bitişi → Öngörülen in
 * one fixed row. Each working-day difference is written exactly once, on
 * the connector between the two dates it compares (plan vs termin, öngörülen
 * vs plan), and the termin-to-öngörülen total sits on a bracket above.
 * Shared by the meeting slide (meetingView.js) and the stand-alone Plan ve
 * Sapmalar page (plan-sheet/planSheetPage.js).
 *
 * The columns never reorder, so the eye finds each date in the same place on
 * every slide. An arrow therefore means "compared with", not "later than": a
 * plan that ends before its termin shows a green "−8 iş günü" on the very
 * connector a late plan shows "+12 iş günü" on. Missing data hides the pill
 * (and the bracket) but keeps the column, with "—" as the value.
 *
 * Pure string building, no DOM — heroChain.test.mjs runs it under node.
 * House rules: no yellow, no exclamation marks, working days are "iş günü".
 */
import { escapeHtml } from '../../utils/text.js';
import { dateLocale, sheetLang, tr } from './sheetLang.js';

function formatWd(value) {
    const abs = Math.abs(Number(value) || 0);
    const text = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1);
    return sheetLang() === 'en' ? text : text.replace('.', ',');
}

// "iş günü" / "working days" after a signed figure.
function wdUnit(n) {
    return tr('iş günü', Math.abs(n) === 1 ? 'working day' : 'working days');
}

/**
 * A signed working-day distance: {text, cls, kind} with kind late | early |
 * ok, or null when there is nothing to compare (no termin, no plan).
 */
export function signedWd(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = Number(value);
    if (Number.isNaN(raw)) return null;
    // The text shows one decimal, so anything that would print as 0,0 is
    // "tam gününde" rather than a red +0,0.
    const n = Math.round(raw * 10) / 10;
    if (n > 0) return { text: `+${formatWd(n)} ${wdUnit(n)}`, cls: 'ps-fig-late', kind: 'late' };
    if (n < 0) return { text: `−${formatWd(n)} ${wdUnit(n)}`, cls: 'ps-fig-early', kind: 'early' };
    return { text: tr('tam gününde', 'on the day'), cls: 'ps-fig-ok', kind: 'ok' };
}

// "30 Eylül 2026". A date-only value ("2026-09-30") is a calendar day, not
// an instant: parsed as local time so a viewer west of UTC (the customer
// link) does not see the termin a day early.
export function formatDateLong(value) {
    if (!value) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
}

const PENDING = '<span class="ps-fig-muted">…</span>';

const FIGURE_TITLE = {
    // Baslangic is when the ORDER was opened, not when the plan starts --
    // worth saying, now that a job with no plan shows "Plan bitisi —" right
    // beside it and the two would otherwise read as one window.
    start: () => tr('İş emrinin açıldığı tarih', 'When the order was opened'),
};

function figure(key, label, iso, pending, state) {
    const value = iso ? escapeHtml(formatDateLong(iso)) : (pending ? PENDING : '—');
    const tip = FIGURE_TITLE[key] ? ` title="${escapeHtml(FIGURE_TITLE[key]())}"` : '';
    return `
            <div class="ps-cf ps-cf-${key}${state ? ` is-${state.kind}` : ''}"${tip}>
                <label>${label}</label>
                <span class="ps-cf-value">${value}</span>
            </div>`;
}

// The connector between two figures: a line with an arrowhead and, when
// there is something to compare, the signed distance in a pill on it.
function connector(key, state) {
    if (!state) return `
            <div class="ps-ck ps-ck-${key} is-none"></div>`;
    return `
            <div class="ps-ck ps-ck-${key} is-${state.kind}"><span>${escapeHtml(state.text)}</span></div>`;
}

/**
 * @param {object} d
 * @param {string|null} d.start          job order opened (ISO)
 * @param {string|null} d.termin         the commitment (ISO)
 * @param {string|null} d.planEnd        the plan's end (ISO)
 * @param {string|null} d.projectedEnd   the plan plus today's deviations (ISO)
 * @param {number|null} d.planVsTerminWd plan end vs termin, working days
 * @param {number|null} d.deviationWd    projected end vs plan end, working days
 * @param {number|null} d.terminGapWd    projected end vs termin, working days
 * @param {boolean}     d.pending        the sheet is still loading: missing
 *                                       values show "…" instead of "—"
 */
export function heroChainHtml({
    start = null, termin = null, planEnd = null, projectedEnd = null,
    planVsTerminWd = null, deviationWd = null, terminGapWd = null, pending = false,
} = {}) {
    const planVs = signedWd(planVsTerminWd);
    const dev = signedWd(deviationWd);
    const gap = signedWd(terminGapWd);
    const bracket = gap ? `
            <div class="ps-chain-brk is-${gap.kind}"><span>${tr('Termine göre', 'Against due date')} <b>${escapeHtml(gap.text)}</b></span></div>` : '';
    return `
        <div class="ps-chain">${bracket}${figure('start', tr('Başlangıç', 'Start'), start, pending, null)}${connector('1', null)}${figure('termin', tr('Termin', 'Due date'), termin, pending, null)}${connector('2', planVs)}${figure('plan', tr('Plan bitişi', 'Plan end'), planEnd, pending, planVs)}${connector('3', dev)}${figure('proj', tr('Öngörülen', 'Projected'), projectedEnd, pending, dev)}
            <div class="ps-chain-base"></div>
        </div>`;
}
