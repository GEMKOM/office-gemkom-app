/**
 * Formatting helpers and status maps for the Ödeme Listeleri page.
 * Backend decimals arrive as strings — always go through num() before math.
 */
import { formatDate } from '../../apis/formatters.js';
import { escapeHtml } from '../../utils/text.js';

export const LIST_STATUS_CLASS = {
    draft: 'status-grey',
    submitted: 'status-orange',
    approved: 'status-blue',
    sent_to_finance: 'status-purple',
    completed: 'status-green',
    rejected: 'status-red',
    cancelled: 'status-grey',
};

export const LIST_STATUS_LABEL = {
    draft: 'Taslak',
    submitted: 'Onayda',
    approved: 'Onaylandı',
    sent_to_finance: 'Finansta',
    completed: 'Tamamlandı',
    rejected: 'Reddedildi',
    cancelled: 'İptal',
};

export const BASIS_LABELS = {
    immediate: 'Peşin',
    on_delivery: 'Teslim Edildiğinde',
    after_invoice: 'Fatura Kesildikten Sonra',
    after_delivery: 'Teslimden Sonra',
    custom: 'Diğer',
};

export const BASIS_OPTIONS = [
    { value: 'immediate', label: 'Peşin / Avans' },
    { value: 'all', label: 'Tümü' },
    { value: 'on_delivery', label: 'Teslim Edildiğinde' },
    { value: 'after_invoice', label: 'Fatura Kesildikten Sonra' },
    { value: 'after_delivery', label: 'Teslimden Sonra' },
    { value: 'custom', label: 'Diğer' },
];

export const CURRENCY_OPTIONS = ['TRY', 'EUR', 'USD', 'GBP'].map((c) => ({ value: c, label: c }));

export const LIST_STATUS_OPTIONS = [
    { value: 'open', label: 'Açık (taslak, onayda, onaylı, finansta)' },
    { value: 'draft', label: 'Taslak' },
    { value: 'submitted', label: 'Onayda' },
    { value: 'approved', label: 'Onaylandı' },
    { value: 'sent_to_finance', label: 'Finansta' },
    { value: 'completed', label: 'Tamamlandı' },
    { value: 'rejected', label: 'Reddedildi' },
    { value: 'cancelled', label: 'İptal' },
];

export function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

export function fmtMoney(value, currency = 'TRY') {
    const n = num(value);
    if (n === null) return '-';
    try {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency', currency: currency || 'TRY',
            minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(n);
    } catch (_) {
        return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || ''}`.trim();
    }
}

export const fmtEur = (value) => fmtMoney(value, 'EUR');

export function fmtRate(value) {
    const n = num(value);
    return n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function fmtPct(value) {
    const n = num(value);
    return n === null ? '-' : `%${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(value) {
    return value ? formatDate(value) : '-';
}

export function fmtDateTime(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function todayIso() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function badge(cls, text, title = '') {
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<span class="status-badge ${cls}" style="min-width:auto"${t}>${escapeHtml(text)}</span>`;
}

export function listStatusBadge(status, label) {
    return badge(LIST_STATUS_CLASS[status] || 'status-grey', label || LIST_STATUS_LABEL[status] || status || '-');
}

export function customersOf(row) {
    const names = (row.jobs || []).map((j) => j.customer_short_name || j.customer_name).filter(Boolean);
    return [...new Set(names)];
}

export function jobNosOf(row) {
    return (row.jobs || []).map((j) => j.job_no).filter(Boolean);
}

export function rowEur(row) {
    return num(row.amount_eur !== undefined && row.amount_eur !== null ? row.amount_eur : row.gross_amount_eur);
}

export function sumEur(rows) {
    return (rows || []).reduce((acc, r) => acc + (rowEur(r) || 0), 0);
}

export function sumByCurrency(rows, field = 'gross_amount') {
    const out = {};
    (rows || []).forEach((r) => {
        const cur = r.currency || 'TRY';
        out[cur] = (out[cur] || 0) + (num(r[field]) || 0);
    });
    return out;
}

export function currencyBreakdown(rows, field = 'gross_amount') {
    return Object.entries(sumByCurrency(rows, field)).map(([cur, v]) => fmtMoney(v, cur)).join(' · ');
}

export function isOverdue(dateStr, paid) {
    if (!dateStr || paid) return false;
    return new Date(dateStr) < new Date(todayIso());
}

export function userLabel(user) {
    if (!user) return '-';
    if (typeof user === 'string') return user;
    return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || '-';
}
