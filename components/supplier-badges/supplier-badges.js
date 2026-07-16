// Shared renderers for supplier status badges and star ratings.
// Imported by the supplier list, the PR-creation supplier dropdown & cards,
// and the approval comparison table so all four surfaces stay consistent.
//
// SECURITY: supplier.name is user-controlled. Badge/star markup here is fully
// app-generated and safe to inject via innerHTML, but any supplier NAME printed
// alongside must be passed through escapeHtml() at the call site.

export function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

export const SUPPLIER_STATUS_META = {
    approved:    { label: 'Onaylı',     cls: 'status-green',  icon: 'fa-circle-check' },
    watch:       { label: 'İzlemede',   cls: 'status-yellow', icon: 'fa-eye' },
    blacklisted: { label: 'Kara Liste', cls: 'status-red',    icon: 'fa-ban' },
};

/**
 * Render a supplier lifecycle status badge.
 * @param {object} supplier - must have a `status` field.
 * @param {object} [opts]
 * @param {boolean} [opts.onlyWarn=false] - if true, render nothing for the
 *        'approved' status (keeps dropdowns/cards quiet unless there's a warning).
 * @returns {string} HTML (safe — app-generated markup only).
 */
export function renderSupplierStatusBadge(supplier, { onlyWarn = false } = {}) {
    const status = supplier?.status || 'approved';
    const meta = SUPPLIER_STATUS_META[status] || SUPPLIER_STATUS_META.approved;
    if (onlyWarn && status === 'approved') return '';
    return `<span class="status-badge ${meta.cls} supplier-status-badge">`
        + `<i class="fas ${meta.icon} me-1"></i>${meta.label}</span>`;
}

/**
 * Render a 0–5 star rating.
 * @param {number|string|null} score
 * @param {object} [opts]
 * @param {boolean} [opts.compact=false] - append the numeric value after the stars.
 * @returns {string} HTML (safe — app-generated markup only).
 */
export function renderStarRating(score, { compact = false } = {}) {
    const n = Number(score);
    if (!Number.isFinite(n)) return '<span class="text-muted small">—</span>';
    const full = Math.floor(n);
    const half = (n - full) >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    let stars = '<i class="fas fa-star"></i>'.repeat(Math.max(0, full))
        + (half ? '<i class="fas fa-star-half-stroke"></i>' : '')
        + '<i class="far fa-star"></i>'.repeat(Math.max(0, empty));
    return `<span class="supplier-stars text-warning" title="${n.toFixed(2)} / 5">${stars}</span>`
        + (compact ? ` <span class="small text-muted">${n.toFixed(1)}</span>` : '');
}

/**
 * Render an on-time-delivery percentage chip, or an em dash when unknown.
 * @param {number|string|null} pct
 * @returns {string} HTML (safe).
 */
export function renderOnTimePct(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n)) return '<span class="text-muted small">—</span>';
    let cls = 'status-green';
    if (n < 60) cls = 'status-red';
    else if (n < 85) cls = 'status-yellow';
    return `<span class="status-badge ${cls}">%${n.toFixed(0)}</span>`;
}
