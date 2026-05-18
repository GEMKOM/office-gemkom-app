import { authedFetch } from '../../authService.js';
import { backendBase } from '../../base.js';

const BASE = `${backendBase}/finance/adhoc-costs/`;

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
 * @param {Object} filters - e.g. job_order
 * @returns {Promise<Object|Array>}
 */
export async function getAdhocJobCosts(filters = {}) {
    const queryParams = new URLSearchParams();
    Object.keys(filters).forEach((key) => {
        const val = filters[key];
        if (val !== null && val !== undefined && val !== '') {
            queryParams.append(key, val);
        }
    });
    const url = queryParams.toString() ? `${BASE}?${queryParams}` : BASE;
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
export async function createAdhocJobCost(payload) {
    const response = await authedFetch(BASE, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Gider kaydı oluşturulurken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} id
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function updateAdhocJobCost(id, payload) {
    const response = await authedFetch(`${BASE}${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Gider güncellenirken hata oluştu.'));
    }
    return data;
}

/**
 * @param {string|number} id
 * @returns {Promise<null>}
 */
export async function deleteAdhocJobCost(id) {
    const response = await authedFetch(`${BASE}${id}/`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error(await parseErrorResponse(response, 'Gider silinirken hata oluştu.'));
    }
    if (response.status === 204) return null;
    try {
        return await response.json();
    } catch {
        return null;
    }
}
