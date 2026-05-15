import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const RECEIPTS_BASE = `${backendBase}/finance/expected-receipts/`;

async function parseErrorResponse(response, fallback) {
    try {
        const err = await response.json();
        if (typeof err === 'string') return err;
        if (err.detail) return typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        if (err.errors) {
            const parts = Object.entries(err.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
            return parts.join('; ') || fallback;
        }
        return fallback;
    } catch {
        return fallback;
    }
}

/**
 * @param {Object} filters
 * @returns {Promise<Object|Array>}
 */
export async function getExpectedReceipts(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const val = filters[key];
        if (val !== null && val !== undefined && val !== '') {
            queryParams.append(key, val);
        }
    });
    const url = queryParams.toString() ? `${RECEIPTS_BASE}?${queryParams}` : RECEIPTS_BASE;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, `HTTP error! status: ${response.status}`));
    }
    return response.json();
}

/**
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createExpectedReceipt(payload) {
    const response = await authedFetch(RECEIPTS_BASE, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Tahsilat kaydı oluşturulurken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} receiptId
 * @returns {Promise<Object>}
 */
export async function cancelExpectedReceipt(receiptId) {
    const response = await authedFetch(`${RECEIPTS_BASE}${receiptId}/cancel/`, {
        method: 'POST'
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Tahsilat iptal edilirken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} receiptId
 * @returns {Promise<Array>}
 */
export async function getExpectedReceiptInstallments(receiptId) {
    const response = await authedFetch(`${RECEIPTS_BASE}${receiptId}/installments/`);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Taksitler yüklenirken hata oluştu.'));
    }
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

/**
 * @param {string|number} receiptId
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createExpectedReceiptInstallment(receiptId, payload) {
    const response = await authedFetch(`${RECEIPTS_BASE}${receiptId}/installments/`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Taksit eklenirken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} receiptId
 * @param {string|number} installmentId
 * @returns {Promise<Object>}
 */
export async function markExpectedReceiptInstallmentReceived(receiptId, installmentId) {
    const response = await authedFetch(
        `${RECEIPTS_BASE}${receiptId}/installments/${installmentId}/mark-received/`,
        { method: 'POST' }
    );
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Taksit tahsil edilirken hata oluştu.'));
    }
    return data;
}
