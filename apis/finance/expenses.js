import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const EXPENSES_BASE = `${backendBase}/finance/expenses/`;

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
export async function getExpenses(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const val = filters[key];
        if (val !== null && val !== undefined && val !== '') {
            queryParams.append(key, val);
        }
    });
    const url = queryParams.toString() ? `${EXPENSES_BASE}?${queryParams}` : EXPENSES_BASE;
    const response = await authedFetch(url);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, `HTTP error! status: ${response.status}`));
    }
    return response.json();
}

/**
 * @param {string|number} expenseId
 * @returns {Promise<Object>}
 */
export async function getExpenseById(expenseId) {
    const response = await authedFetch(`${EXPENSES_BASE}${expenseId}/`);
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, `HTTP error! status: ${response.status}`));
    }
    return response.json();
}

/**
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createExpense(payload) {
    const response = await authedFetch(EXPENSES_BASE, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Gider kaydedilirken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} expenseId
 * @returns {Promise<Object>}
 */
export async function cancelExpense(expenseId) {
    const response = await authedFetch(`${EXPENSES_BASE}${expenseId}/cancel/`, {
        method: 'POST'
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Gider iptal edilirken hata oluştu.'));
    }
    return data;
}
