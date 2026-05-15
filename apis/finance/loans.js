import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const LOANS_BASE = `${backendBase}/finance/loans/`;

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
export async function getLoans(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const val = filters[key];
        if (val !== null && val !== undefined && val !== '') {
            queryParams.append(key, val);
        }
    });
    const url = queryParams.toString() ? `${LOANS_BASE}?${queryParams}` : LOANS_BASE;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, `HTTP error! status: ${response.status}`));
    }
    return response.json();
}

/**
 * @param {string|number} loanId
 * @returns {Promise<Object>}
 */
export async function getLoanById(loanId) {
    const response = await authedFetch(`${LOANS_BASE}${loanId}/`);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, `HTTP error! status: ${response.status}`));
    }
    return response.json();
}

/**
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createLoan(payload) {
    const response = await authedFetch(LOANS_BASE, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Kredi kaydedilirken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} loanId
 * @returns {Promise<Object>}
 */
export async function cancelLoan(loanId) {
    const response = await authedFetch(`${LOANS_BASE}${loanId}/cancel/`, {
        method: 'POST'
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Kredi iptal edilirken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} loanId
 * @returns {Promise<Array>}
 */
export async function getLoanInstallments(loanId) {
    const response = await authedFetch(`${LOANS_BASE}${loanId}/installments/`);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Taksitler yüklenirken hata oluştu.'));
    }
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
}

/**
 * @param {string|number} loanId
 * @param {string|number} installmentId
 * @returns {Promise<Object>}
 */
export async function markLoanInstallmentPaid(loanId, installmentId) {
    const response = await authedFetch(
        `${LOANS_BASE}${loanId}/installments/${installmentId}/mark-paid/`,
        { method: 'POST' }
    );
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Taksit ödenirken hata oluştu.'));
    }
    return data;
}
