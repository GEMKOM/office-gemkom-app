/**
 * Shared helpers for the management dashboard renderers.
 * Number parsing is null-safe: the API sends decimals as strings ('1412300.0')
 * and money as null when hidden — a null must never render as 0 or '€0'.
 */
import { escapeHtml } from '../../../utils/text.js';
import { formatEurCompact, formatTons, formatWd } from '../../../apis/formatters.js';

export { escapeHtml, formatEurCompact, formatTons, formatWd };

/** Parse an API number (string decimal, number) → number | null. */
export function pf(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/** Number or 0 (for counts that may be missing). */
export function n0(v) {
    const n = pf(v);
    return n === null ? 0 : n;
}

/** tr-TR number: num('1234.5', 1) → '1.234,5'. '' for null. */
export function num(v, d = 0) {
    const n = pf(v);
    if (n === null) return '';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Percent: pct(25) → '%25', pct(28.6, 1) → '%28,6'. '' for null. */
export function pct(v, d = 0) {
    const n = pf(v);
    if (n === null) return '';
    return `%${n.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

const TZ = 'Europe/Istanbul';
const hhmm = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayMon = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short' });
const dayMonYear = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, month: 'short', year: '2-digit' });

function toDate(v) {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO datetime → 'hh:mm' in Istanbul; '' when missing. */
export function stamp(iso) {
    const d = toDate(iso);
    return d ? hhmm.format(d) : '';
}

/** 'Veri 08:31' (or custom prefix); '' when missing. */
export function stampLabel(iso, prefix = 'Veri') {
    const s = stamp(iso);
    return s ? `${prefix} ${s}` : '';
}

/** 'YYYY-MM-DD' → '30 Eyl' (parsed at Istanbul noon so the day never shifts). */
export function shortDate(dateStr, withYear = false) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return '';
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0));
    return (withYear ? dayMonYear : dayMon).format(d);
}

/** 'YYYY-MM' → 'Eyl 26'. */
export function monthLabel(ym) {
    const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
    if (!m) return escapeHtml(ym);
    return monthFmt.format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 15, 9, 0, 0)));
}

/** 'YYYY-MM-DD' (week start) → '6 Tem'. */
export function weekLabel(dateStr) {
    return shortDate(dateStr);
}

/** requestAnimationFrame may never fire in a headless pane — fall back to a macrotask. */
export const raf = (cb) => setTimeout(cb, 0);

export const PHONE_MQ = '(max-width: 767.98px)';
export function isPhone() {
    try { return window.matchMedia(PHONE_MQ).matches; } catch (_) { return false; }
}

export function prefersReducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}

/** <span class="status-badge status-…">text</span> (words only via these classes). */
export function sbadge(color, text, title = '') {
    const c = ['grey', 'green', 'blue', 'red', 'orange', 'purple'].includes(color) ? color : 'grey';
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span class="status-badge status-${c} dash-badge"${t}>${escapeHtml(text)}</span>`;
}

/** Small inline chip inside a card line (same palette as status badges, smaller). */
export function chip(color, text, title = '') {
    const c = ['grey', 'green', 'blue', 'red', 'orange', 'purple'].includes(color) ? color : 'grey';
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span class="dash-chip dash-chip-${c}"${t}>${escapeHtml(text)}</span>`;
}

/** Join non-empty parts with ' · '. */
export function dots(...parts) {
    return parts.filter((p) => p !== null && p !== undefined && p !== '').join(' · ');
}

/** Job-order link into project tracking (the only filtered deep link that exists). */
export function jobLink(jobNo, text = null) {
    if (!jobNo) return '—';
    const href = `/projects/project-tracking?job_no=${encodeURIComponent(jobNo)}`;
    return `<a class="dash-job-link" href="${href}"><code class="job-number">${escapeHtml(text || jobNo)}</code></a>`;
}

/** Skeleton lines for a loading card. */
export function skeleton(lines = 3) {
    const rows = ['<div class="pp-skeleton pp-skeleton-title"></div>', '<div class="pp-skeleton pp-skeleton-big"></div>'];
    for (let i = 2; i < lines; i += 1) rows.push('<div class="pp-skeleton pp-skeleton-short"></div>');
    return `<div class="pp-tile-skeleton">${rows.join('')}</div>`;
}

/**
 * Lookup for a slow sub-block error: the contract names them 'slow.<section>_<sub>'
 * (e.g. slow.production_capacity) — accept the dotted and the bare spellings too.
 */
export function slowError(errors, section, sub) {
    if (!errors || typeof errors !== 'object') return null;
    const keys = sub
        ? [`slow.${section}_${sub}`, `slow.${section}.${sub}`, `slow.${sub}`, `slow.${section}`]
        : [`slow.${section}`, section];
    for (const k of keys) if (errors[k]) return String(errors[k]);
    return null;
}

/**
 * State of a slow sub-block for rendering.
 * @returns {'ready'|'pending'|'unavailable'|'failed'}
 *  ready       → value present
 *  pending     → not built yet and a ?block=slow fetch is in flight (show 'hesaplanıyor')
 *  unavailable → not built and nothing in flight / retries exhausted ('henüz hesaplanmadı')
 *  failed      → the slow tier exists but this block errored ('Bu blok yüklenemedi')
 */
export function slowState(value, { slowStatus, errors, section, sub }) {
    if (value !== null && value !== undefined) return 'ready';
    const err = slowError(errors, section, sub);
    const notBuilt = !err || /hen[uü]z hesaplanmad/i.test(err);
    if (notBuilt) {
        if (slowStatus === 'pending') return 'pending';
        return 'unavailable';
    }
    return 'failed';
}

export const SLOW_TEXT = {
    pending: 'hesaplanıyor…',
    unavailable: 'henüz hesaplanmadı',
    failed: 'yüklenemedi',
};

/** Money helper bound to meta.money_visible: returns '' when hidden or null. */
export function moneyFmt(meta) {
    const visible = !!(meta && meta.money_visible);
    return (v) => (visible ? formatEurCompact(v) : '');
}

export function hiddenMoneyBadge() {
    return sbadge('grey', '€ gizli', 'Tutarlar için maliyet görüntüleme yetkisi gerekir');
}
