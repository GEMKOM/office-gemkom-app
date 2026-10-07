/**
 * Ödeme Listeleri (payment lists) API — pool of unpaid instalments, weekly
 * payment lists, schedule tools (split / undo / bulk mark paid) and order
 * proforma attachments. Every function resolves to the parsed JSON body and
 * throws an Error whose message is the backend's `detail` (via
 * extractErrorMessage) so pages can show it verbatim.
 */
import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';
import { extractErrorMessage } from '../procurement.js';

const PROC = `${backendBase}/procurement`;
const PLANNING = `${backendBase}/planning`;

function qs(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return;
        query.append(key, value);
    });
    const s = query.toString();
    return s ? `?${s}` : '';
}

async function call(url, { method = 'GET', body, fallback = 'Sunucu hatası' } = {}) {
    const options = { method };
    if (body instanceof FormData) {
        options.body = body;
    } else if (body !== undefined) {
        options.body = JSON.stringify(body);
    }
    const response = await authedFetch(url, options);
    if (response.status === 204) return null;
    let data = null;
    try {
        data = await response.json();
    } catch (_) {
        data = null;
    }
    if (!response.ok) {
        const error = new Error(extractErrorMessage(data, fallback));
        error.status = response.status;
        error.response = data;
        throw error;
    }
    return data;
}

// ---------------------------------------------------------------------------
// pool + schedule tools
// ---------------------------------------------------------------------------

export function getPaymentPool(params = {}) {
    return call(`${PROC}/payment-pool/${qs(params)}`, { fallback: 'Ödeme havuzu yüklenemedi' });
}

/** {job_nos, suppliers, gs_numbers}: [{value, label}] options for the pool filters. */
export function getPaymentPoolFacets() {
    return call(`${PROC}/payment-pool/facets/`, { fallback: 'Filtre seçenekleri yüklenemedi' });
}

export function splitSchedule(poId, payload) {
    return call(`${PROC}/purchase-orders/${poId}/split_schedule/`, { method: 'POST', body: payload, fallback: 'Taksit bölünemedi' });
}

export function unmarkSchedulePaid(poId, scheduleId) {
    return call(`${PROC}/purchase-orders/${poId}/unmark_schedule_paid/`, {
        method: 'POST', body: { schedule_id: scheduleId }, fallback: 'Ödeme geri alınamadı',
    });
}

export function bulkMarkSchedulesPaid(payload) {
    return call(`${PROC}/payment-schedules/bulk_mark_paid/`, { method: 'POST', body: payload, fallback: 'Toplu işaretleme başarısız' });
}

// ---------------------------------------------------------------------------
// proformas (order attachments)
// ---------------------------------------------------------------------------

export function listPoAttachments(poId) {
    return call(`${PROC}/purchase-orders/${poId}/attachments/`, { fallback: 'Dosyalar yüklenemedi' });
}

export function uploadPoAttachment(poId, file, description = 'proforma') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('description', description || 'proforma');
    return call(`${PROC}/purchase-orders/${poId}/attachments/`, { method: 'POST', body: fd, fallback: 'Dosya yüklenemedi' });
}

export function deleteAttachment(attachmentId) {
    return call(`${PLANNING}/attachments/${attachmentId}/`, { method: 'DELETE', fallback: 'Dosya silinemedi' });
}

// ---------------------------------------------------------------------------
// lists
// ---------------------------------------------------------------------------

const LISTS = `${PROC}/payment-lists/`;

export function getPaymentLists(params = {}) {
    return call(`${LISTS}${qs(params)}`, { fallback: 'Ödeme listeleri yüklenemedi' });
}

export function getPaymentList(id) {
    return call(`${LISTS}${id}/`, { fallback: 'Ödeme listesi yüklenemedi' });
}

export function createPaymentList(payload) {
    return call(LISTS, { method: 'POST', body: payload, fallback: 'Liste oluşturulamadı' });
}

export function updatePaymentList(id, patch) {
    return call(`${LISTS}${id}/`, { method: 'PATCH', body: patch, fallback: 'Liste güncellenemedi' });
}

export function deletePaymentList(id) {
    return call(`${LISTS}${id}/`, { method: 'DELETE', fallback: 'Liste silinemedi' });
}

export function addPaymentListItems(id, scheduleIds) {
    return call(`${LISTS}${id}/items/`, { method: 'POST', body: { schedule_ids: scheduleIds }, fallback: 'Kalemler eklenemedi' });
}

export function updatePaymentListItem(id, itemId, patch) {
    return call(`${LISTS}${id}/items/${itemId}/`, { method: 'PATCH', body: patch, fallback: 'Kalem güncellenemedi' });
}

export function removePaymentListItem(id, itemId) {
    return call(`${LISTS}${id}/items/${itemId}/`, { method: 'DELETE', fallback: 'Kalem silinemedi' });
}

export function excludePaymentListItem(id, itemId, reason = '') {
    return call(`${LISTS}${id}/items/${itemId}/exclude/`, { method: 'POST', body: { reason }, fallback: 'Kalem çıkarılamadı' });
}

export function includePaymentListItem(id, itemId) {
    return call(`${LISTS}${id}/items/${itemId}/include/`, { method: 'POST', body: {}, fallback: 'Kalem geri alınamadı' });
}

export function markPaymentListItemPaid(id, itemId, payload) {
    return call(`${LISTS}${id}/items/${itemId}/mark_paid/`, { method: 'POST', body: payload, fallback: 'Ödeme işaretlenemedi' });
}

export function unmarkPaymentListItemPaid(id, itemId) {
    return call(`${LISTS}${id}/items/${itemId}/unmark_paid/`, { method: 'POST', body: {}, fallback: 'Ödeme geri alınamadı' });
}

export function submitPaymentList(id) {
    return call(`${LISTS}${id}/submit/`, { method: 'POST', body: {}, fallback: 'Liste onaya gönderilemedi' });
}

export function decidePaymentList(id, { approve, comment = '' }) {
    return call(`${LISTS}${id}/decide/`, { method: 'POST', body: { approve, comment }, fallback: 'Karar kaydedilemedi' });
}

export function sendPaymentListToFinance(id) {
    return call(`${LISTS}${id}/send_to_finance/`, { method: 'POST', body: {}, fallback: 'Liste finansa gönderilemedi' });
}

export function resendFinanceEmail(id) {
    return call(`${LISTS}${id}/resend_finance_email/`, { method: 'POST', body: {}, fallback: 'E-posta gönderilemedi' });
}

export function completePaymentList(id) {
    return call(`${LISTS}${id}/complete/`, { method: 'POST', body: {}, fallback: 'Liste tamamlanamadı' });
}

export function cancelPaymentList(id, reason = '') {
    return call(`${LISTS}${id}/cancel/`, { method: 'POST', body: { reason }, fallback: 'Liste iptal edilemedi' });
}

export function refreshPaymentListFx(id) {
    return call(`${LISTS}${id}/refresh_fx/`, { method: 'POST', body: {}, fallback: 'Kur güncellenemedi' });
}

export function refreshPaymentListAmounts(id) {
    return call(`${LISTS}${id}/refresh_amounts/`, { method: 'POST', body: {}, fallback: 'Tutarlar yenilenemedi' });
}
